/// <reference lib="webworker" />
/**
 * 상성 코치 워커
 *
 * Transformers.js 로 Qwen3 4B 를 WebGPU 에서 돌린다.
 * 모델 적재는 한 번만 하고 이후 생성 요청을 받아 토큰을 흘려보낸다.
 *
 * 브라우저 캐시에 파일이 남으므로 두 번째 방문부터는 내려받기가 없다.
 * 진행률은 파일 단위로 모아 보낸다. 파일이 여러 개라 개별로 보내면 화면이 튄다.
 */
import {
  env,
  AutoModelForCausalLM,
  AutoTokenizer,
  InterruptableStoppingCriteria,
  TextStreamer,
  Tensor,
  type PreTrainedModel,
  type PreTrainedTokenizer,
} from "@huggingface/transformers";
import { FALLBACK_MODEL, MAX_NEW_TOKENS, NO_REPEAT_NGRAM } from "@/lib/advisor/config";
import { createLoopGuard, trimLoop } from "@/lib/advisor/loopGuard";
import { encodeJudgeRow, JUDGE_SPECIAL, type JudgeQuestion } from "@/lib/advisor/judge";
import type {
  AdvisorFileProgress,
  AdvisorModelSpec,
  AdvisorRequest,
  AdvisorResponse,
} from "@/lib/advisor/protocol";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

// ONNX Runtime 런타임을 우리 출처에서 받는다.
// 기본값은 jsDelivr 인데, 제3자 CDN 이 막힌 환경에서 상성 코치가 통째로 죽는다.
// 파일은 `npm run prepare-ort` 가 node_modules 에서 public/ort/ 로 복사한다.
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.wasmPaths = `${import.meta.env.BASE_URL}ort/`;
}

function post(message: AdvisorResponse) {
  ctx.postMessage(message);
}

let tokenizer: PreTrainedTokenizer | null = null;
let model: PreTrainedModel | null = null;
let loading: Promise<void> | null = null;
/** 생성 중단 스위치. 라이브러리가 매 토큰마다 확인한다. */
let stopper = new InterruptableStoppingCriteria();

const progressByFile = new Map<string, AdvisorFileProgress>();

function reportProgress() {
  const files = [...progressByFile.values()];
  const loadedBytes = files.reduce((sum, f) => sum + f.loaded, 0);
  const totalBytes = files.reduce((sum, f) => sum + f.total, 0);
  post({ type: "progress", files, loadedBytes, totalBytes });
}

interface HfProgress {
  status: string;
  file?: string;
  loaded?: number;
  total?: number;
}

function onProgress(event: HfProgress) {
  if (!event.file) return;
  if (event.status === "progress" || event.status === "download") {
    progressByFile.set(event.file, {
      file: event.file,
      loaded: event.loaded ?? 0,
      total: event.total ?? 0,
    });
    reportProgress();
  } else if (event.status === "done") {
    const current = progressByFile.get(event.file);
    if (current) {
      progressByFile.set(event.file, { ...current, loaded: current.total });
      reportProgress();
    }
  }
}

async function load(spec: AdvisorModelSpec): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    tokenizer = await AutoTokenizer.from_pretrained(spec.id, {
      progress_callback: onProgress,
    });
    // dtype 은 문자열 하나로 준다. 모듈마다 다른 값을 주면 세션 구성이 어긋난다.
    model = await AutoModelForCausalLM.from_pretrained(spec.id, {
      dtype: spec.dtype as "q4f16",
      device: "webgpu",
      progress_callback: onProgress,
    });
    post({ type: "loaded" });
  })();
  return loading;
}

/** 가벼운 모델 프롬프트 상한. 죽는 선(약 2,120)에서 여유를 둔다. */
const LITE_PROMPT_LIMIT = 1900;

async function generate(
  id: number,
  spec: AdvisorModelSpec,
  messages: Array<{ role: string; content: string }>,
  system?: string,
  tools?: unknown[],
  maxTokens?: number,
  loopGuard = true,
) {
  await load(spec);
  if (!tokenizer || !model) throw new Error("모델이 준비되지 않았습니다");

  stopper = new InterruptableStoppingCriteria();
  // Qwen3 계열은 사고 모드를 켤 수 있다. 켜 두면 답변 앞에 추론 과정을 길게 뱉어
  // 브라우저에서 체감 지연이 몇 배가 된다. 상성 조언은 형식이 정해져 있으므로 끈다.
  const encode = (history: typeof messages, systemText: string | undefined) =>
    tokenizer!.apply_chat_template(systemText ? [{ role: "system", content: systemText }, ...history] : history, {
      add_generation_prompt: true,
      return_dict: true,
      enable_thinking: false,
      // 도구를 넘기면 템플릿이 선언을 앞에 붙이고, 모델은 `<|tool_call>call:이름{…}` 으로 답한다.
      ...(tools && tools.length ? { tools } : {}),
    } as Parameters<PreTrainedTokenizer["apply_chat_template"]>[1]) as Record<string, unknown>;
  const lengthOf = (encoded: Record<string, unknown>) => ((dims: number[]) => dims[dims.length - 1] ?? 0)((encoded.input_ids as { dims: number[] }).dims);
  let inputs = encode(messages, system);
  /*
   * 가벼운 모델은 프롬프트가 약 2,120토큰을 넘으면 WebGPU 실행이 "SafeIntOnOverflow" 로
   * 죽는다(2,113 은 되고 2,180 은 안 됐다). 생성 길이와는 무관하고 첫 읽기 길이만 문제다.
   * 챔피언 셋의 요약을 실은 질문이 약 2,300토큰이라 화면에 오류가 그대로 떴다.
   *
   * 넘치면 오래된 대화부터 뺀다. 그래도 넘치면 시스템 글의 뒤쪽을 자른다 — 재료가 줄어도
   * 답이 나오는 편이 오류보다 낫다.
   */
  if (spec.id === FALLBACK_MODEL.id && lengthOf(inputs) > LITE_PROMPT_LIMIT) {
    let history = messages;
    while (history.length > 1 && lengthOf(inputs) > LITE_PROMPT_LIMIT) {
      history = history.slice(history.length > 2 ? 2 : 1);
      inputs = encode(history, system);
    }
    let systemText = system;
    while (systemText && lengthOf(inputs) > LITE_PROMPT_LIMIT) {
      systemText = systemText.slice(0, Math.floor(systemText.length * 0.85));
      inputs = encode(history, systemText);
    }
  }

  let text = "";
  let tokens = 0;
  const startedAt = performance.now();
  /**
   * 첫 토큰이 나온 시각.
   *
   * 전체 시간만 재면 프롬프트를 읽는 시간(prefill)과 글을 쓰는 시간(decode)이
   * 뭉뚱그려진다. 해설 프롬프트는 페르소나·재료·노트가 붙어 길기 때문에 그 둘을
   * 갈라야 "모델이 느린가, 프롬프트가 긴가" 를 판단할 수 있다.
   */
  let firstTokenAt = 0;

  /**
   * 같은 말을 되풀이하기 시작하면 끊는다.
   *
   * 이 크기의 모델은 탐욕 복호화에서 자주 고리에 빠진다. 종료 토큰이 안 나오므로
   * 상한에 닿을 때까지 멈추지 않는다. 무엇을 되풀이로 보는지는 `loopGuard` 에 적었다.
   */
  const guard = createLoopGuard();
  let looped = false;

  const streamer = new TextStreamer(tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (chunk: string) => {
      if (firstTokenAt === 0) firstTokenAt = performance.now();
      text += chunk;
      tokens += 1;
      post({ type: "chunk", id, text: chunk });
      if (loopGuard && !looped && guard.feed(chunk)) {
        looped = true;
        stopper.interrupt();
      }
    },
  });

  await model.generate({
    ...inputs,
    max_new_tokens: maxTokens ?? MAX_NEW_TOKENS,
    do_sample: false,
    // 탐욕 복호화만으로는 같은 구절을 반복해 찍는다. 살짝만 눌러 준다. 크게 주면
    // 스킬 이름처럼 되풀이해야 하는 낱말까지 피하려 들어 글이 이상해진다.
    repetition_penalty: 1.1,
    /*
     * 같은 20토큰이 두 번 나오지 못하게 한다. 끊는 것보다 앞에서 막는다.
     *
     * 라이브러리는 프롬프트까지 합친 전체에서 n-gram 을 센다. 그래서 값이 작으면
     * 재료에 적힌 스킬 이름조차 옮겨 적지 못한다. 카드 865개 스킬의 "챔피언 슬롯 이름"
     * 은 중앙값 8토큰, 가장 긴 것이 18토큰("유나라 W 심판의 궤적 | 파멸의 궤적")이다.
     * 되풀이 한 바퀴는 18토큰 남짓이었다("1레벨 기준 전체 챔피언 중 하위권이라는 점,
     * 그리고 오공이 "). 20 이면 이름은 막지 않고 바퀴는 두 번째에서 막힌다.
     */
    no_repeat_ngram_size: NO_REPEAT_NGRAM,
    streamer,
    // 중단 요청이 오면 다음 토큰에서 멈춘다
    stopping_criteria: stopper,
  } as Parameters<PreTrainedModel["generate"]>[0]);

  const finishedAt = performance.now();
  const dims = (inputs as { input_ids?: { dims?: number[] } }).input_ids?.dims;
  const promptTokens = Array.isArray(dims) && dims.length > 0 ? dims[dims.length - 1] : 0;

  post({
    type: "done",
    id,
    // 끊었으면 되풀이한 꼬리를 걷어 낸 글로 바꾼다. 화면은 흘려 받은 조각 대신 이것을 쓴다.
    text: looped ? trimLoop(text) : text,
    looped,
    tokens,
    seconds: (finishedAt - startedAt) / 1000,
    // 첫 토큰까지 = 프롬프트를 읽는 시간. 나머지가 글을 쓰는 시간이다.
    ttftSeconds: firstTokenAt ? (firstTokenAt - startedAt) / 1000 : undefined,
    promptTokens: promptTokens || undefined,
  });
}

type Cache = Record<string, Tensor>;

const dispose = (cache: Cache) => {
  for (const tensor of Object.values(cache)) (tensor as Tensor & { dispose?: () => void }).dispose?.();
};

/**
 * 판정기가 읽은 질문 글의 상태.
 *
 * 한 질문에 판정을 여럿 한다(갈래·내 챔피언·주제). 모두 같은 질문 글로 시작하므로 그 부분은
 * 한 번만 읽고 이어 쓴다. 입력으로 넘긴 텐서를 실행기가 고치지 않으므로 여러 갈래가
 * 같은 상태에서 출발해도 안전하다. 모델을 다시 올리면 버린다.
 *
 * 줄어드는 시간은 크지 않다(주제 판정 문항당 0.78 → 0.80초로 사실상 같다). 질문 글은
 * 20토큰 남짓이고, 시간 대부분은 선택지 설명을 판정 위치마다 끊어 넣는 데 든다. 선택지는
 * 질문 글 뒤에 오므로 미리 계산해 둘 수 없다.
 */
let judgePrefix: { key: string; length: number; cache: Cache } | null = null;

function clearJudgePrefix() {
  if (judgePrefix) dispose(judgePrefix.cache);
  judgePrefix = null;
}

/** 조각 하나를 넣는다. 마지막 위치의 logits 한 줄과 이어 갈 상태를 돌려준다. */
async function step(chunk: number[], total: number, past: Cache | undefined) {
  const result = (await model!.forward({
    input_ids: new Tensor("int64", BigInt64Array.from(chunk.map(BigInt)), [1, chunk.length]),
    attention_mask: new Tensor("int64", new BigInt64Array(total).fill(1n), [1, total]),
    num_logits_to_keep: new Tensor("int64", [1n], []),
    // 첫 조각에는 넘기지 않는다. 빈 객체를 주면 라이브러리가 캐시로 알고 .update() 를 부른다.
    ...(past ? { past_key_values: past } : {}),
  })) as Record<string, Tensor>;
  const next: Cache = {};
  // 이름만 present → past 로 바꾼다
  for (const [name, tensor] of Object.entries(result)) {
    if (!name.startsWith("present")) continue;
    next[name.replace("present_conv", "past_conv").replace("present_recurrent", "past_recurrent").replace("present", "past_key_values")] = tensor;
  }
  return { logits: result.logits, next };
}

/**
 * 판정 위치의 특징을 뽑는다.
 *
 * 판정 위치마다 그 위치가 마지막 토큰이 되도록 입력을 끊어 넣고, 앞 조각의 상태를 이어
 * 받는다. 그러면 위치마다 logits 한 줄(1MB)만 GPU 에서 내려온다. 한 번에 넣고 모든 위치의
 * logits 를 받으면 길이 150 에 150MB 다.
 *
 * 생성과 같은 세션을 쓴다. 모델을 두 번 올리지 않는다.
 */
async function judge(id: number, spec: AdvisorModelSpec, state: string, questions: JudgeQuestion[], subset: number[]) {
  await load(spec);
  if (!tokenizer || !model) throw new Error("모델이 준비되지 않았습니다");
  const started = performance.now();
  const special = tokenizer.convert_tokens_to_ids([...JUDGE_SPECIAL]) as number[];
  // 사용자 글이 구분 토큰을 흉내 내도 특수 토큰이 되지 않게 한다(kev 와 같은 처리).
  const tokenize = (text: string) =>
    tokenizer!.encode(text.replace(/<\|(\w+)\|>/g, "<¦$1¦>"), { add_special_tokens: false }) as number[];

  // 질문 글 부분(<state> …)을 한 번만 읽는다. 앞선 판정과 같은 글이면 그 상태를 그대로 쓴다.
  const prefixIds = [special[0], ...tokenize(state)];
  const key = `${spec.id}:${spec.dtype}:${prefixIds.join(",")}`;
  if (judgePrefix?.key !== key) {
    clearJudgePrefix();
    const { next } = await step(prefixIds, prefixIds.length, undefined);
    judgePrefix = { key, length: prefixIds.length, cache: next };
  }
  const prefix = judgePrefix!;

  const features: Float32Array[] = [];
  for (const question of questions) {
    const row = encodeJudgeRow(tokenize, special, state, question);
    const out = new Float32Array(row.positions.length * subset.length);
    let past: Cache = prefix.cache;
    let start = prefix.length;
    for (const [k, position] of row.positions.entries()) {
      const { logits, next } = await step(row.ids.slice(start, position + 1), position + 1, past);
      const data = logits.data as Float32Array;
      const last = data.length - logits.dims[logits.dims.length - 1];
      for (const [j, token] of subset.entries()) out[k * subset.length + j] = data[last + token];
      // 질문 글의 상태는 다음 판정이 또 쓰므로 지우지 않는다
      if (past !== prefix.cache) dispose(past);
      past = next;
      start = position + 1;
    }
    if (past !== prefix.cache) dispose(past);
    features.push(out);
  }
  ctx.postMessage(
    { type: "judged", id, features, seconds: (performance.now() - started) / 1000 } satisfies AdvisorResponse,
    features.map((f) => f.buffer),
  );
}

ctx.addEventListener("message", (event: MessageEvent<AdvisorRequest>) => {
  const request = event.data;
  if (request.type === "load") {
    load(request.model).catch((error: unknown) => {
      post({ type: "error", message: (error as Error).message });
    });
    return;
  }
  if (request.type === "judge") {
    judge(request.id, request.model, request.state, request.questions, request.subset).catch((error: unknown) => {
      const message = (error as Error).message;
      // 생성과 같다 — GPU 가 한 번 깨지면 쥐고 있던 것을 놓아야 다음 요청이 모델을 다시 올린다
      if (/OrtRun|buffer|webgpu|device|GPU/i.test(message)) {
        judgePrefix = null;
        model = null;
        tokenizer = null;
        loading = null;
      }
      post({ type: "error", id: request.id, message });
    });
    return;
  }
  if (request.type === "stop") {
    stopper.interrupt();
    return;
  }
  if (request.type === "generate") {
    generate(request.id, request.model, request.messages, request.system, request.tools, request.maxTokens, request.loopGuard ?? true).catch((error: unknown) => {
      const message = (error as Error).message;
      /*
       * GPU 쪽이 한 번 깨지면 세션이 살아 있어도 못 쓴다.
       *
       * WebGPU 버퍼가 무효가 되면 그 뒤 모든 실행이 같은 오류로 떨어진다
       * ("is invalid due to a previous error"). 그런데 우리는 적재한 모델을 모듈에
       * 쥐고 있어서, 사용자가 다시 물어도 같은 세션으로 가 똑같이 실패했다. 새로고침
       * 말고는 길이 없었다.
       *
       * 그래서 GPU 오류에서는 쥐고 있던 것을 놓는다. 다음 질문이 모델을 다시 올린다.
       * 파일은 브라우저 캐시에 있으므로 내려받기를 다시 하지는 않는다.
       */
      if (/OrtRun|buffer|webgpu|device|GPU/i.test(message)) {
        judgePrefix = null;
        model = null;
        tokenizer = null;
        loading = null;
      }
      post({ type: "error", id: request.id, message });
    });
  }
});

post({ type: "ready" });
