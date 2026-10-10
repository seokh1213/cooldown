/** 대화 답의 식별자와 자료의 식별자는 다르다. Q·R 답은 각각 남기되 전체 스킬 자료는 공유한다. */
import { answerKey, type AdvisorAnswer } from "../answer";
import type { HistorySource } from "../../storage/historySnapshot";

export function referenceKey(answer: AdvisorAnswer, source?: HistorySource): string {
  const cardKey = answer.kind === "spell" && answer.card ? `skills:${answer.championId}`
    : answer.kind === "champion" && (answer.view === "skills" || answer.focus) ? `skills:${answer.card.id}`
      : answerKey(answer);
  return source ? `${source.patch}:${source.locale}:${source.ddragonVersion}:${cardKey}` : cardKey;
}

/** 같은 자료는 최신 답의 포커스만 갱신한다. 탭의 위치는 처음 열었을 때의 순서를 유지한다. */
export function referenceTabsOf<T extends { answer?: AdvisorAnswer; source?: HistorySource }>(turns: T[]): T[] {
  const bySource = new Map<string, T>();
  for (const turn of turns) if (turn.answer) bySource.set(referenceKey(turn.answer, turn.source), turn);
  return [...bySource.values()];
}
