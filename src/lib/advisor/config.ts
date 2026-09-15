/**
 * 브라우저 상성 코치 설정
 *
 * 모델은 로컬 평가에서 고른 것을 그대로 쓴다. 추론만 Ollama 로 돌리고 프롬프트는
 * 브라우저와 같은 `buildCommentaryPrompt` 를 쓰므로 결과가 그대로 이전된다.
 *
 * 잰 것은 **내용**이다. 카드에는 스킬마다 effects 가 붙어 있으므로, 해설이
 * "Q 지진의 파편으로 에어본" 처럼 잘못된 짝을 만들었는지 대조할 수 있다.
 * 16챔피언 기준이다.
 *
 *   모델                맞은 짝  틀린 짝  정확도  답마다 짚은 스킬  tok/s  길이
 *   gemma4:e2b (구)       21       3      88%        1.3개        68.7   110자
 *   qwen3:4b-instruct     63       6      91%        3.7개        49.7   182자
 *   exaone3.5:2.4b        49       1      98%        3.1개        70.3   368자
 *
 * 규칙 준수(숫자·문체·지어낸 이름)만 보던 잣대로는 gemma 가 멀쩡해 보였다.
 * 정확해서가 아니라 말을 안 해서였다. 답마다 실제 스킬을 1.3개밖에 안 짚고
 * "스킬을 사용하면 보호막을 얻고" 처럼 얼버무린다. 어느 스킬인지 말하지 않으면
 * 틀릴 일도 없다. 맞은 주장 수가 가장 적고 정확도도 가장 낮았다.
 *
 * exaone 은 태그 짝이 가장 정확하지만 산문에서 샌다. 말파이트를 "그녀" 라 하고
 * 야스오 낭인의 길이 "높은 방어력을 제공해 팀을 보호한다" 고 썼다. 태그 대조로는
 * 안 잡히는 오류라 98% 는 그만큼 깎아서 봐야 한다. 길이도 두 배다.
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
 * 맞은 주장이 63개로 쓰던 모델의 세 배다. 야스오에서 다섯 스킬을 전부 제자리에
 * 붙였다 — 낭인의 길에 보호막, 강철 폭풍에 에어본, 질풍검에 돌진, 바람 장막에
 * 투사체 차단. 해설이 할 일이 "무엇으로 이기고 어디가 약한가" 를 짚는 것이므로
 * 스킬을 몇 개나 옳게 짚느냐가 곧 쓸모다.
 *
 * 작은 모델로 내려간 것이 아니다. 유효 2.3B 에서 4B 로 올라가면서 내려받기는
 * 2,986MB 에서 2,764MB 로 줄었다. gemma 는 vocab 이 262,144 개라 임베딩 표에만
 * 1.59GB 를 쓰는데 그중 한글이 든 토큰은 1.7% 였다.
 *
 * 속도는 **브라우저에서 직접 쟀다.** Ollama 순위가 그대로 오지 않는다.
 * Ollama(Metal)에서는 gemma 68.7 > qwen3 49.7 인데, WebGPU 에서는 뒤집힌다.
 *
 *   qwen3 4B    예열 후 40토큰 12.7초 = 3.1 tok/s   내려받기 2,764MB
 *   gemma4 E2B  예열 후 51토큰 20.8초 = 2.5 tok/s   내려받기 2,986MB
 *
 * gemma 는 디코더와 임베딩을 세션 둘로 나눠 싣는데(decoder_model_merged +
 * embed_tokens) 그 왕복이 붙는 것으로 보인다. qwen3 는 단일 세션이다.
 * 결국 브라우저에서 더 빠르고, 더 작고, 내용도 낫다.
 *
 * WebGPU 어댑터는 maxBufferSize·maxStorageBufferBindingSize 가 각각 4GiB 이고
 * shader-f16 을 지원했다. 2.7GB 짜리를 올리는 데 모자라지 않는다.
 */
export const ADVISOR_MODEL: AdvisorModel = {
  id: "onnx-community/Qwen3-4B-Instruct-2507-ONNX",
  dtype: "q4f16",
  downloadMb: 2764,
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
 * 속도와 용량을 사고 싶을 때. `?advisorModel=exaone`
 *
 * 태그 짝은 98% 로 가장 정확하고 70.3 tok/s 에 1.73GB 로 가장 작다. vocab
 * 102,400 중 한글 토큰이 33.3% 라 한국어를 자당 0.50토큰으로 쪼갠다. 후보 중
 * 가장 촘촘하다.
 *
 * 기본값으로 올리지 않은 이유는 둘이다. 평균 368자로 기본값의 두 배이고,
 * 태그 대조로는 안 잡히는 산문 오류가 있다. 말파이트를 "그녀" 라 부르고
 * 야스오 낭인의 길을 "높은 방어력을 제공해 팀을 보호한다" 고 썼다.
 */
export const EXAONE_MODEL: AdvisorModel = {
  id: "onnx-community/EXAONE-3.5-2.4B-Instruct",
  dtype: "q4f16",
  downloadMb: 1730,
};

/**
 * 쓰던 모델. `?advisorModel=gemma`
 *
 * 되돌릴 자리를 남겨 둔다. 새 기본값이 문제를 내면 주소 한 줄로 예전 동작이다.
 * 브라우저에서 재보니 더 크고(2,986MB) 더 느리다(2.5 tok/s). 빠를 것이라
 * 여겼던 것은 Ollama 기준이었고, WebGPU 에서는 순위가 뒤집혔다.
 */
export const GEMMA_MODEL: AdvisorModel = {
  id: "onnx-community/gemma-4-E2B-it-ONNX",
  dtype: "q4f16",
  downloadMb: 2986,
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
 * 속도를 올리려고 재본 것들 — 전부 막혀서 스위치를 걷어냈다.
 *
 * 브라우저 디코드는 5.5 tok/s 다. 같은 가중치가 Ollama(Metal)에서 49.7 tok/s 니
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
 * 한 번에 만들 최대 토큰 수.
 *
 * 900 이던 것을 올린다. "럼블 챔피언에 대해서 설명해줘" 가 문장 중간에서 잘렸다.
 * 그 질문 자체는 이제 코드가 답하지만, 챔피언 둘을 견주는 질문은 여전히 모델이
 * 답하고 자료가 두 배라 같은 일이 날 수 있다.
 *
 * 상한은 **모델이 스스로 멈추지 않을 때만** 작동한다. 보통 답은 종료 토큰에서
 * 끝나므로 올려도 평소 속도는 그대로고, 길어야 할 답만 살아남는다.
 *
 * 값은 걸리는 시간으로 정했다. 브라우저 WebGPU 에서 직접 재니 3.1 tok/s 였다.
 * 해설은 보통 40~60토큰에서 끝나 13~20초다. 1800 은 스스로 멈추지 않을 때만
 * 걸리는 상한이고, 거기까지 가면 10분이 넘는다. 그래서 중단 버튼이 필요하다.
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
