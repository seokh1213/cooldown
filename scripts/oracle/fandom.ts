/**
 * LoL Fandom 위키를 세 번째 오라클로 쓴다.
 *
 * lol.ps·poro.gg 는 Riot 데이터를 각자 렌더한 결과라, 우리와 같은 원본을
 * 같은 방식으로 잘못 읽으면 둘 다 같이 틀린다. Fandom 은 사람이 손으로
 * 적고 검증한 문서라 그 종류의 오류를 잡아 준다.
 * (실제로 "추가 주문력" 을 "공격력" 으로 읽던 버그가 이 축에서 드러난다)
 *
 * 수집 경로
 *   1. Module:ChampionData/data  → 챔피언별 스킬 이름
 *   2. Template:Data <챔피언>/<스킬 이름>  → leveling 필드에 계수가 명시됨
 *
 * 위키 문서는 CC BY-SA 라 대조 용도로만 쓰고 앱에 싣지 않는다.
 */
const API = "https://leagueoflegends.fandom.com/api.php";
const USER_AGENT = "cooldown-oracle-research/1.0 (tooltip verification)";

/** 한 번에 넘길 수 있는 문서 수 (MediaWiki 기본 상한) */
const TITLES_PER_REQUEST = 50;

export interface FandomAbility {
  slot: "I" | "Q" | "W" | "E" | "R";
  name: string;
  /** Template:Data ... 원문 */
  wikitext: string;
}

interface RevisionPage {
  title: string;
  missing?: boolean;
  revisions?: { slots: { main: { content?: string } } }[];
}

async function queryPages(titles: string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (let index = 0; index < titles.length; index += TITLES_PER_REQUEST) {
    const batch = titles.slice(index, index + TITLES_PER_REQUEST);
    const url = new URL(API);
    url.searchParams.set("action", "query");
    url.searchParams.set("prop", "revisions");
    url.searchParams.set("rvprop", "content");
    url.searchParams.set("rvslots", "main");
    url.searchParams.set("format", "json");
    url.searchParams.set("formatversion", "2");
    url.searchParams.set("titles", batch.join("|"));

    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!response.ok) {
      throw new Error(`Fandom API ${response.status} ${response.statusText}`);
    }
    const payload = (await response.json()) as {
      query?: { pages?: RevisionPage[]; normalized?: { from: string; to: string }[] };
    };
    // API 가 제목을 정규화(_ → 공백)해 돌려주므로 원래 제목으로 되돌린다
    const toOriginal = new Map(
      (payload.query?.normalized ?? []).map((entry) => [entry.to, entry.from]),
    );
    for (const page of payload.query?.pages ?? []) {
      const content = page.revisions?.[0]?.slots?.main?.content;
      if (page.missing || !content) continue;
      found.set(toOriginal.get(page.title) ?? page.title, content);
    }
  }
  return found;
}

/** `#REDIRECT [[Template:Data X/Y]]` 를 따라간다 */
function redirectTarget(wikitext: string): string | null {
  const match = /^#REDIRECT\s*\[\[([^\]]+)]]/i.exec(wikitext.trim());
  return match ? match[1].trim() : null;
}

/**
 * Module:ChampionData/data 의 Lua 테이블에서 챔피언별 스킬 이름을 뽑는다.
 * 정식 Lua 파서를 붙일 만한 구조가 아니라 필요한 필드만 읽는다.
 */
export function parseChampionSkills(
  moduleSource: string,
): Map<string, ChampionEntry> {
  const result = new Map<string, ChampionEntry>();
  const championPattern = /\n {2}\["([^"]+)"\]\s*=\s*\{/g;
  const slots = ["i", "q", "w", "e", "r"] as const;

  for (const match of moduleSource.matchAll(championPattern)) {
    const apiName = extractField(moduleSource, match.index, "apiname");
    if (!apiName) continue;
    const skills: Record<string, string[]> = {};
    for (const slot of slots) {
      const raw = extractField(moduleSource, match.index, `skill_${slot}`, true);
      if (!raw) continue;
      const names = [...raw.matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
      if (names.length > 0) skills[slot.toUpperCase()] = names;
    }
    if (Object.keys(skills).length === 0) continue;
    // 문서 제목은 apiname 이 아니라 표시 이름을 쓴다.
    // (apiname "Belveth" ↔ 문서 "Template:Data Bel'Veth/...")
    result.set(apiName, { wikiName: match[1], skills });
  }
  return result;
}

export interface ChampionEntry {
  /** 위키 문서 제목에 쓰이는 이름 (Bel'Veth, Dr. Mundo, Wukong …) */
  wikiName: string;
  skills: Record<string, string[]>;
}

/** 챔피언 블록 안에서 필드 하나를 읽는다 (다음 챔피언 블록 전까지만 본다) */
function extractField(
  source: string,
  blockStart: number,
  field: string,
  isTable = false,
): string | null {
  const nextChampion = source.indexOf('\n  ["', blockStart + 1);
  const end = nextChampion === -1 ? source.length : nextChampion;
  const block = source.slice(blockStart, end);
  const pattern = isTable
    ? new RegExp(`\\["${field}"\\]\\s*=\\s*\\{([^}]*)\\}`)
    : new RegExp(`\\["${field}"\\]\\s*=\\s*"([^"]*)"`);
  const match = pattern.exec(block);
  return match ? match[1] : null;
}

export async function fetchChampionSkillNames(): Promise<
  Map<string, ChampionEntry>
> {
  const pages = await queryPages(["Module:ChampionData/data"]);
  const source = pages.get("Module:ChampionData/data");
  if (!source) throw new Error("Module:ChampionData/data 를 받지 못했다");
  return parseChampionSkills(source);
}

/**
 * 챔피언 하나의 스킬 문서를 모두 받는다.
 * 리다이렉트가 걸린 문서는 한 번 더 따라간다.
 */
export async function fetchChampionAbilities(
  championName: string,
  skills: Record<string, string[]>,
): Promise<FandomAbility[]> {
  const wanted: { slot: FandomAbility["slot"]; name: string; title: string }[] = [];
  for (const [slot, names] of Object.entries(skills)) {
    for (const name of names) {
      wanted.push({
        slot: slot as FandomAbility["slot"],
        name,
        title: `Template:Data ${championName}/${name}`,
      });
    }
  }

  const pages = await queryPages(wanted.map((entry) => entry.title));

  const redirects = new Map<string, string>();
  for (const [title, wikitext] of pages) {
    const target = redirectTarget(wikitext);
    if (target) redirects.set(title, target);
  }
  if (redirects.size > 0) {
    const resolved = await queryPages([...new Set(redirects.values())]);
    for (const [title, target] of redirects) {
      const content = resolved.get(target);
      if (content) pages.set(title, content);
    }
  }

  const abilities: FandomAbility[] = [];
  for (const entry of wanted) {
    const wikitext = pages.get(entry.title);
    if (!wikitext || redirectTarget(wikitext)) continue;
    abilities.push({ slot: entry.slot, name: entry.name, wikitext });
  }
  return abilities;
}
