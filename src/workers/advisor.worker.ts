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
import { env, Tensor } from "@huggingface/transformers";
import { encodeJudgeRow, JUDGE_SPECIAL, type JudgeQuestion } from "@/lib/advisor/judge";
import type { AdvisorModelSpec } from "@/lib/advisor/protocol";
import { generate, stopGeneration } from "./advisor/generate";
import { activeGates, forgetLoraSession, gates, getLoraSession, type OrtFeeds, type OrtSession, ortTensor } from "./advisor/lora";
import { getModel, getTokenizer, load, releaseModel } from "./advisor/model";
import { onRequest, post } from "./advisor/port";

// ONNX Runtime 런타임을 우리 출처에서 받는다.
// 기본값은 jsDelivr 인데, 제3자 CDN 이 막힌 환경에서 상성 코치가 통째로 죽는다.
// 파일은 `npm run prepare-ort` 가 node_modules 에서 public/ort/ 로 복사한다.
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.wasmPaths = `${import.meta.env.BASE_URL}ort/`;
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

function forgetJudgePrefix() {
  judgePrefix = null;
}

/** 조각 하나를 넣는다. 마지막 위치의 logits 한 줄과 이어 갈 상태를 돌려준다. */
async function step(chunk: number[], total: number, past: Cache | undefined) {
  const result = (await getModel()!.forward({
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
  const tokenizer = getTokenizer();
  if (!tokenizer || !getModel()) throw new Error("모델이 준비되지 않았습니다");
  const started = performance.now();
  const special = tokenizer.convert_tokens_to_ids([...JUDGE_SPECIAL]) as number[];
  // 사용자 글이 구분 토큰을 흉내 내도 특수 토큰이 되지 않게 한다(kev 와 같은 처리).
  const tokenize = (text: string) =>
    getTokenizer()!.encode(text.replace(/<\|(\w+)\|>/g, "<¦$1¦>"), { add_special_tokens: false }) as number[];

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
  post(
    { type: "judged", id, features, seconds: (performance.now() - started) / 1000 },
    features.map((f) => f.buffer),
  );
}

// ---- kev 판정: 은닉 상태 + LoRA ------------------------------------------------------------

let emptyPast: OrtFeeds | null = null;
let hiddenPrefix: { key: string; length: number; cache: OrtFeeds } | null = null;

const disposeOrt = (cache: OrtFeeds) => {
  for (const tensor of Object.values(cache)) tensor.dispose?.();
};

/**
 * 첫 조각에 넣을 빈 상태. 모양은 모델이 한 번 돌며 내놓은 상태에서 읽는다 — 합성곱·순환 상태는 고정 모양의 0,
 * 키·값은 길이 0 이다. 한 번만 만든다.
 */
async function emptyState(): Promise<OrtFeeds> {
  if (emptyPast) return emptyPast;
  const Ort = ortTensor();
  const probe = (await getModel()!.forward({
    input_ids: new Tensor("int64", BigInt64Array.from([0n]), [1, 1]),
    attention_mask: new Tensor("int64", BigInt64Array.from([1n]), [1, 1]),
    num_logits_to_keep: new Tensor("int64", [1n], []),
  })) as Record<string, Tensor>;
  const out: OrtFeeds = {};
  for (const [name, tensor] of Object.entries(probe)) {
    if (!name.startsWith("present")) continue;
    const past = name.replace("present_conv", "past_conv").replace("present_recurrent", "past_recurrent").replace("present", "past_key_values");
    const dims = [...tensor.dims];
    if (name.startsWith("present.")) dims[2] = 0;
    const size = dims.reduce((a, b) => a * b, 1);
    out[past] = new Ort(tensor.type, tensor.type === "float16" ? new Uint16Array(size) : new Float32Array(size), dims);
    (tensor as Tensor & { dispose?: () => void }).dispose?.();
  }
  emptyPast = out;
  return out;
}

/** 조각 하나를 LoRA 를 켜고 넣는다. 마지막 위치의 은닉 상태와 이어 갈 상태. transformers.js 는 모르는 입력(lora_scale)을 걸러 버려 세션을 직접 부른다. */
async function stepHidden(chunk: number[], total: number, past: OrtFeeds) {
  const Ort = ortTensor();
  const session = getLoraSession() ?? (getModel() as unknown as { sessions: Record<string, OrtSession> }).sessions.model;
  const outputs = await session.run({
    input_ids: new Ort("int64", BigInt64Array.from(chunk.map(BigInt)), [1, chunk.length]),
    attention_mask: new Ort("int64", new BigInt64Array(total).fill(1n), [1, total]),
    num_logits_to_keep: new Ort("int64", BigInt64Array.from([1n]), []),
    ...(activeGates().length ? gates({ lora_scale: 1 }) : { lora_scale: new Ort("float32", Float32Array.from([1]), []) }),
    ...past,
  });
  const hidden = Float32Array.from((await outputs.hidden.getData()) as Float32Array);
  const next: OrtFeeds = {};
  for (const [name, tensor] of Object.entries(outputs)) {
    if (name.startsWith("present")) {
      next[name.replace("present_conv", "past_conv").replace("present_recurrent", "past_recurrent").replace("present", "past_key_values")] = tensor;
    } else {
      tensor.dispose?.();
    }
  }
  return { hidden: hidden.subarray(hidden.length - 1024), next };
}

async function judgeHidden(id: number, spec: AdvisorModelSpec, state: string, questions: JudgeQuestion[]) {
  await load(spec);
  const tokenizer = getTokenizer();
  if (!tokenizer || !getModel()) throw new Error("모델이 준비되지 않았습니다");
  const started = performance.now();
  const special = tokenizer.convert_tokens_to_ids([...JUDGE_SPECIAL]) as number[];
  const tokenize = (text: string) =>
    getTokenizer()!.encode(text.replace(/<\|(\w+)\|>/g, "<¦$1¦>"), { add_special_tokens: false }) as number[];
  const prefixIds = [special[0], ...tokenize(state)];
  const key = `${spec.id}:${spec.graph}:${prefixIds.join(",")}`;
  if (hiddenPrefix?.key !== key) {
    if (hiddenPrefix) disposeOrt(hiddenPrefix.cache);
    const { next } = await stepHidden(prefixIds, prefixIds.length, await emptyState());
    hiddenPrefix = { key, length: prefixIds.length, cache: next };
  }
  const prefix = hiddenPrefix!;
  const features: Float32Array[] = [];
  for (const question of questions) {
    const row = encodeJudgeRow(tokenize, special, state, question);
    const out = new Float32Array(row.positions.length * 1024);
    let past = prefix.cache;
    let start = prefix.length;
    for (const [k, position] of row.positions.entries()) {
      const { hidden, next } = await stepHidden(row.ids.slice(start, position + 1), position + 1, past);
      out.set(hidden, k * 1024);
      if (past !== prefix.cache) disposeOrt(past);
      past = next;
      start = position + 1;
    }
    if (past !== prefix.cache) disposeOrt(past);
    features.push(out);
  }
  post(
    { type: "judged", id, features, seconds: (performance.now() - started) / 1000 },
    features.map((f) => f.buffer),
  );
}

/**
 * 검색 벡터. 요약 프롬프트로 싼 글을 한 번 읽고(검색 LoRA 켬, 판정 LoRA 끔) 마지막 자리를 정규화한다.
 * 문서 벡터(`doc-vectors.bin`)를 만든 계산(`scripts/llm/vector-search/dual_graph_check.py`)과 같다.
 */
async function embedText(id: number, spec: AdvisorModelSpec, text: string) {
  await load(spec);
  const tokenizer = getTokenizer();
  const loraSession = getLoraSession();
  if (!tokenizer || !getModel() || !loraSession || !activeGates().includes("embed_scale")) throw new Error("검색 LoRA 가 없는 그래프입니다");
  const started = performance.now();
  const Ort = ortTensor();
  const ids = (tokenizer.encode(text, { add_special_tokens: false }) as number[]).slice(0, 512);
  const outputs = await loraSession.run({
    input_ids: new Ort("int64", BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
    attention_mask: new Ort("int64", new BigInt64Array(ids.length).fill(1n), [1, ids.length]),
    num_logits_to_keep: new Ort("int64", BigInt64Array.from([1n]), []),
    ...gates({ embed_scale: 1 }),
    ...(await emptyState()),
  });
  const hidden = (await outputs.hidden.getData()) as Float32Array;
  for (const tensor of Object.values(outputs)) tensor.dispose?.();
  const vector = Float32Array.from(hidden.subarray(hidden.length - 1024));
  const norm = Math.hypot(...vector) || 1;
  for (let i = 0; i < vector.length; i += 1) vector[i] /= norm;
  post({ type: "embedded", id, vector, seconds: (performance.now() - started) / 1000 }, [vector.buffer]);
}

function forgetLoraFeatures() {
  hiddenPrefix = null;
  emptyPast = null;
}

onRequest((request) => {
  if (request.type === "load") {
    load(request.model).catch((error: unknown) => {
      post({ type: "error", message: (error as Error).message });
    });
    return;
  }
  if (request.type === "judge") {
    (request.feature === "hidden"
      ? judgeHidden(request.id, request.model, request.state, request.questions)
      : judge(request.id, request.model, request.state, request.questions, request.subset)
    ).catch((error: unknown) => {
      const message = (error as Error).message;
      // 생성과 같다 — GPU 가 한 번 깨지면 쥐고 있던 것을 놓아야 다음 요청이 모델을 다시 올린다
      if (/OrtRun|buffer|webgpu|device|GPU/i.test(message)) {
        forgetJudgePrefix();
        forgetLoraFeatures();
        forgetLoraSession();
        releaseModel();
      }
      post({ type: "error", id: request.id, message });
    });
    return;
  }
  if (request.type === "embed") {
    embedText(request.id, request.model, request.text).catch((error: unknown) => {
      post({ type: "error", id: request.id, message: (error as Error).message });
    });
    return;
  }
  if (request.type === "stop") {
    stopGeneration();
    return;
  }
  if (request.type === "generate") {
    generate(request.id, request.model, request.messages, request.system, request.maxTokens, request.loopGuard ?? true).catch((error: unknown) => {
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
        forgetJudgePrefix();
        releaseModel();
      }
      post({ type: "error", id: request.id, message });
    });
  }
});

post({ type: "ready" });
