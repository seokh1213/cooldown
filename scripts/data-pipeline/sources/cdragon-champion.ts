import { fetchJson } from "../io/json";
import type { Champion } from "../../../src/types";

type CDragonRecord = Record<string, unknown>;

function modifiableValue(value: unknown): number | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const baseValue = (value as CDragonRecord).baseValue;
  return typeof baseValue === "number" && Number.isFinite(baseValue)
    ? baseValue
    : undefined;
}

export function mergeCDragonChampionStats(
  champion: Champion,
  source: Record<string, unknown>,
): Champion {
  const root = Object.entries(source).find(([key, value]) =>
    key.endsWith("/CharacterRecords/Root") && typeof value === "object" && value !== null
  )?.[1] as CDragonRecord | undefined;
  const attackDamagePerLevel = modifiableValue(root?.damagePerLevelModifiable);
  if (attackDamagePerLevel === undefined) return champion;
  return {
    ...champion,
    stats: {
      ...champion.stats,
      attackdamageperlevel: attackDamagePerLevel,
    },
  };
}

export async function fetchCDragonChampion(
  championId: string,
  cdragonVersion: string,
): Promise<Record<string, unknown>> {
  const sourceId = championId.toLowerCase();
  const url =
    `https://raw.communitydragon.org/${cdragonVersion}/game/data/characters/` +
    `${sourceId}/${sourceId}.bin.json`;
  // 재시도가 있는 공용 헬퍼를 쓴다. raw fetch 로 두면 ECONNRESET 한 번에
  // 전체 생성이 죽는다 (CI 실패 사례 2026-09-04).
  try {
    return await fetchJson<Record<string, unknown>>(url);
  } catch (error) {
    throw new Error(
      `[CD] ${championId} missing from ${cdragonVersion}: ${(error as Error).message}`,
    );
  }
}
