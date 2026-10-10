import { useEffect, useRef } from "react";
import type { ChampionDetailV2 } from "@/domain/game/contracts/championData";
import { loadAdvisorChampionDetail } from "@/features/advisor/answers/championDetail";
import type { AdvisorTurn } from "./useAdvisorTurns";

export function advisorReferenceChampionIds(turn: Pick<AdvisorTurn, "answer" | "answers">): string[] {
  const ids = new Set<string>();
  for (const answer of turn.answers ?? (turn.answer ? [turn.answer] : [])) {
    switch (answer.kind) {
      case "champion": ids.add(answer.card.id); break;
      case "spell": ids.add(answer.championId); break;
      case "compare": for (const card of answer.cards) ids.add(card.id); break;
      case "suggestion": for (const card of answer.candidates) ids.add(card.id); break;
    }
  }
  return [...ids];
}

export function useAdvisorHistoryDetails(turns: AdvisorTurn[], attach: (id: number, detail: ChampionDetailV2) => void) {
  const requested = useRef(new Set<string>());
  useEffect(() => {
    for (const turn of turns) {
      if (turn.role !== "assistant" || turn.historical || !turn.source) continue;
      const source = turn.source;
      for (const id of advisorReferenceChampionIds(turn)) {
        if (turn.details?.[id]) continue;
        const key = `${turn.id}:${source.patch}:${source.locale}:${source.ddragonVersion}:${id}`;
        if (requested.current.has(key)) continue;
        requested.current.add(key);
        void loadAdvisorChampionDetail(source, id).then(detail => attach(turn.id, detail))
          .catch(() => { /* 저장된 기본 카드는 상세 요청 실패와 관계없이 유지한다. */ });
      }
    }
  }, [turns, attach]);
}
