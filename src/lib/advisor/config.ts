/**
 * 브라우저 상성 코치 설정
 *
 * 모델은 로컬 평가에서 고른 것을 그대로 쓴다. 추론만 Ollama 로 돌리고 프롬프트는
 * 브라우저와 같은 `buildCommentaryPrompt` 를 쓰므로 결과가 그대로 이전된다.
 *
 * 해설 26문항 평가(챔피언 25 + 스킬 1). 세 가지를 센다 — 숫자를 안 썼나(수치는
 * 카드에 있다), 재료 안에서 말했나, 합니다체를 지켰나.
 *
 *   모델                점수     tok/s   자/초   q4f16   평균 길이
 *   gemma4:e2b (구)    69/78     68.4    110    3.38GB   120자
 *   exaone3.5:2.4b     77/78     75.3    151    1.73GB   194자
 *   qwen3:4b-instruct  78/78     49.4     67    2.09GB   116자
 *   gemma4:12b         78/78     18.5     30       —      96자
 *
 * 자/초는 tok/s 를 토크나이저의 한국어 밀도로 나눈 값이다. 같은 tok/s 라도
 * 한국어를 잘게 쪼개는 모델은 화면에 글자가 늦게 찍힌다.
 *
 * 쓰던 gemma4:e2b 가 26문항 중 9번 백분위 숫자를 그대로 베꼈다. "수치를 쓰지
 * 말라" 는 지시를 세 번에 한 번꼴로 어긴 셈인데, 3문항 평가로는 안 보였다.
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
 * 26문항에서 유일하게 만점(78/78)이었다. gemma4:12b 도 만점이지만 자/초가
 * 30 이고 브라우저에 올릴 크기가 아니다.
 *
 * 작은 모델로 내려간 것이 아니다. 유효 2.3B 에서 4B 로 올라가면서 내려받기는
 * 3.38GB 에서 2.09GB 로 줄었다. gemma 는 vocab 이 262,144 개라 임베딩 표에만
 * 1.59GB 를 쓰는데 그중 한글이 든 토큰이 1.7% 였다. Qwen3 는 그 표를 따로 싣지
 * 않아 단일 2.09GB 파일 하나다.
 *
 * 대가는 속도다. 한국어를 자당 0.74토큰으로 쪼개 gemma(0.62)보다 잘게 나눈다.
 * 자/초로는 110 에서 67 로 떨어진다. 두세 문장이면 3초 남짓이라 받아들일 값으로 봤다.
 */
export const ADVISOR_MODEL: AdvisorModel = {
  id: "onnx-community/Qwen3-4B-Instruct-2507-ONNX",
  dtype: "q4f16",
  downloadMb: 2090,
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
 * 속도를 사고 싶을 때의 대안. `?advisorModel=exaone`
 *
 * 77/78 로 기본값과 한 문항 차이인데 자/초는 151 로 두 배 넘게 빠르다. vocab
 * 102,400 중 한글 토큰이 33.3% 라 한국어를 자당 0.50토큰으로 쪼갠다. 후보 중
 * 가장 촘촘하다. 내려받기도 1.73GB 로 가장 작다.
 *
 * 기본값으로 올리지 않은 이유는 길이다. 평균 194자로 다른 후보(116·120자)보다
 * 눈에 띄게 길고, 두세 문장을 넘겨 네 문장까지 간다. 해설은 카드 옆에 붙는
 * 곁글이라 길면 카드를 밀어낸다. 속도가 아쉬우면 이쪽으로 바꿔 끼운다.
 */
export const EXAONE_MODEL: AdvisorModel = {
  id: "onnx-community/EXAONE-3.5-2.4B-Instruct",
  dtype: "q4f16",
  downloadMb: 1730,
};

/**
 * 쓰던 모델. `?advisorModel=gemma`
 *
 * 되돌릴 자리를 남겨 둔다. 새 기본값이 브라우저에서 문제를 내면 주소 한 줄로
 * 예전 동작으로 돌아간다.
 */
export const GEMMA_MODEL: AdvisorModel = {
  id: "onnx-community/gemma-4-E2B-it-ONNX",
  dtype: "q4f16",
  downloadMb: 3380,
};

const SWAPPABLE: Record<string, AdvisorModel> = {
  smoke: SMOKE_MODEL,
  exaone: EXAONE_MODEL,
  gemma: GEMMA_MODEL,
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
 * 값은 걸리는 시간으로 정했다. 같은 가중치를 Ollama(Metal)에서 재니 49.4 tok/s 였고
 * 브라우저 WebGPU 는 그보다 느리다. 1800 이면 로컬에서 36초, 브라우저에서 넉넉잡아
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
