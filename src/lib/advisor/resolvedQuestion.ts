/** 각 하위 질문의 이름·슬롯·조회 초점을 한 번 읽어 대화와 자료 계획이 공유한다. */
import type { AdvisorData } from "./context";
import { detectSlot } from "./context";
import { detectChampionMentions, type ChampionMention } from "./intent";
import { detectSpellFocus } from "./spellFocus";

export interface ResolvedQuestion {
  text: string;
  champions: ChampionMention["card"][];
  mentions: ChampionMention[];
  slot?: string;
  slotIndex?: number;
  spellFocus: ReturnType<typeof detectSpellFocus>;
}
export type QuestionInput = string | ResolvedQuestion;

export function resolveQuestion(input: QuestionInput, data: AdvisorData): ResolvedQuestion {
  if (typeof input !== "string") return input;
  const mentions = detectChampionMentions(data, input);
  const letter = /(^|[^A-Za-z])([QWERqwer])($|[^A-Za-z])/.exec(input);
  const slotIndex = letter ? letter.index + letter[1].length : undefined;
  return { text: input, mentions, champions: mentions.map(m => m.card), slot: detectSlot(input), slotIndex, spellFocus: detectSpellFocus(input) };
}
