export async function fetchCDragonChampion(
  championId: string,
  cdragonVersion: string,
): Promise<Record<string, unknown>> {
  const sourceId = championId.toLowerCase();
  const url =
    `https://raw.communitydragon.org/${cdragonVersion}/game/data/characters/` +
    `${sourceId}/${sourceId}.bin.json`;
  console.log(`Fetching exact CDragon: ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `[CD] ${championId} missing from ${cdragonVersion}: HTTP ${response.status}`,
    );
  }
  return (await response.json()) as Record<string, unknown>;
}
