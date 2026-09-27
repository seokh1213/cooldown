/**
 * kev 판정: 은닉 상태 + LoRA
 */
import { Tensor } from "@huggingface/transformers";
import { encodeJudgeRow, JUDGE_SPECIAL, type JudgeQuestion } from "@/lib/advisor/judge";
import type { AdvisorModelSpec } from "@/lib/advisor/protocol";
import { activeGates, gates, getLoraSession, ortTensor, type OrtFeeds, type OrtSession } from "./lora";
import { getModel, getTokenizer, load } from "./model";
import { post } from "./port";

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

export async function judgeHidden(id: number, spec: AdvisorModelSpec, state: string, questions: JudgeQuestion[]) {
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
export async function embedText(id: number, spec: AdvisorModelSpec, text: string) {
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

export function forgetLoraFeatures() {
  hiddenPrefix = null;
  emptyPast = null;
}
