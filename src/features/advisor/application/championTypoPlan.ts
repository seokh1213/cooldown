/** 이름 오타의 후보가 하나일 때만 고친다. 여러 후보는 선택 카드로 남긴다. */
import type { ChampionCard } from "@/domain/knowledge/facts";
import type { AdvisorData } from "../conversation/context";
import type { AnswerPlan } from "../contracts/planTypes";
import { suggestChampions } from "../understanding/championTypo";
import { nicknames } from "../understanding/intent";
import { isGameWord } from "../retrieval/questionDocs";

export function championTypoPlan(question: string, data: AdvisorData,
  context: { champions: ChampionCard[]; inMatchup: boolean }): AnswerPlan | undefined {
  const known = new Set(context.champions.map(card => card.id));
  const typo = suggestChampions(question, data.cards, nicknames(data.cards), known, context.inMatchup ? 3 : 1,
    token => isGameWord(data, token));
  if (typo?.candidates.length === 1) return { type: "retry", question: question.replace(typo.original, typo.candidates[0].name) };
  if (typo && typo.candidates.length > 1) return { type: "code", answer: { kind: "suggestion", original: typo.original, candidates: typo.candidates }, pending: true };
  return undefined;
}
