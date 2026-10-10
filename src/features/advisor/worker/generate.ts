import {
  InterruptableStoppingCriteria,
  TextStreamer,
  type PreTrainedModel,
  type PreTrainedTokenizer,
} from "@huggingface/transformers";
import { MAX_NEW_TOKENS, NO_REPEAT_NGRAM } from "@/features/advisor/model/config";
import { createLoopGuard, trimLoop } from "@/features/advisor/model/loopGuard";
import type { AdvisorRequest } from "@/features/advisor/contracts/protocol";
import { getModel, getTokenizer, load } from "./model";
import { withGenerationAdapter } from "./lora";
import { post } from "./port";

/** 생성 중단 스위치. 라이브러리가 매 토큰마다 확인한다. */
let stopper = new InterruptableStoppingCriteria();
let stopEpoch = 0;

export function stopGeneration() {
  stopEpoch += 1;
  stopper.interrupt();
}

/** 프롬프트 상한. 죽는 선(약 2,120)에서 여유를 둔다. */
const PROMPT_LIMIT = 1900;

type ChatMessage = { role: string; content: string };

export async function generate(request: Extract<AdvisorRequest, { type: "generate" }>) {
  const { id, model: spec, messages, system, maxTokens, loopGuard = true, purpose } = request;
  const grounded = purpose === "grounded-summary" || purpose === "grounded-numeric";
  const requestEpoch = stopEpoch;
  await load(spec);
  if (requestEpoch !== stopEpoch) {
    post({ type: "done", id, text: "", tokens: 0, seconds: 0 });
    return;
  }
  const tokenizer = getTokenizer();
  const model = getModel();
  if (!tokenizer || !model) throw new Error("모델이 준비되지 않았습니다");

  stopper = new InterruptableStoppingCriteria();
  const inputs = encodeWithinLimit(tokenizer, messages, system);

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
   * 이 크기의 모델은 탐욕 복호화에서 자주 고리에 빠진다. 종료 토큰이 안 나오므로
   * 상한에 닿을 때까지 멈추지 않는다. 무엇을 되풀이로 보는지는 `loopGuard` 에 적었다.
   */
  const guard = createLoopGuard();
  let looped = false;

  const streamer = new TextStreamer(tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (chunk: string) => {
      if (firstTokenAt === 0) firstTokenAt = performance.now();
      text += chunk;
      tokens += 1;
      // 요약 후보는 완료 후 검사한다. 검증되지 않은 조각은 화면에 흘리지 않는다.
      if (!grounded) post({ type: "chunk", id, text: chunk });
      if (loopGuard && !looped && guard.feed(chunk)) {
        looped = true;
        stopper.interrupt();
      }
    },
  });

  await withGenerationAdapter(purpose, () => model.generate({
    ...inputs,
    max_new_tokens: purpose === "grounded-numeric" ? Math.min(maxTokens ?? 24, 24) : maxTokens ?? MAX_NEW_TOKENS,
    do_sample: false,
    // 탐욕 복호화만으로는 같은 구절을 반복해 찍는다. 살짝만 눌러 준다. 크게 주면
    // 스킬 이름처럼 되풀이해야 하는 낱말까지 피하려 들어 글이 이상해진다.
    repetition_penalty: grounded ? 1 : 1.1,
    /*
     * 같은 20토큰이 두 번 나오지 못하게 한다. 끊는 것보다 앞에서 막는다.
     *
     * 라이브러리는 프롬프트까지 합친 전체에서 n-gram 을 센다. 그래서 값이 작으면
     * 재료에 적힌 스킬 이름조차 옮겨 적지 못한다. 카드 865개 스킬의 "챔피언 슬롯 이름"
     * 은 중앙값 8토큰, 가장 긴 것이 18토큰("유나라 W 심판의 궤적 | 파멸의 궤적")이다.
     * 되풀이 한 바퀴는 18토큰 남짓이었다("1레벨 기준 전체 챔피언 중 하위권이라는 점,
     * 그리고 오공이 "). 20 이면 이름은 막지 않고 바퀴는 두 번째에서 막힌다.
     */
    no_repeat_ngram_size: grounded ? 0 : NO_REPEAT_NGRAM,
    streamer,
    // 중단 요청이 오면 다음 토큰에서 멈춘다
    stopping_criteria: stopper,
  } as Parameters<PreTrainedModel["generate"]>[0]));

  const finishedAt = performance.now();
  const dims = (inputs as { input_ids?: { dims?: number[] } }).input_ids?.dims;
  const promptTokens = Array.isArray(dims) && dims.length > 0 ? dims[dims.length - 1] : 0;

  post({
    type: "done",
    id,
    // 끊었으면 되풀이한 꼬리를 걷어 낸 글로 바꾼다. 화면은 흘려 받은 조각 대신 이것을 쓴다.
    text: looped ? trimLoop(text) : text,
    looped,
    tokens,
    seconds: (finishedAt - startedAt) / 1000,
    // 첫 토큰까지 = 프롬프트를 읽는 시간. 나머지가 글을 쓰는 시간이다.
    ttftSeconds: firstTokenAt ? (firstTokenAt - startedAt) / 1000 : undefined,
    promptTokens: promptTokens || undefined,
  });
}

/**
 * 대화를 모델 입력으로 바꾸되 프롬프트 상한(`PROMPT_LIMIT`)을 넘지 않게 줄인다.
 *
 * Qwen3.5 0.8B 는 프롬프트가 약 2,120토큰을 넘으면 WebGPU 실행이 "SafeIntOnOverflow" 로
 * 죽는다(2,113 은 되고 2,180 은 안 됐다). 생성 길이와는 무관하고 첫 읽기 길이만 문제다.
 * 챔피언 셋의 요약을 실은 질문이 약 2,300토큰이라 화면에 오류가 그대로 떴다.
 *
 * 넘치면 오래된 대화부터 뺀다. 그래도 넘치면 시스템 글의 뒤쪽을 자른다 — 재료가 줄어도
 * 답이 나오는 편이 오류보다 낫다.
 */
function encodeWithinLimit(tokenizer: PreTrainedTokenizer, messages: ChatMessage[], system: string | undefined): Record<string, unknown> {
  // Qwen3 계열은 사고 모드를 켤 수 있다. 켜 두면 답변 앞에 추론 과정을 길게 뱉어
  // 브라우저에서 체감 지연이 몇 배가 된다. 상성 조언은 형식이 정해져 있으므로 끈다.
  const encode = (history: ChatMessage[], systemText: string | undefined) =>
    tokenizer.apply_chat_template(systemText ? [{ role: "system", content: systemText }, ...history] : history, {
      add_generation_prompt: true,
      return_dict: true,
      enable_thinking: false,
    } as Parameters<PreTrainedTokenizer["apply_chat_template"]>[1]) as Record<string, unknown>;
  const lengthOf = (encoded: Record<string, unknown>) => ((dims: number[]) => dims[dims.length - 1] ?? 0)((encoded.input_ids as { dims: number[] }).dims);
  let inputs = encode(messages, system);
  if (lengthOf(inputs) > PROMPT_LIMIT) {
    let history = messages;
    while (history.length > 1 && lengthOf(inputs) > PROMPT_LIMIT) {
      history = history.slice(history.length > 2 ? 2 : 1);
      inputs = encode(history, system);
    }
    let systemText = system;
    while (systemText && lengthOf(inputs) > PROMPT_LIMIT) {
      systemText = systemText.slice(0, Math.floor(systemText.length * 0.85));
      inputs = encode(history, systemText);
    }
  }
  if (lengthOf(inputs) > PROMPT_LIMIT) {
    throw new Error(`질문이 너무 깁니다. ${PROMPT_LIMIT}토큰 이내로 줄여 다시 질문해 주세요.`);
  }
  return inputs;
}
