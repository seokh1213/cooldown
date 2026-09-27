/**
 * 브라우저 도우미 설정 — 쓰는 모델, 생성 한도, WebGPU·저장 공간 확인
 */

export interface AdvisorModel {
  /** Hugging Face 저장소 id */
  id: string;
  /**
   * 양자화. 모델 카드가 지정한 값을 그대로 쓴다.
   * 모듈마다 다른 값을 주면(예: 임베딩만 q8) 세션 구성이 어긋나 적재가 끝나지 않는다.
   */
  dtype: "q4f16" | "q4" | "fp16" | "int8";
  /** 고지에 쓸 대략적인 내려받기 용량 */
  downloadMb: number;
  /**
   * 16비트 셰이더 연산(`shader-f16`)이 있어야 도는가.
   *
   * q4f16·fp16 은 그래프가 통째로 16비트라 없으면 첫 Gather 에서 죽는다. q4·int8 은
   * 4비트/8비트 가중치에 fp32 연산이라 f16 없이도 돈다. Pascal(GTX 10xx) 처럼 f16 만 없는 카드에서도 돈다.
   */
  needsF16: boolean;
  /**
   * 그래프만 바꿔 끼운다(앱 기준 상대 주소). 가중치는 `id` 저장소에서 그대로 받는다. kev LoRA 를 덧붙인 그래프다.
   */
  graph?: string;
  /**
   * 이름 없는 질문의 자료 찾기를 검색 LoRA 벡터로 한다(그래프에 `embed_scale` 가지가 있어야 한다).
   * `vectors` 는 문서 벡터 파일(앱 기준 상대, `.json`·`.bin`), 코사인이 `threshold` 밑이면 "자료 없음".
   * 근거는 `research/llm-evals/vector-search/README.md`.
   */
  retrieval?: { vectors: string; threshold: number };
}

/**
 * 쓰는 모델은 하나다 — Qwen3.5 0.8B 에 kev LoRA 두 가지(판정·검색)를 덧붙인 그래프.
 *
 * 한때 Qwen3 4B(2,764MB, 해설을 모델이 씀)를 기본으로 두고 이것을 16비트 셰이더가 없는 기기의 대체로 두었다.
 * 판정은 kev 헤드가 4B 의 글 판정보다 나았고(갈래 374문항: 4B 글 310, kev 331), 해설은 코드 조립과 미리 쓴 답이
 * 기기에서 모델이 쓴 글보다 나았다(맹검 3.20 대 3.90, 2026-09-23). 모델마다 길이 갈리는 것도 없애려고
 * 2026-09-27 4B 와 고르기 화면을 걷어냈다.
 *
 * 가중치는 onnx-community 에서 그대로 받고, LoRA 를 덧붙인 그래프(44MB)만 우리 사이트에서 받는다
 * (`scripts/llm/kev-agent/b3/lora_onnx.py`). 판정 LoRA 는 b3-v2, 검색 LoRA 는 eol-ep3 이다.
 * GTX 10xx(Pascal) 에서도 동작을 확인했다. q4 라 f16 이 없어도 돈다.
 */
export const ADVISOR_MODEL: AdvisorModel = {
  id: "onnx-community/Qwen3.5-0.8B-Text-ONNX",
  dtype: "q4",
  downloadMb: 570,
  needsF16: false,
  graph: "models/kev/b3e/model_q4.onnx",
  /*
   * 이름 없는 질문("스마 충전 몇 초마다 차?")은 검색 LoRA 벡터로 문서 100건(언어마다) 중에서 찾는다. 판정 LoRA(b3-v2)와 같은
   * 그래프에 두 번째 가지로 실었다(22 → 44MB). 시험 절반 355문항에서 낱말·은어 212 · 틀린 자료 31 → 벡터 288 · 31.
   */
  retrieval: { vectors: "models/kev/b3e/doc-vectors", threshold: 0.39 },
};

/** 화면에 적는 모델 이름. 번역하지 않는다. */
export const ADVISOR_MODEL_LABEL = "Qwen3.5 0.8B";

/**
 * 이 기기에 모델을 권할 수 있는가.
 *
 * f16 은 **그 모델이 필요로 할 때만** 따진다. 16비트를 안 쓰는 판본은 Pascal 처럼
 * f16 만 없는 카드에서도 돌 수 있으므로 미리 막지 않는다.
 *
 * 어댑터를 아직 확인하는 중(`null`)이면 권하지 않는다. 확인 전에 내려받기를 권했다가
 * 못 쓰는 기기로 밝혀지면 받은 것이 헛일이 된다.
 */
export function canOfferModel(
  model: AdvisorModel,
  webgpu: WebGpuSupport | null,
  device: "desktop" | "mobile" | "tablet" | string,
): boolean {
  if (device !== "desktop") return false;
  if (!webgpu?.supported) return false;
  return !model.needsF16 || webgpu.f16;
}

/*
 * 속도를 올리려고 재본 것들 — 전부 막혀서 스위치를 걷어냈다.
 *
 * (Qwen3 4B 를 쓰던 때 잰 것이다.) 브라우저 디코드는 5.5 tok/s 다. 같은 가중치가 Ollama(Metal)에서 49.7 tok/s 니
 * 9배 차이다. 다음 넷을 실제로 돌려 봤고 결과만 남긴다.
 *
 * CPU 로 떨어진 건 아닌가 — 아니다.
 *   device 를 wasm 으로 강제하면 std::bad_alloc 으로 죽는다(2.7GB 가 wasm 힙에
 *   안 들어간다). 평소에 CPU 로 떨어지고 있었다면 진작 같은 오류가 났을 것이다.
 *
 * ORT 버전 올리기 — 불가.
 *   transformers.js 가 onnxruntime-web 을 빌드 시점에 자기 번들에 넣는다.
 *   dist 에 외부 import 가 0건이라 overrides 로 못 바꾼다. transformers.js 를
 *   올려야 하는데 4.2.0 이 이미 최신이다.
 *
 * asyncify 대신 평범한 wasm 빌드 — 불가.
 *   no available backend found. ERR: [webgpu] TypeError: z(...).webgpuInit is not a function
 *   평범한 빌드에는 WebGPU 백엔드가 없다. JSPI 빌드는 글루가 번들에 없다.
 *
 * graph capture — 불가.
 *   Only 'gpu-buffer' location is supported when enableGraphCapture is true.
 *   transformers.js 는 KV 캐시만 GPU 에 두고 logits 는 CPU 로 내린다.
 *
 * 남은 것은 왜 느린가에 대한 답뿐이다. 애플 실리콘의 행렬 유닛(simdgroup_matrix)을
 * WebGPU 가 아직 못 쓴다. 표준에 대응 명령이 없다. 커널도 범용 셰이더라 손으로
 * 다듬은 Metal 커널을 못 따라간다. 설정 문제가 아니라 구조다.
 *
 * MLC WebLLM 은 디코드가 1.7배(9.5 tok/s) 빨랐지만 되돌렸다. 프리빌트에 있는
 * 것이 Qwen3-4B 본판이고 우리가 쓰는 Instruct-2507 이 아니다. 본판은 사고 모드를
 * 꺼도 영어로 추론을 흘려 해설이 1,000자를 넘었다. 속도보다 내용이 먼저다.
 */

/**
 * 폭주 방지선. **길이 정책이 아니다.**
 *
 * 답의 길이는 할 말의 양이 정한다. 프롬프트에서 "두세 문장" 같은 상한을 걷어냈고
 * 여기서도 문장 수를 재지 않는다. 답은 종료 토큰에서 끝난다.
 *
 * 그런데 값을 아예 빼면 안 된다. transformers.js 는 `max_new_tokens` 가 없으면
 * 라이브러리 기본값으로 떨어지는데 그게 20토큰이라 한 문장도 못 쓴다. 그래서
 * **실제로는 걸리지 않을 만큼 큰 값**을 준다. 모델이 스스로 멈추지 않는 고장난
 * 상황에서만 작동하고, 그때는 중단 버튼이 있다.
 *
 * 한때 8192 를 두었다. "걸리지 않을 만큼 크게" 라는 뜻이었는데, 이 값은 공짜가
 * 아니다. WebGPU 는 프롬프트와 이 값을 더한 만큼 키·값 캐시 버퍼를 잡는다. 실제로
 * 상성 질문에서 버퍼를 못 읽어 답이 통째로 오류로 바뀌었다.
 *
 *   failed to call OrtRun() ... Failed to download data from buffer:
 *   [Invalid Buffer] is invalid due to a previous error.
 *
 * 가장 긴 해설이 700토큰 남짓이다. 2048 이면 세 배 여유이면서 캐시는 4분의 1 로
 * 준다. 폭주는 이 선보다 먼저 반복 차단이 잡는다 — 같은 24자 구간이 세 번 나오면
 * 워커가 끊는다(`loopGuard`).
 */
export const MAX_NEW_TOKENS = 2048;

/** 같은 n-gram 을 두 번 못 쓰게 하는 길이. 까닭은 워커의 `generate` 에 적었다. */
export const NO_REPEAT_NGRAM = 20;

/** 동의 여부를 남기는 곳. 지우면 다시 묻는다. */
export const CONSENT_STORAGE_KEY = "cooldown.advisor.consent.v1";

export interface WebGpuSupport {
  supported: boolean;
  /** 지원하지 않을 때 사용자에게 보여줄 사유 */
  reason?: "no-api" | "no-adapter" | "error";
  /**
   * 어댑터가 16비트 셰이더 연산(`shader-f16`)을 지원하는가.
   *
   * 이게 없으면 f16 가중치를 못 올린다. 윈도우에서 이렇게 죽었다.
   *
   *   Gather requires f16 but the device does not support it.
   *
   * 애플 실리콘은 거의 다 지원해서 맥에서만 재보면 안 걸린다. 윈도우는 내장
   * 그래픽이나 오래된 드라이버에서 빠지는 일이 흔하다.
   */
  f16: boolean;
}

/**
 * WebGPU 를 쓸 수 있는지 확인한다.
 *
 * `navigator.gpu` 가 있어도 어댑터를 못 받는 환경이 있다(가상 머신, 구형 GPU,
 * 브라우저 설정에서 꺼 둔 경우). 그래서 어댑터까지 실제로 요청해 본다.
 */
export async function detectWebGpu(): Promise<WebGpuSupport> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<GpuAdapterLike | null> } }).gpu;
  if (!gpu) return { supported: false, reason: "no-api", f16: false };
  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) return { supported: false, reason: "no-adapter", f16: false };
    return { supported: true, f16: adapter.features?.has("shader-f16") ?? false };
  } catch {
    return { supported: false, reason: "error", f16: false };
  }
}

/** `requestAdapter()` 가 돌려주는 것 중 우리가 보는 부분만. */
interface GpuAdapterLike {
  features?: { has(name: string): boolean };
}

/** 브라우저가 이 출처에 허용한 저장 공간. 모델을 캐시할 수 있는지 가늠한다. */
export async function estimateStorageMb(): Promise<{ quotaMb?: number; usageMb?: number }> {
  if (!navigator.storage?.estimate) return {};
  try {
    const { quota, usage } = await navigator.storage.estimate();
    return {
      quotaMb: quota ? Math.round(quota / 1048576) : undefined,
      usageMb: usage ? Math.round(usage / 1048576) : undefined,
    };
  } catch {
    return {};
  }
}
