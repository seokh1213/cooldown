/**
 * lol.ps 통계 API 클라이언트
 *
 * 엔드포인트와 파라미터는 lol.ps 웹 앱 번들에서 확인했다.
 *   /api/info/active-version.json                                   패치 → versionId 대응
 *   /api/champ/{championId}/skill.json?region&version&tier&lane     스킬 순서 통계
 *   /api/champ/{championId}/spellitem.json?...                      아이템·소환사 주문 통계
 *   /api/champ/{championId}/runestatperk.json?...                   룬·파편 통계
 *   /api/champ/{championId}/champ-lane-features.json?...            14분 지표와 순위
 *
 * 파라미터
 *   lane   0 탑, 1 정글, 2 미드, 3 바텀, 4 서포터 (번들의 TOP/JUNGLE/MIDDLE/BOTTOM/SUPPORT)
 *   tier   사이트 기본값은 2. 표본 크기로 보면 1 이 가장 넓다(아트록스 탑 26.17 기준 59,394판).
 *          번들에서 티어 라벨을 찾지 못해 확정하지 못했으므로 수집물에 표본 수를 함께 남긴다.
 *   region 0 (사이트 기본값)
 *
 * 응답은 그대로 research/.oracle-cache/ 에 저장하고 재실행 시 캐시를 쓴다.
 * 캐시 경로에 versionId·tier·region 이 들어가므로 패치가 다르면 통계도 분리된다.
 */
import * as fs from "fs";
import * as path from "path";

export const LOLPS_BASE = "https://lol.ps/api";
export const CACHE_ROOT = path.resolve(process.cwd(), "research", ".oracle-cache", "lolps");
const UA = "cooldown-oracle/1.0 (+https://github.com/seokh1213/cooldown)";

export const LANES = [
  { id: 0, key: "top", label: "탑" },
  { id: 1, key: "jungle", label: "정글" },
  { id: 2, key: "mid", label: "미드" },
  { id: 3, key: "bot", label: "바텀" },
  { id: 4, key: "support", label: "서포터" },
] as const;

export type LaneKey = (typeof LANES)[number]["key"];

/** 위키 포지션 표기 → lol.ps laneId */
export const WIKI_POSITION_TO_LANE: Record<string, number> = {
  Top: 0,
  Jungle: 1,
  Middle: 2,
  Bottom: 3,
  Support: 4,
};

export interface LolpsVersion {
  versionId: number;
  /** 게임 패치 표기 (예: "26.17") */
  description: string;
  patchDate: string;
  isActive: boolean;
}

export interface RateEntry {
  winRate: string;
  pickRate: string;
  count: number;
}

export interface SkillOrderEntry extends RateEntry {
  skillNameList: string[];
}

export interface SkillStats {
  championId: number;
  versionId: number;
  tierId: number;
  laneId: number;
  lv1: SkillOrderEntry[];
  lv3: SkillOrderEntry[];
  lv6: SkillOrderEntry[];
  lv11: SkillOrderEntry[];
  lv15: SkillOrderEntry[];
  master: SkillOrderEntry[];
}

/** th1~th5, shoes: 단일 아이템 */
export interface ItemEntry extends RateEntry {
  itemId: number;
}

/** starting: 아이템 묶음 (중첩 배열), till2~till6: 코어 순서 조합 */
export interface ItemSetEntry extends RateEntry {
  itemIdList: Array<number | number[]>;
}

export interface SpellEntry extends RateEntry {
  spell1Id: number;
  spell2Id: number;
}

export interface SpellItemStats {
  itemWinrates: {
    championId: number;
    th1?: ItemEntry[];
    th2?: ItemEntry[];
    th3?: ItemEntry[];
    th4?: ItemEntry[];
    th5?: ItemEntry[];
    shoes?: ItemEntry[];
    starting?: ItemSetEntry[];
    support?: ItemEntry[];
    /** 코어 2~6개 조합 (순서 포함) */
    till2?: ItemSetEntry[];
    till3?: ItemSetEntry[];
    till4?: ItemSetEntry[];
    till5?: ItemSetEntry[];
    till6?: ItemSetEntry[];
  };
  spellWinrates: SpellEntry[];
}

export interface RuneEntry extends RateEntry {
  runeId: number;
}

/** total: 완성된 룬 페이지 조합 */
export interface RunePageEntry extends RateEntry {
  category1RuneIdList: number[];
  category2RuneIdList: number[];
  runeCategory1: number;
  runeCategory2: number;
}

/** statperk: 파편 3개 조합 */
export interface StatPerkEntry extends RateEntry {
  statperkIdList: number[];
}

export interface RuneStatPerkStats {
  runeWinrates: {
    championId: number;
    main1?: RuneEntry[];
    main2?: RuneEntry[];
    main3?: RuneEntry[];
    main4?: RuneEntry[];
    sub1?: RuneEntry[];
    sub2?: RuneEntry[];
    total?: RunePageEntry[];
  };
  statperkWinrates: StatPerkEntry[];
}

export interface LaneFeatureStats {
  championId: number;
  totalChampions: number;
  count: number;
  avgKillsAt14min: number;
  avgKillsAt14minRank: number;
  avgDeathsAt14min: number;
  avgDeathsAt14minRank: number;
  avgAssistsAt14min: number;
  avgAssistsAt14minRank: number;
  avgTurretPlatesTaken: number;
  avgTurretPlatesTakenRank: number;
  avgDamageDealtToChampionsPerMin: number;
  avgDamageDealtToChampionsPerMinRank: number;
  avgCsAt14min: number;
  avgCsAt14minRank: number;
}

export interface QueryScope {
  region: number;
  version: number;
  tier: number;
  lane: number;
}

interface FetchOptions {
  refresh?: boolean;
  /** 요청 간 대기 (밀리초) */
  delayMs?: number;
}

let lastRequestAt = 0;

async function throttle(delayMs: number) {
  const wait = lastRequestAt + delayMs - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

function cachePath(kind: string, scope: QueryScope | undefined, id: string): string {
  const scopeDir = scope
    ? path.join(`v${scope.version}`, `r${scope.region}`, `t${scope.tier}`, `lane${scope.lane}`)
    : "global";
  return path.join(CACHE_ROOT, scopeDir, kind, `${id}.json`);
}

async function fetchJson<T>(url: string, file: string, opts: FetchOptions): Promise<T | undefined> {
  if (!opts.refresh && fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  }
  await throttle(opts.delayMs ?? 250);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
      const text = await res.text();
      if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 120)}`);
      const parsed = JSON.parse(text) as { data?: T; message?: string };
      if (parsed.message) throw new Error(parsed.message);
      if (parsed.data === undefined) return undefined;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, `${JSON.stringify(parsed.data)}\n`, "utf8");
      return parsed.data;
    } catch (err) {
      if (attempt === 3) {
        console.error(`  요청 실패: ${url} — ${err instanceof Error ? err.message : err}`);
        return undefined;
      }
      await new Promise((r) => setTimeout(r, attempt * 500));
    }
  }
  return undefined;
}

export async function fetchVersions(opts: FetchOptions = {}): Promise<LolpsVersion[]> {
  const data = await fetchJson<LolpsVersion[]>(
    `${LOLPS_BASE}/info/active-version.json`,
    cachePath("versions", undefined, "active-version"),
    { ...opts, refresh: true }, // 버전 목록은 항상 새로 받는다
  );
  return data ?? [];
}

const scopeQuery = (s: QueryScope) =>
  `region=${s.region}&version=${s.version}&tier=${s.tier}&lane=${s.lane}`;

export function fetchSkillStats(championId: number, scope: QueryScope, opts: FetchOptions = {}) {
  return fetchJson<SkillStats>(
    `${LOLPS_BASE}/champ/${championId}/skill.json?${scopeQuery(scope)}`,
    cachePath("skill", scope, String(championId)),
    opts,
  );
}

export function fetchSpellItemStats(championId: number, scope: QueryScope, opts: FetchOptions = {}) {
  return fetchJson<SpellItemStats>(
    `${LOLPS_BASE}/champ/${championId}/spellitem.json?${scopeQuery(scope)}`,
    cachePath("spellitem", scope, String(championId)),
    opts,
  );
}

export function fetchRuneStats(championId: number, scope: QueryScope, opts: FetchOptions = {}) {
  return fetchJson<RuneStatPerkStats>(
    `${LOLPS_BASE}/champ/${championId}/runestatperk.json?${scopeQuery(scope)}`,
    cachePath("runestatperk", scope, String(championId)),
    opts,
  );
}

export function fetchLaneFeatures(championId: number, scope: QueryScope, opts: FetchOptions = {}) {
  return fetchJson<LaneFeatureStats>(
    `${LOLPS_BASE}/champ/${championId}/champ-lane-features.json?${scopeQuery(scope)}`,
    cachePath("lane-features", scope, String(championId)),
    opts,
  );
}
