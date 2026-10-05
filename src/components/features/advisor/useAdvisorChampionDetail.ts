import { useEffect, useState } from "react";
import type { Language } from "@/i18n";
import type { ChampionDetailV2 } from "@/data/contracts/championData";
import { decodeChampionDetail } from "@/data/contracts/championDataDecoder";
import { createStaticDataClient } from "@/data/http/staticDataClient";

const client = createStaticDataClient();
const requests = new Map<string, Promise<ChampionDetailV2>>();

function loadDetail(patch: string, lang: Language, id: string, ddragon: string): Promise<ChampionDetailV2> {
  const key = `${patch}:${lang}:${id}:${ddragon}`;
  const hit = requests.get(key);
  if (hit) return hit;
  const pending = client.getJson(`data/${patch}/champions/${lang}/${id}.json`).then(raw => {
    const detail = decodeChampionDetail(raw);
    if (detail.patchVersion !== patch || detail.locale !== lang || detail.champion.id !== id || detail.sources.ddragon !== ddragon) {
      throw new Error("Champion reference identity mismatch");
    }
    return detail;
  });
  requests.set(key, pending);
  pending.catch(() => requests.delete(key));
  return pending;
}

/** 챔피언당 한 파일을 공유한다. 상세 자료를 못 받아도 기존 카드의 스탯·스킬은 즉시 표시한다. */
export function useAdvisorChampionDetail(patch: string, lang: Language, id: string, ddragon: string) {
  const key = `${patch}:${lang}:${id}:${ddragon}`;
  const [result, setResult] = useState<{ key: string; detail: ChampionDetailV2 }>();
  useEffect(() => {
    let alive = true;
    loadDetail(patch, lang, id, ddragon).then(detail => {
      if (alive) setResult({ key, detail });
    }).catch(() => { /* 검증된 기존 카드로 계속 표시한다. */ });
    return () => { alive = false; };
  }, [patch, lang, id, ddragon, key]);
  return result?.key === key ? result.detail : undefined;
}
