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
  dtype: "q4f16" | "q4" | "fp16" | "int8";
  /** 고지에 쓸 대략적인 내려받기 용량 */
  downloadMb: number;
  /**
   * 16비트 셰이더 연산(`shader-f16`)이 있어야 도는가.
   *
   * q4f16·fp16 은 그래프가 통째로 16비트라 없으면 첫 Gather 에서 죽는다. q4·int8 은
   * 4비트/8비트 가중치에 fp32 연산이라 f16 없이도 돈다. 이 값에 따라 기기를 가리는
   * 조건이 달라진다 — Pascal(GTX 10xx) 처럼 f16 만 없는 카드에도 뒤쪽은 줄 수 있다.
   */
  needsF16: boolean;
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
  needsF16: true,
};

export const SMOKE_MODEL: AdvisorModel = {
  id: "onnx-community/gemma-3-1b-it-ONNX",
  dtype: "q4f16",
  downloadMb: 730,
  needsF16: true,
};

/**
 * f16 없는 기기에서 시험해 볼 후보들.
 *
 * `shader-f16` 이 없는 카드(Pascal, 구형 내장 그래픽)는 지금 모델을 못 올린다. 16비트를
 * 안 쓰는 판본으로 바꿔 봤는데 맥에서 잰 결과는 이랬다.
 *
 *   Qwen3-4B q4        3,778MB  주소 공간 초과
 *   EXAONE-2.4B q4     2,278MB  쪼개진 파일. 내려받기는 끝나고 세션 생성에서 매달림
 *   Qwen2.5-1.5B q4    1,705MB  단일 파일. std::bad_alloc
 *   Qwen2.5-1.5B int8  1,506MB  적재는 되나 출력이 무너짐
 *   Qwen3-0.6B q4        877MB  18.5 tok/s. 재료를 베낌
 *   gemma-3-1b q4        819MB  15.2 tok/s. 문장은 되나 주어가 뒤집힘
 *
 * 벽이 둘이다. **단일 파일은 1.5GB**, **쪼개진 파일은 2.7GB** 다. 그래서 2.3GB 짜리
 * EXAONE 이 매달린 것은 메모리가 아니라 fp32 가중치를 GPU 로 올리는 과정이고, 그
 * 과정은 백엔드마다 다르다 — 여기는 Metal 이고 윈도우는 D3D12 다. **맥에서 매달린
 * 것이 그쪽에서도 매달린다는 보장이 없다.** 그래서 단정하지 않고 길을 열어 둔다.
 *
 * AI 모델 화면에서 고를 수 있고, 주소 뒤에 `?advisorModel=exaone` 을 붙여도 된다.
 */
const SWAPPABLE: Record<string, AdvisorModel> = {
  smoke: SMOKE_MODEL,
  /** 한국어가 가장 나은 후보. 맥에서는 세션 생성이 안 끝났다. */
  exaone: {
    id: "onnx-community/EXAONE-3.5-2.4B-Instruct",
    dtype: "q4",
    downloadMb: 2279,
    needsF16: false,
  },
  /** 단일 파일 1.7GB. 맥에서는 std::bad_alloc 이었다. */
  qwen15: {
    id: "onnx-community/Qwen2.5-1.5B-Instruct",
    dtype: "q4",
    downloadMb: 1705,
    needsF16: false,
  },
  /** 확실히 도는 것. 품질은 확실히 떨어진다. */
  lite: {
    id: "onnx-community/gemma-3-1b-it-ONNX",
    dtype: "q4",
    downloadMb: 819,
    needsF16: false,
  },
  /** 가장 빠르고 가장 작다. 재료를 거의 그대로 베낀다. */
  tiny: {
    id: "onnx-community/Qwen3-0.6B-ONNX",
    dtype: "q4",
    downloadMb: 877,
    needsF16: false,
  },
};

/**
 * 화면에서 고를 수 있는 목록.
 *
 * 순서가 곧 권하는 순서다. 위가 좋은 것이고 아래로 갈수록 확실히 도는 것이다.
 * `note` 는 맥에서 잰 결과를 그대로 적는다 — 고르는 사람이 무엇을 시험하는지 알아야
 * 실패도 정보가 된다. 다른 그래픽 백엔드에서는 다를 수 있다는 것이 이 목록의 요지다.
 */
export interface ModelChoice {
  key: string;
  model: AdvisorModel;
  label: string;
  note: string;
}

export const MODEL_CHOICES: ModelChoice[] = [
  { key: "default", model: ADVISOR_MODEL, label: "Qwen3 4B", note: "기본. 16비트 셰이더가 있어야 합니다" },
  { key: "exaone", model: SWAPPABLE.exaone, label: "EXAONE 3.5 2.4B", note: "적재에 실패합니다. 파일 하나가 너무 큽니다" },
  { key: "qwen15", model: SWAPPABLE.qwen15, label: "Qwen2.5 1.5B", note: "적재에 실패할 수 있습니다. 파일 하나가 1.7GB 입니다" },
  { key: "tiny", model: SWAPPABLE.tiny, label: "Qwen3 0.6B", note: "빠릅니다. 자료를 거의 그대로 옮겨 적습니다" },
  { key: "lite", model: SWAPPABLE.lite, label: "Gemma 3 1B", note: "확실히 돕니다. 문장을 만들지만 자주 틀립니다" },
];

/** 고른 모델을 기억하는 열쇠. 기기마다. */
export const MODEL_CHOICE_KEY = "cooldown.advisor.model";

export function readModelChoice(): string | undefined {
  try {
    const stored = localStorage.getItem(MODEL_CHOICE_KEY);
    return stored && stored in SWAPPABLE ? stored : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 쓸 모델을 바꾼다.
 *
 * 워커가 이미 다른 모델을 메모리에 들고 있으므로 고른 것만으로는 안 바뀐다.
 * 값을 남기고 화면을 다시 띄우는 것이 가장 확실하다 — 대화는 기록에 남아 있다.
 */
export function writeModelChoice(key: string): void {
  try {
    if (key === "default") localStorage.removeItem(MODEL_CHOICE_KEY);
    else localStorage.setItem(MODEL_CHOICE_KEY, key);
  } catch {
    // 못 남겨도 이번 세션에서는 질의 문자열로 바꿀 수 있다
  }
}

/**
 * 이 기기에 이 모델을 권할 수 있는가.
 *
 * f16 은 **그 모델이 필요로 할 때만** 따진다. 16비트를 안 쓰는 판본은 Pascal 처럼
 * f16 만 없는 카드에서도 돌 수 있으므로 미리 막지 않는다.
 *
 * 어댑터를 아직 확인하는 중(`null`)이면 권하지 않는다. 확인 전에 내려받기를 권했다가
 * 못 쓰는 기기로 밝혀지면 3GB 를 헛되이 받게 된다.
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

/**
 * 쓸 모델. 질의 문자열이 먼저고, 그다음이 화면에서 고른 값이다.
 *
 * 질의 문자열을 앞에 두는 이유는 그것이 한 번 쓰고 마는 지시이기 때문이다.
 * 화면에서 고른 값은 기기에 남아 다음에도 따라온다.
 */
export function resolveModel(): AdvisorModel {
  try {
    const wanted = new URLSearchParams(location.search).get("advisorModel");
    if (wanted && wanted in SWAPPABLE) return SWAPPABLE[wanted];
  } catch {
    // 워커 등 location 을 못 읽는 곳에서는 기본값
  }
  const stored = readModelChoice();
  return stored ? SWAPPABLE[stored] : ADVISOR_MODEL;
}

/** 지금 고른 것이 목록의 어느 줄인가. */
export function currentModelChoice(): string {
  try {
    const wanted = new URLSearchParams(location.search).get("advisorModel");
    if (wanted && wanted in SWAPPABLE) return wanted;
  } catch {
    // 아래로
  }
  return readModelChoice() ?? "default";
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
 * 8192 는 프롬프트 2천 토큰을 빼고도 남는 자리다. 지금 가장 긴 해설이 700토큰
 * 남짓이니 열 배 여유가 있다.
 */
export const MAX_NEW_TOKENS = 8192;

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
