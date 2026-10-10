import { useEffect, useState } from "react";
import type { Language } from "@/shared/i18n";
import type { ChampionDetailV2 } from "@/domain/game/contracts/championData";
import { loadAdvisorChampionDetail, matchesDetailSource } from "@/features/advisor/answers/championDetail";
import { useHistoryReference } from "../history/HistoryReference";

/** 챔피언당 한 파일을 공유한다. 상세 자료를 못 받아도 기존 카드의 스탯·스킬은 즉시 표시한다. */
export function useAdvisorChampionDetail(patch: string, lang: Language, id: string, ddragon: string) {
  const turn = useHistoryReference();
  const historical = Boolean(turn?.historical);
  const sourcePatch = turn?.source?.patch ?? patch;
  const locale = turn?.source?.locale ?? lang;
  const ddragonVersion = turn?.source?.ddragonVersion ?? ddragon;
  const source = { patch: sourcePatch, locale, ddragonVersion };
  const saved = turn?.details?.[id];
  const snapshot = saved && (!historical || turn?.source) && matchesDetailSource(saved, source, id) ? saved : undefined;
  const key = `${sourcePatch}:${locale}:${id}:${ddragonVersion}`;
  const [result, setResult] = useState<{ key: string; detail: ChampionDetailV2 }>();
  useEffect(() => {
    if (historical || snapshot) return;
    let alive = true;
    loadAdvisorChampionDetail({ patch: sourcePatch, locale, ddragonVersion }, id).then(detail => {
      if (alive) setResult({ key, detail });
    }).catch(() => { /* 검증된 기존 카드로 계속 표시한다. */ });
    return () => { alive = false; };
  }, [historical, snapshot, sourcePatch, locale, id, ddragonVersion, key]);
  return snapshot ?? (!historical && result?.key === key ? result.detail : undefined);
}
