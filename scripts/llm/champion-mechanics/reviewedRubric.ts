import { mergeStories } from "../quality/bank";
import { applyReviewedContracts, type ReviewedContract } from "../quality/reviewedContracts";
import type { ExpectedTurn } from "./evaluate";

export interface MechanicsStory { id: string; area: string; turns: ExpectedTurn[] }
export const MECHANICS_QUESTIONS = "research/llm-evals/champion-mechanics-v2/questions.json";

/** 배포 검사도 통합 회귀와 같은 검수 계약을 사용한다. 원본 질문과 출처가 달라지면 거부한다. */
export function reviewedRubric(stories: MechanicsStory[], contracts: ReviewedContract[]): MechanicsStory[] {
  const bank = mergeStories(stories.map(story => ({ id: "", suites: ["champion-mechanics-v2/questions"],
    sources: [{ file: MECHANICS_QUESTIONS, row: story.id }], lang: story.turns[0].lang ?? "ko_KR",
    turns: story.turns.map(turn => ({ q: turn.q, expected: { ...turn } })), split: "regression", manual: false })));
  const reviewed = applyReviewedContracts(bank, contracts.filter(entry => entry.sources.some(source => source.file === MECHANICS_QUESTIONS)));
  return stories.map(story => {
    const entry = reviewed.find(row => row.sources.some(source => source.file === MECHANICS_QUESTIONS && source.row === story.id));
    if (!entry) throw new Error(`Missing mechanics rubric: ${story.id}`);
    return { ...story, turns: entry.turns.map(turn => ({ ...turn.expected, q: turn.q }) as ExpectedTurn) };
  });
}
