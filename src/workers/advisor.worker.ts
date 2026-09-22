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
  type PreTrainedModel,
  type PreTrainedTokenizer,
} from "@huggingface/transformers";
import { MAX_NEW_TOKENS } from "@/lib/advisor/config";
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

async function generate(
  id: number,
  spec: AdvisorModelSpec,
  messages: Array<{ role: string; content: string }>,
  system?: string,
  tools?: unknown[],
  maxTokens?: number,
) {
  await load(spec);
  if (!tokenizer || !model) throw new Error("모델이 준비되지 않았습니다");

  stopper = new InterruptableStoppingCriteria();
  const chat = system ? [{ role: "system", content: system }, ...messages] : messages;
  // Qwen3 계열은 사고 모드를 켤 수 있다. 켜 두면 답변 앞에 추론 과정을 길게 뱉어
  // 브라우저에서 체감 지연이 몇 배가 된다. 상성 조언은 형식이 정해져 있으므로 끈다.
  const inputs = tokenizer.apply_chat_template(chat, {
    add_generation_prompt: true,
    return_dict: true,
    enable_thinking: false,
    // 도구를 넘기면 템플릿이 선언을 앞에 붙이고, 모델은 `<|tool_call>call:이름{…}` 으로 답한다.
    ...(tools && tools.length ? { tools } : {}),
  } as Parameters<PreTrainedTokenizer["apply_chat_template"]>[1]) as Record<string, unknown>;

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
   * 이 크기의 모델은 탐욕 복호화에서 자주 고리에 빠진다. 실제로 "오공은 P 바위
   * 피부 스킬을 사용합니다 …" 여섯 문장이 끝없이 되풀이되어 화면을 채웠다.
   * 종료 토큰이 안 나오므로 상한(8192)에 닿을 때까지 멈추지 않는다.
   *
   * 같은 문장이 세 번 나오면 고장난 것으로 본다. 두 번은 강조하느라 그럴 수
   * 있지만 세 번은 아니다. 문장 단위라서 멀쩡한 글을 자를 위험이 낮다.
   */
  const said = new Map<string, number>();
  let looped = false;
  const looping = (whole: string): boolean => {
    const parts = whole.split(/(?<=다\.)\s+/);
    // 마지막 조각은 아직 쓰는 중이라 세지 않는다
    for (const part of parts.slice(0, -1)) {
      const key = part.trim();
      if (key.length < 12) continue;
      const seen = (said.get(key) ?? 0) + 1;
      said.set(key, seen);
      if (seen >= 3) return true;
    }
    return false;
  };

  const streamer = new TextStreamer(tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (chunk: string) => {
      if (firstTokenAt === 0) firstTokenAt = performance.now();
      text += chunk;
      tokens += 1;
      post({ type: "chunk", id, text: chunk });
      if (!looped && chunk.includes("다.")) {
        said.clear();
        if (looping(text)) {
          looped = true;
          stopper.interrupt();
        }
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
    text,
    tokens,
    seconds: (finishedAt - startedAt) / 1000,
    // 첫 토큰까지 = 프롬프트를 읽는 시간. 나머지가 글을 쓰는 시간이다.
    ttftSeconds: firstTokenAt ? (firstTokenAt - startedAt) / 1000 : undefined,
    promptTokens: promptTokens || undefined,
  });
}

ctx.addEventListener("message", (event: MessageEvent<AdvisorRequest>) => {
  const request = event.data;
  if (request.type === "load") {
    load(request.model).catch((error: unknown) => {
      post({ type: "error", message: (error as Error).message });
    });
    return;
  }
  if (request.type === "stop") {
    stopper.interrupt();
    return;
  }
  if (request.type === "generate") {
    generate(request.id, request.model, request.messages, request.system, request.tools, request.maxTokens).catch((error: unknown) => {
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
        model = null;
        tokenizer = null;
        loading = null;
      }
      post({ type: "error", id: request.id, message });
    });
  }
});

post({ type: "ready" });
