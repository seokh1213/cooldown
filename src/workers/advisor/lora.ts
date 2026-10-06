import { Tensor, type PreTrainedModel } from "@huggingface/transformers";
import { ADAPTER_GATES, GenerationAdapter, type GenerationPurpose } from "./generationAdapter";

/** ONNX Runtime 텐서(transformers.js 가 감싸기 전의 것) */
export type OrtTensor = { type: string; dims: readonly number[]; getData: () => Promise<unknown>; dispose?: () => void };
export type OrtFeeds = Record<string, OrtTensor>;
export type OrtSession = { run: (feeds: OrtFeeds) => Promise<Record<string, OrtTensor>> };
type OrtTensorCtor = new (type: string, data: ArrayLike<unknown>, dims: readonly number[]) => OrtTensor;

export const ortTensor = (): OrtTensorCtor =>
  (new Tensor("int64", new BigInt64Array(1), [1]) as unknown as { ort_tensor: { constructor: OrtTensorCtor } }).ort_tensor.constructor;

/** LoRA 를 켜는 입력을 받는 원래 세션. 판정(`stepHidden`)·검색(`embedText`)만 이것을 직접 부른다. */
let loraSession: OrtSession | null = null;
/** 그래프에 있는 분류·검색·생성 adapter의 켜기 입력. */
let gateInputs: string[] = [];
const generationAdapter = new GenerationAdapter();

/**
 * kev 그래프에는 LoRA 를 켜는 입력(`lora_scale`, 검색 LoRA 까지 실었으면 `embed_scale`)이 있다. transformers.js 는
 * 세션 입력을 전부 채우려 하므로 이 입력들을 숨긴다. 일반 생성은 0, 명시적인 수치 응답은 qa_scale만 1이다.
 */
export function hideLoraInput(model: PreTrainedModel) {
  const sessions = (model as unknown as { sessions: Record<string, OrtSession & { inputNames: string[] }> }).sessions;
  const raw = sessions.model;
  gateInputs = ADAPTER_GATES.filter((name) => raw.inputNames.includes(name));
  generationAdapter.setInputs(gateInputs);
  if (!gateInputs.length) return;
  loraSession = raw;
  const Ort = ortTensor();
  sessions.model = new Proxy(raw, {
    get(target, prop) {
      if (prop === "inputNames") return target.inputNames.filter((name) => !gateInputs.includes(name));
      if (prop === "run") {
        return (feeds: OrtFeeds, ...rest: unknown[]) =>
          (target.run as (f: OrtFeeds, ...r: unknown[]) => Promise<Record<string, OrtTensor>>)(
            { ...feeds, ...Object.fromEntries(Object.entries(generationAdapter.values())
              .map(([name, value]) => [name, new Ort("float32", Float32Array.from([value]), [])])) },
            ...rest,
          );
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/** LoRA 켜기 입력값. 그래프에 없는 입력은 넣지 않는다. */
export function gates(values: Record<string, number>): OrtFeeds {
  const Ort = ortTensor();
  return Object.fromEntries(gateInputs.map((name) => [name, new Ort("float32", Float32Array.from([values[name] ?? 0]), [])]));
}

export function getLoraSession(): OrtSession | null {
  return loraSession;
}

export function activeGates(): readonly string[] {
  return gateInputs;
}

export function forgetLoraSession() {
  loraSession = null;
  gateInputs = [];
  generationAdapter.setInputs([]);
}

export function withGenerationAdapter<T>(purpose: GenerationPurpose, operation: () => Promise<T>): Promise<T> {
  return generationAdapter.run(purpose, operation);
}
