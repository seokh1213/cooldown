import { answerKey, type AdvisorAnswer } from "./answer";
import { referenceKey } from "./referenceIdentity";

export interface AnswerGroup {
  key: string;
  answer: AdvisorAnswer;
  answers: AdvisorAnswer[];
}

/** 전체 스킬 자료가 있는 답만 합친다. 원래 답과 저장된 대화는 유지한다. */
export function groupReferenceAnswers(answers: readonly AdvisorAnswer[]): AnswerGroup[] {
  const groups = new Map<string, AnswerGroup>();
  for (const [index, answer] of answers.entries()) {
    const key = answer.kind === "spell" && answer.card ? referenceKey(answer) : `${answerKey(answer)}:${index}`;
    const group = groups.get(key);
    if (group) group.answers.push(answer);
    else groups.set(key, { key, answer, answers: [answer] });
  }
  return [...groups.values()];
}

export function isReferenceAnswer(answer: AdvisorAnswer): boolean {
  return answer.kind === "spell" || answer.kind === "champion" || answer.kind === "compare" || answer.kind === "item";
}
