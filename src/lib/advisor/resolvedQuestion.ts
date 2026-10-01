/** 각 하위 질문의 이름·슬롯·조회 초점을 한 번 읽어 대화와 자료 계획이 공유한다. */
import type { AdvisorData } from "./context";
import { detectSlot } from "./context";
import { detectChampions } from "./intent";
import { detectSpellFocus } from "./spellFocus";

export interface ResolvedQuestion {
  text: string;
  champions: ReturnType<typeof detectChampions>;
  slot?: string;
  spellFocus: ReturnType<typeof detectSpellFocus>;
}
export type QuestionInput = string | ResolvedQuestion;

export function resolveQuestion(input: QuestionInput, data: AdvisorData): ResolvedQuestion {
  if (typeof input !== "string") return input;
  return { text: input, champions: detectChampions(data, input), slot: detectSlot(input), spellFocus: detectSpellFocus(input) };
}
