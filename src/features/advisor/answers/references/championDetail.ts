import type { ChampionDetailV2 } from "@/domain/game/contracts/championData";
import { decodeChampionDetail } from "@/domain/game/contracts/championDataDecoder";
import { createStaticDataClient } from "@/infrastructure/http/staticDataClient";
import type { HistorySource } from "../../storage/historySnapshot";

const client = createStaticDataClient();
const requests = new Map<string, Promise<ChampionDetailV2>>();

export function matchesDetailSource(detail: ChampionDetailV2, source: HistorySource, id: string): boolean {
  return detail.patchVersion === source.patch && detail.locale === source.locale
    && detail.champion.id === id && detail.sources.ddragon === source.ddragonVersion;
}

export function loadAdvisorChampionDetail(source: HistorySource, id: string): Promise<ChampionDetailV2> {
  const key = `${source.patch}:${source.locale}:${id}:${source.ddragonVersion}`;
  const hit = requests.get(key);
  if (hit) return hit;
  const decode = (raw: unknown) => {
    const detail = decodeChampionDetail(raw);
    if (!matchesDetailSource(detail, source, id)) throw new Error("Champion reference identity mismatch");
    return detail;
  };
  const pending = client.getJson(`data/${source.patch}/champions/${source.locale}/${id}.json`, decode).then(decode);
  requests.set(key, pending);
  pending.catch(() => requests.delete(key));
  return pending;
}

export function reviveChampionDetails(raw: unknown, source: HistorySource): Record<string, ChampionDetailV2> {
  const details: Record<string, ChampionDetailV2> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return details;
  for (const [id, value] of Object.entries(raw)) {
    try {
      const detail = decodeChampionDetail(value);
      if (matchesDetailSource(detail, source, id)) details[id] = structuredClone(detail);
    } catch { /* 상세 원본이 깨져도 저장된 기본 카드는 유지한다. */ }
  }
  return details;
}
