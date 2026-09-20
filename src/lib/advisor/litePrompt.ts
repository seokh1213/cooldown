/**
 * 간이 모델에게 시키는 일
 *
 * 4B 용 프롬프트를 1B 에 그대로 먹이면 무너진다. 규칙이 여덟 줄이고 재료가 길어서
 * 앞부분만 따르다 만다. Gemma 3 1B 로 실제로 재 봤다 — 괄호 안은 엄격 필터를
 * 통과해 화면에 남은 글자 수다.
 *
 *   현행 4B 프롬프트     494자 씀 → 35자 남음(7%).  여섯 중 셋은 한 줄도 안 남음
 *   규칙 3줄로 줄임      111자 → 33자(29%)
 *   예시 하나 보여 줌    154자 → 88자(57%).  다만 **예시 문장을 그대로 베낀다**
 *   한 번에 한 문장씩    120자 → 26자(21%)
 *   노트 압축           100자 → 100자(100%)
 *
 * 마지막을 쓴다. **추론은 약해도 압축은 한다.** 근거를 스스로 만드는 대신 사람이
 * 검증한 문장을 줄이기만 하므로 틀릴 자리가 구조적으로 없다. 예시를 주는 쪽은
 * 57% 로 나쁘지 않아 보였지만, 말파이트와 다리우스 답에 예시의 "리 신은 Q 를…" 이
 * 그대로 실려 나왔다. 작은 모델에게 예시는 따라 할 형식이 아니라 베낄 내용이다.
 *
 * 그래서 이 경로는 **노트가 있을 때만** 돈다. 스킬 하나나 아이템처럼 줄일 노트가
 * 없는 답에는 해설을 붙이지 않는다. 1B 에게 빈손으로 말을 시키면 지어낸다.
 */
import type { Language } from "@/i18n";
import type { AdvisorAnswer } from "./answer";

const SYSTEM: Record<Language, string> = {
  ko_KR: "당신은 리그 오브 레전드 도우미입니다. 주어진 문장 안의 사실만 씁니다. 자료에 없는 스킬 이름·아이템·수치를 만들지 않습니다. 합니다체로 씁니다.",
  en_US: "You are a League of Legends assistant. Use only the facts in the sentences given. Never invent ability names, items or numbers.",
  zh_CN: "你是一个英雄联盟助手。只使用所给句子中的事实。不要编造技能名称、装备或数值。",
};

const TASK: Record<Language, string[]> = {
  ko_KR: [
    "[할 일] 위 문장들 중 사용자의 질문에 가장 맞는 두 개를 골라, 각각 한 문장으로 줄여 쓰십시오.",
    "- 원문의 낱말을 그대로 씁니다. 바꾸어 말하지 않습니다.",
    "- 원문에 없는 내용을 더하지 않습니다.",
    "- 번호 없이 문장만 씁니다.",
  ],
  en_US: [
    "[Task] Pick the two sentences above that best answer the user's question and shorten each to one sentence.",
    "- Keep the original wording. Do not paraphrase.",
    "- Add nothing that is not in the original.",
    "- Write sentences only, without numbering.",
  ],
  zh_CN: [
    "[任务] 从上面的句子中选出最能回答用户问题的两句，各自压缩为一句话。",
    "- 保留原文用词，不要改写。",
    "- 不要添加原文没有的内容。",
    "- 只写句子，不要编号。",
  ],
};

const HEADER: Record<Language, string> = { ko_KR: "[문장들]", en_US: "[Sentences]", zh_CN: "[句子]" };

/**
 * 재료로 쓸 노트. 질문이 가리킨 쪽을 앞세운다.
 *
 * 양쪽을 다 물었으면 플레이 쪽 둘에 상대 쪽 하나를 섞는다. 1B 에게 여섯 문장을 주면
 * 고르는 일 자체를 버거워한다.
 */
function material(answer: AdvisorAnswer): string[] {
  if (answer.kind !== "champion" || !answer.notes) return [];
  const { playing, against, perspective } = answer.notes;
  // 셋까지만 준다. 넷을 줬더니 답이 길어지면서 고르는 일 자체가 흐려졌다.
  // 순서는 `noteSelect` 가 질문의 갈래로 이미 매겨 두었다.
  if (perspective === "against") return against.slice(0, 3);
  if (perspective === "playing") return playing.slice(0, 3);
  return [...playing.slice(0, 2), ...against.slice(0, 1)];
}

/**
 * 간이 모델용 지시문. 시킬 것이 없으면 비운다(해설 없이 카드만 나간다).
 *
 * 질문은 여기 넣지 않는다. 앱이 사용자 발화로 따로 보내므로 그 배치 그대로 잰 값이다.
 */
export function buildLitePrompt(answer: AdvisorAnswer, lang: Language = "ko_KR"): string | undefined {
  const notes = material(answer);
  if (notes.length === 0) return undefined;
  const words = { system: SYSTEM[lang] ?? SYSTEM.ko_KR, task: TASK[lang] ?? TASK.ko_KR, header: HEADER[lang] ?? HEADER.ko_KR };
  return [words.system, "", words.header, ...notes.map((note, index) => `${index + 1}. ${note}`), "", ...words.task].join("\n");
}

/**
 * 간이 모델이 뱉은 글을 치운다.
 *
 * "번호 없이 쓰십시오" 를 안 지키고 같은 말을 두 번 쓴다. 프롬프트로 고치려 애쓰는
 * 것보다 코드로 지우는 편이 확실하고, 지시를 하나 줄이면 남은 지시를 더 잘 따른다.
 *
 * 중복은 글자가 같은 것만으로는 안 잡힌다. "야스오가 직선상에서 벗어나는 습관을
 * 들입니다" 와 "야스오가 다가올 때 직선상에서 벗어나는 습관을 들입니다" 가 나란히
 * 나왔다. 어절이 많이 겹치면 같은 말로 본다.
 */
export function tidyLite(text: string, limit = 2): string {
  const kept: string[] = [];
  const keptWords: Array<Set<string>> = [];
  for (const raw of text.split(/(?<=[.!?。])(?=\s|$)|\n+/)) {
    const line = raw
      .replace(/^\s*(?:[-*·]|\d+[.)])\s*/, "")
      .replace(/\*\*/g, "")
      .trim();
    if (line.length < 8) continue;
    const words = new Set(line.split(/\s+/).filter((word) => word.length > 1));
    const same = keptWords.some((prev) => {
      const shared = [...words].filter((word) => prev.has(word)).length;
      // 겹친 어절 수를 **긴 쪽**으로 나눈다. 짧은 쪽으로 나누면 "첫 문장입니다" 와
      // "둘째 문장입니다" 처럼 한 어절만 겹쳐도 같은 말이 되어 버린다. 셋 미만이
      // 겹친 것은 아예 보지 않는 것도 같은 이유다.
      return shared >= 3 && shared / Math.max(words.size, prev.size) >= 0.7;
    });
    if (same) continue;
    kept.push(line);
    keptWords.push(words);
    if (kept.length >= limit) break;
  }
  return kept.join(" ");
}

/**
 * 간이 모델의 생성 상한.
 *
 * 4B 에는 상한을 두지 않는다 — 할 말의 양이 길이를 정한다. 1B 는 다르다. 상한 없이
 * 돌렸더니 16챔피언 평가가 25분을 넘기고도 안 끝났다. 스스로 멈추지 않는다.
 * 브라우저에서 15 tok/s 이므로 400토큰이면 30초 근방이고, 어차피 두 문장만 쓴다.
 */
export const LITE_MAX_TOKENS = 400;
