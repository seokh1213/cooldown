/**
 * CommunityDragon 빌드 표식
 *
 * **같은 패치에서도 CDragon 출력은 바뀐다.** CDragon 은 게임 BIN 의 속성 이름을 해시로만
 * 가지고 있다가, 커뮤니티가 해시를 풀면 그 이름으로 다시 내보낸다.
 * ("{30412ba3}" → "HealthCostCalc" — 둘은 fnv1a32 로 같은 필드다.)
 *
 * 이게 우리에게 의미가 있다. 스킬 시뮬레이션은 `__type` 과 `mDataValue` 를 **이름으로**
 * 찾으므로, 해시가 안 풀린 항목은 조회에 실패해 그 스킬을 계산하지 못한다.
 * 26.17 기준으로 여덟 개 스킬이 그 이유로 미완성이었다. 해시가 풀리면 그만큼 늘어난다.
 *
 * 그래서 패치 버전만 보고 "바뀐 게 없다" 고 판단하면 이 개선을 놓친다.
 * 여기서 만드는 표식을 version.json 에 남겨 두고, 다음 회차에 비교한다.
 */
const BASE = "https://raw.communitydragon.org";

export interface CdragonBuild {
  /** Riot 콘텐츠 빌드 (예: 16.18.8159717+branch.releases-16-18.content.release) */
  content: string;
  /** CDragon 이 characters 트리를 마지막으로 내보낸 시각 */
  characters: string;
}

interface DirectoryEntry {
  name?: unknown;
  mtime?: unknown;
}

async function fetchJson(url: string): Promise<unknown | undefined> {
  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;
    return await response.json();
  } catch {
    return undefined;
  }
}

/**
 * 표식을 만든다. 조회에 실패하면 undefined 를 준다.
 *
 * 표식이 없으면 비교할 수 없으니 다음 회차는 그냥 다시 만든다.
 * 놓치는 것보다 한 번 더 만드는 편이 낫다.
 */
export async function fetchCdragonBuild(
  cdragonVersion: string,
): Promise<CdragonBuild | undefined> {
  const metadata = await fetchJson(`${BASE}/${cdragonVersion}/content-metadata.json`);
  const listing = await fetchJson(`${BASE}/json/${cdragonVersion}/game/data/`);

  const content =
    typeof (metadata as { version?: unknown })?.version === "string"
      ? ((metadata as { version: string }).version)
      : undefined;

  const characters = Array.isArray(listing)
    ? (listing as DirectoryEntry[]).find((entry) => entry.name === "characters")?.mtime
    : undefined;

  if (!content || typeof characters !== "string") return undefined;
  return { content, characters };
}
