import { fetchJson } from "../io/json";

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
