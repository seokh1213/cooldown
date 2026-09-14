/**
 * 브라우저 상성 코치 설정
 *
 * 모델은 로컬 평가에서 고른 것을 그대로 쓴다. 10개 매치업 평가에서
 * gemma4:e2b 가 적중 64/66, 스킬 소유자 오류 0, 매치업당 16초로
 * 더 큰 e4b(65/66, 33초)와 품질 차이가 적으면서 두 배 빨랐다.
 * 브라우저에서는 체감 지연이 품질보다 크게 작용하므로 E2B 를 택했다.
 *
 * `onnx-community/gemma-4-E2B-it-ONNX` 는 구글 공식 가중치의 ONNX 변환이고
 * Ollama 의 `gemma4:e2b` 와 같은 모델이다. 그래서 로컬 평가 결과가 그대로 이전된다.
 */

export interface AdvisorModel {
  /** Hugging Face 저장소 id */
  id: string;
  /**
   * 양자화. 모델 카드가 지정한 값을 그대로 쓴다.
   * 모듈마다 다른 값을 주면(예: 임베딩만 q8) 세션 구성이 어긋나 적재가 끝나지 않는다.
   */
  dtype: "q4f16" | "q4" | "fp16";
  /** 고지에 쓸 대략적인 내려받기 용량 */
  downloadMb: number;
}

/**
 * 실제로 쓰는 모델.
 *
 * 로컬 평가 10개 매치업에서 gemma4:e2b 가 적중 64/66, 스킬 소유자 오류 0,
 * 매치업당 16초였다. 더 큰 e4b(65/66, 33초)와 품질 차이가 적으면서 두 배 빨라 이쪽을 골랐다.
 * ONNX 변환본은 Ollama 의 `gemma4:e2b` 와 같은 가중치라 평가 결과가 그대로 이전된다.
 */
export const ADVISOR_MODEL: AdvisorModel = {
  id: "onnx-community/gemma-4-E2B-it-ONNX",
  dtype: "q4f16",
  downloadMb: 2970,
};

/**
 * 배선 점검용 소형 모델.
 *
 * 적재가 안 될 때 "배선이 틀렸나, 모델이 큰 탓인가" 를 가르는 용도다.
 * `?advisorModel=smoke` 를 주소에 붙이면 이쪽으로 바꿔 끼운다.
 */
export const SMOKE_MODEL: AdvisorModel = {
  id: "onnx-community/gemma-3-1b-it-ONNX",
  dtype: "q4f16",
  downloadMb: 730,
};

/**
 * 바꿔 달아 보려는 후보. 기본값이 아니라 재보기 위한 자리다.
 *
 * 지금 쓰는 Gemma 4 E2B 는 2.97GB 인데 그중 임베딩 테이블이 1.59GB 다. vocab 이
 * 262,144 개이고 그중 한글이 든 토큰은 1.7% 뿐이다. 디코더보다 큰 표를 싣고
 * 다니면서 한국어 몫은 그 정도다. 게다가 Gemma 3n·4 계열은 한국어 벤치마크
 * 점수를 공표한 적이 없어, 지금 한국어 실력은 근거 없이 믿고 있는 상태다.
 *
 * EXAONE 3.5 는 vocab 102,400 중 한글 토큰이 33.3% 고 LogicKor 8.51 이다.
 * 용량은 1.73GB 로 절반 가까이 준다. 같은 문장을 더 적은 토큰으로 쓰므로
 * 체감 속도도 같이 오를 것으로 본다.
 *
 * 다만 변환 시점이 2025-03 이라 transformers.js v4 의 어텐션 융합 이전 export 다.
 * **적재는 되어도 WebGPU 가속 경로를 못 타 오히려 느릴 수 있다.** 그것만 재면
 * 결론이 나므로 기본값을 바꾸지 않고 스위치로만 둔다.
 */
export const EXAONE_MODEL: AdvisorModel = {
  id: "onnx-community/EXAONE-3.5-2.4B-Instruct",
  dtype: "q4f16",
  downloadMb: 1730,
};

/**
 * 품질 하한을 재보는 자리.
 *
 * 모델은 해설 두세 문장과 검색어만 쓰고 수치는 입에 담지 못한다. 그렇다면
 * 어디까지 작아져도 되는지가 실제 질문이다. 0.47GB 는 지금의 6분의 1 이다.
 */
export const TINY_MODEL: AdvisorModel = {
  id: "onnx-community/Qwen3.5-0.8B-Text-ONNX",
  dtype: "q4f16",
  downloadMb: 470,
};

const SWAPPABLE: Record<string, AdvisorModel> = {
  smoke: SMOKE_MODEL,
  exaone: EXAONE_MODEL,
  tiny: TINY_MODEL,
};

export function resolveModel(): AdvisorModel {
  try {
    const wanted = new URLSearchParams(location.search).get("advisorModel");
    if (wanted && wanted in SWAPPABLE) return SWAPPABLE[wanted];
  } catch {
    // 워커 등 location 을 못 읽는 곳에서는 기본값
  }
  return ADVISOR_MODEL;
}

/**
 * 한 번에 만들 최대 토큰 수.
 *
 * 900 이던 것을 올린다. "럼블 챔피언에 대해서 설명해줘" 가 문장 중간에서 잘렸다.
 * 그 질문 자체는 이제 코드가 답하지만, 챔피언 둘을 견주는 질문은 여전히 모델이
 * 답하고 자료가 두 배라 같은 일이 날 수 있다.
 *
 * 상한은 **모델이 스스로 멈추지 않을 때만** 작동한다. 보통 답은 종료 토큰에서
 * 끝나므로 올려도 평소 속도는 그대로고, 길어야 할 답만 살아남는다.
 *
 * 값은 걸리는 시간으로 정했다. 같은 가중치를 Ollama(Metal)에서 재니 66.8 tok/s 였고
 * 브라우저 WebGPU 는 그보다 느리다. 1800 이면 로컬에서 27초, 브라우저에서 넉넉잡아
 * 2분 안쪽이다. 그 이상은 기다림이 답보다 커진다. 더 길어지면 중단 버튼이 있다.
 */
export const MAX_NEW_TOKENS = 1800;

/** 동의 여부를 남기는 곳. 지우면 다시 묻는다. */
export const CONSENT_STORAGE_KEY = "cooldown.advisor.consent.v1";

export interface WebGpuSupport {
  supported: boolean;
  /** 지원하지 않을 때 사용자에게 보여줄 사유 */
  reason?: "no-api" | "no-adapter" | "error";
}

/**
 * WebGPU 를 쓸 수 있는지 확인한다.
 *
 * `navigator.gpu` 가 있어도 어댑터를 못 받는 환경이 있다(가상 머신, 구형 GPU,
 * 브라우저 설정에서 꺼 둔 경우). 그래서 어댑터까지 실제로 요청해 본다.
 */
export async function detectWebGpu(): Promise<WebGpuSupport> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return { supported: false, reason: "no-api" };
  try {
    const adapter = await gpu.requestAdapter();
    return adapter ? { supported: true } : { supported: false, reason: "no-adapter" };
  } catch {
    return { supported: false, reason: "error" };
  }
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
