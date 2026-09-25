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
  /**
   * 가벼운 쪽인가.
   *
   * **동작은 같다.** 두 모델 모두 같은 프롬프트로 같은 일을 하고 같은 검사를 거친다.
   * 이 값은 목록에 어느 설명을 붙일지만 고른다.
   *
   * 한때는 이 표시가 동작을 갈랐다. 작은 모델에게는 해설 대신 노트 압축만 시키고
   * 근거 검사도 더 빡빡하게 걸었다. Gemma 3 1B 가 "저는 Google AI입니다", "R의
   * 지뢰로" 를 내놓던 시절의 방어였다. Qwen3.5 0.8B 로 바꾸고 같은 12문항을 다시
   * 재 보니 그 방어가 쓸모를 잃었다 — 4B 와 견줘 틀린 짝 0건에 내용 양도 비슷했다.
   *
   *   Qwen3 4B       485자 · 100% 통과 · 틀린 짝 0 · 11.2초
   *   Qwen3.5 0.8B   473자 ·  98% 통과 · 틀린 짝 0 ·  2.5초
   */
  lite?: boolean;
  /**
   * 그래프만 바꿔 끼운다(앱 기준 상대 주소). 가중치는 `id` 저장소에서 그대로 받는다. kev LoRA 를 덧붙인 그래프다.
   * 있으면 판정은 kev 헤드 하나(`judge: "kev"`)로 한다.
   */
  graph?: string;
  /** 판정 방식. heads = 원본 logits 위 헤드 여럿(route-v2·sub-v1·topic-v1·act-v1), kev = kev LoRA 헤드 하나 */
  judge?: "heads" | "kev";
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
 * 16비트를 안 쓰는 판본들.
 *
 * `shader-f16` 이 없는 카드(Pascal, 구형 내장 그래픽)는 기본 모델을 못 올린다.
 * 대신 줄 것을 찾느라 아래를 전부 실제로 돌려 봤다. 맥(Metal)과 GTX 10xx(D3D12)
 * 두 곳에서 잰 값이고, **둘이 갈린다는 것이 이 표의 요지다.**
 *
 *   판본                크기      맥(Metal)              GTX 10xx(D3D12)
 *   Qwen3-4B q4       3,778MB   주소 공간 초과           (시험 못 함)
 *   EXAONE-2.4B q4    2,279MB   세션 생성에서 매달림      버퍼 할당 실패
 *   Qwen2.5-1.5B q4   1,705MB   std::bad_alloc         std::bad_alloc
 *   Qwen3-0.6B q4       877MB   18.5 tok/s 동작         추론에서 트랩
 *   gemma-3-1b q4       819MB   15.2 tok/s 동작         동작
 *
 * Qwen3-0.6B 를 보면 된다. 같은 파일이 맥에서는 멀쩡히 돌고 D3D12 에서는
 * `table index is out of bounds` 로 죽는다. 한쪽에서 잰 값으로 다른 쪽을 단정할 수
 * 없어서 목록을 화면에 열어 두고, 자동 대체는 양쪽에서 확인된 것 하나만 쓴다.
 *
 * 벽은 둘이다. 단일 `.onnx` 는 1.5GB 에서 막히고, 쪼개진 `.onnx_data` 는 2.7GB 도
 * 올라간다(지금 쓰는 q4f16 이 그 크기다). q4 가 q4f16 보다 오히려 큰 것은 4비트가
 * 아닌 부분 — 임베딩·lm_head·양자화 스케일 — 을 fp32 로 남기기 때문이다.
 *
 * AI 모델 화면에서 고를 수 있고, 주소 뒤에 `?advisorModel=lite` 를 붙여도 된다.
 */
const SWAPPABLE: Record<string, AdvisorModel> = {
  smoke: SMOKE_MODEL,
  /**
   * 16비트 셰이더가 없는 기기에 주는 것. GTX 10xx 에서 동작을 확인했다.
   * 526MB 로 가장 작고, 압축 과제에서 후보 중 가장 정확했다.
   */
  qwen35: {
    id: "onnx-community/Qwen3.5-0.8B-Text-ONNX",
    dtype: "q4",
    downloadMb: 526,
    needsF16: false,
    lite: true,
  },
  /**
   * 0.8B + kev LoRA(B3). 가중치는 qwen35 와 같은 파일을 onnx-community 에서 받고, 그래프(LoRA 를 덧붙인 것,
   * 약 22MB)만 우리 사이트에서 받는다. 판정이 헤드 여럿 대신 kev 헤드 하나다.
   * 대화 270턴 8.2(헤드 7.1), 갈래 9칸 판정기만 316/374, 대화 흐름 54/60(`research/llm-evals/kev-agent/`).
   * 시험 중이라 목록에는 없고 `?advisorModel=kev` 로만 고른다.
   */
  kev: {
    id: "onnx-community/Qwen3.5-0.8B-Text-ONNX",
    dtype: "q4",
    downloadMb: 548,
    needsF16: false,
    lite: true,
    graph: "models/kev/b3-v1/model_q4.onnx",
    judge: "kev",
  },
  /**
   * 예비. 화면 목록에는 없고 `?advisorModel=gemma` 로만 고를 수 있다.
   *
   * Qwen3.5 를 못 올리는 기기가 나오면 이것이 남은 길이다. 다만 같은 질문에
   * "저는 Google AI입니다", "말파이트는 R의 지뢰로" 를 내놓아 기본으로 둘 수 없었다.
   */
  gemma: {
    id: "onnx-community/gemma-3-1b-it-ONNX",
    dtype: "q4",
    downloadMb: 819,
    needsF16: false,
    lite: true,
  },
};

/**
 * 화면에서 고를 수 있는 목록.
 *
 * GTX 10xx 에서 후보를 전부 눌러 본 끝에 둘만 남았다. 나머지는 그 기기에서 올라가지
 * 않거나, 추론 중에 멈추거나, 답이 못 미더웠다. 설명 문구는 i18n 에 둔다 — 화면에
 * 보이는 말이고 한국어만 쓰는 사람이 보는 것이 아니다.
 */
export interface ModelChoice {
  key: string;
  model: AdvisorModel;
  /** 모델 이름. 번역하지 않는다. */
  label: string;
}

export const MODEL_CHOICES: ModelChoice[] = [
  { key: "default", model: ADVISOR_MODEL, label: "Qwen3 4B" },
  { key: "qwen35", model: SWAPPABLE.qwen35, label: "Qwen3.5 0.8B" },
];

/**
 * 16비트 셰이더가 없는 기기에 대신 주는 모델.
 *
 * GTX 10xx(Pascal) 에서 후보를 위에서부터 실제로 눌러 본 결과가 이것 하나였다.
 *
 *   EXAONE 2.4B q4   2,279MB  RangeError: Array buffer allocation failed
 *   Qwen2.5 1.5B q4  1,705MB  std::bad_alloc
 *   Qwen3 0.6B q4      877MB  적재는 됐고 추론에서 table index is out of bounds
 *   Gemma 3 1B q4      819MB  동작
 *
 * 맥(Metal)에서는 Qwen3 0.6B 도 18.5 tok/s 로 멀쩡히 돌았다. 같은 파일이 D3D12
 * 에서 트랩을 밟는다. **기기에서 눌러 보기 전에는 알 수 없다**는 것이 이 표의 요지다.
 */
export const FALLBACK_MODEL = SWAPPABLE.qwen35;

/**
 * 사용자가 고르지 않았을 때 쓸 모델.
 *
 * 16비트 셰이더가 없는 기기에 기본 모델을 주면 내려받기부터 막힌다. 그런 기기에는
 * 가벼운 쪽을 대신 준다. 해설 품질은 확실히 떨어지지만 아무것도 못 쓰는 것보다 낫고,
 * 화면이 그것을 "간이" 라고 밝힌다.
 *
 * 어댑터를 아직 확인하는 중이면 기본값을 돌려준다. 그 사이에 내려받기를 시작하는
 * 길은 `canOfferModel` 이 따로 막는다.
 */
export function autoModel(webgpu: WebGpuSupport | null): AdvisorModel {
  if (webgpu?.supported && !webgpu.f16) return FALLBACK_MODEL;
  return ADVISOR_MODEL;
}

/** 이 모델이 목록의 어느 줄인가. 화면이 고른 표시를 하는 데 쓴다. */
export function modelChoiceKey(model: AdvisorModel): string {
  return MODEL_CHOICES.find((choice) => choice.model.id === model.id && choice.model.dtype === model.dtype)?.key ?? "default";
}

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
/**
 * 이 줄을 고르지 못하게 막아야 하는가.
 *
 * `canOfferModel` 과 다르다. 그쪽은 "권할 만한가" 라 휴대폰에서도 거짓이지만, 이쪽은
 * **그래픽카드가 못 돌리는가** 만 본다. 목록을 보는 사람에게 필요한 정보가 그것이다.
 *
 * 어댑터를 아직 확인하는 중이면 막지 않는다. 확인 전에 잠갔다 푸는 것이 더 헷갈리고,
 * 그 사이에 눌러도 내려받기는 `canOfferModel` 이 따로 막는다.
 */
export function modelBlocked(model: AdvisorModel, webgpu: WebGpuSupport | null): boolean {
  if (webgpu === null) return false;
  if (!webgpu.supported) return true;
  return model.needsF16 && !webgpu.f16;
}

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

/** 측정 도구(`scripts/llm/kev-agent/eval-kev-browser.ts`)가 쓰는 판본 목록. 앱은 `resolveModel` 로만 고른다. */
export const SWAPPABLE_FOR_TEST = SWAPPABLE;
