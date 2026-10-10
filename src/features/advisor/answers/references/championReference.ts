/** 질문의 범위와 자료 카드의 범위를 분리한다. 원래 답·기억·저장 형식은 바꾸지 않는다. */
import type { AdvisorAnswer } from "../answer";

export function championReferenceOf(answer: AdvisorAnswer): Extract<AdvisorAnswer, { kind: "champion" }> | undefined {
  if (answer.kind === "champion") return answer;
  if (answer.kind === "spell" && answer.card) return { kind: "champion", card: answer.card, view: "skills" };
  if (answer.kind === "compare" && answer.cards.length === 1 && answer.statQuery && !answer.matchup) {
    return { kind: "champion", card: answer.cards[0], statQuery: answer.statQuery };
  }
  return undefined;
}
