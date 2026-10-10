import type { QualityStory, SourceRef } from "./types";

export interface ReviewedContract {
  id: string;
  question: string;
  sources: SourceRef[];
  expected: Record<string, unknown>;
  review: "contract" | "historical-semantic";
  reason: string;
  patch: string;
}

/** 원래 질문·대화 ID를 유지하고, 검수한 기대값 변경은 bankHash로 추적한다. */
export function applyReviewedContracts(stories: QualityStory[], contracts: ReviewedContract[]): QualityStory[] {
  const remaining = new Map(contracts.map(entry => [entry.id, entry]));
  if (remaining.size !== contracts.length) throw new Error("Duplicate reviewed contract");
  const result = stories.map(story => {
    let reviewed = 0;
    const turns = story.turns.map((turn, index) => {
      const id = `${story.id}:${index}`, entry = remaining.get(id);
      if (!entry) return turn;
      if (entry.question !== turn.q || !entry.reason.trim() || !Object.keys(entry.expected).length
        || !entry.sources.every(source => story.sources.some(s => s.file === source.file && s.row === source.row))) {
        throw new Error(`Reviewed contract no longer matches source: ${id}`);
      }
      remaining.delete(id);
      if (entry.review === "contract") reviewed++;
      const expected: Record<string, unknown> = { ...turn.expected, ...entry.expected, contractReview: entry.reason };
      // 검수 대상의 과거 오답을 문자열 일치 기준으로 보호하지 않는다.
      delete expected.sameAsBaseline;
      return { ...turn, expected };
    });
    return { ...story, turns, manual: story.manual && reviewed !== story.turns.length };
  });
  if (remaining.size) throw new Error(`Reviewed contracts missing from bank: ${[...remaining.keys()].join(", ")}`);
  return result;
}
