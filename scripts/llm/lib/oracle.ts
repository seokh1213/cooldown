/**
 * 통계 오라클 로더와 프롬프트 변환
 *
 * `npm run oracle:build` 가 만든 lol.ps 통계를 조언에 쓰기 좋은 형태로 꺼낸다.
 *
 * 통계를 다룰 때의 원칙
 * - **표본이 작은 항목은 버린다.** 픽률 1~2% 조합까지 들어 있어 그대로 쓰면 잡음이 된다.
 * - **버전을 함께 말한다.** 어떤 패치·지역·티어 기준인지 프롬프트에 남긴다.
 * - **상대를 구분하지 못한다.** 챔피언·라인 단위 통계이므로 상성 한정 지식보다 뒤에 둔다.
 */
import * as fs from "fs";
import * as path from "path";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./data";

export interface OracleNamedRate {
  id: number;
  name: string;
  winRate: number;
  pickRate: number;
  count: number;
}

export interface OracleNamedSetRate {
  names: string[];
  winRate: number;
  pickRate: number;
  count: number;
}

export interface OracleSkillRow {
  skills: string[];
  winRate: number;
  pickRate: number;
  count: number;
}

export interface OracleLane {
  laneId: number;
  lane: string;
  laneLabel: string;
  games?: number;
  skillOrder: {
    lv1?: OracleSkillRow[];
    lv3?: OracleSkillRow[];
    lv6?: OracleSkillRow[];
    lv11?: OracleSkillRow[];
    master?: OracleSkillRow[];
  };
  items: {
    starting: OracleNamedSetRate[];
    boots: OracleNamedRate[];
    core1: OracleNamedRate[];
    core2: OracleNamedRate[];
    core3: OracleNamedRate[];
    coreOrder2: OracleNamedSetRate[];
    coreOrder3: OracleNamedSetRate[];
  };
  runes: {
    keystone: OracleNamedRate[];
    main2: OracleNamedRate[];
    main3: OracleNamedRate[];
    main4: OracleNamedRate[];
    sub: OracleNamedRate[];
    pages: OracleNamedSetRate[];
    shards: OracleNamedSetRate[];
  };
  summoners: OracleNamedSetRate[];
  features?: {
    totalChampions: number;
    killsAt14: { value: number; rank: number };
    deathsAt14: { value: number; rank: number };
    assistsAt14: { value: number; rank: number };
    csAt14: { value: number; rank: number };
    damagePerMin: { value: number; rank: number };
    turretPlates: { value: number; rank: number };
  };
}

export interface OracleChampion {
  id: string;
  key: number;
  name: string;
  lanes: OracleLane[];
}

export interface OracleFile {
  patchVersion: string;
  lolpsVersionId: number;
  lolpsPatch: string;
  lolpsPatchDate: string;
  regionId: number;
  tierId: number;
  fetchedAt: string;
  championCount: number;
  champions: OracleChampion[];
}

export interface OracleBundle {
  meta: Omit<OracleFile, "champions">;
  byChampion: Map<string, OracleChampion>;
  fileName: string;
}

/** 우리 CLI 의 라인 표기 → 오라클 라인 키 */
const LANE_ALIAS: Record<string, string> = {
  top: "top",
  jungle: "jungle",
  jg: "jungle",
  mid: "mid",
  middle: "mid",
  bot: "bot",
  bottom: "bot",
  adc: "bot",
  support: "support",
  sup: "support",
};

export function loadOracleBundle(patch?: string, fileName?: string): OracleBundle | undefined {
  const dir = path.join(PUBLIC_DATA_ROOT, resolvePatchVersion(patch), "oracle");
  if (!fs.existsSync(dir)) return undefined;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("lolps-") && f.endsWith(".json"))
    .sort();
  const pick = fileName ?? files[0];
  if (!pick) return undefined;
  const parsed = JSON.parse(fs.readFileSync(path.join(dir, pick), "utf8")) as OracleFile;
  const { champions, ...meta } = parsed;
  return {
    meta,
    fileName: pick,
    byChampion: new Map(champions.map((c) => [c.id, c])),
  };
}

export function selectLane(
  champion: OracleChampion | undefined,
  lane?: string,
): OracleLane | undefined {
  if (!champion || champion.lanes.length === 0) return undefined;
  const key = lane ? LANE_ALIAS[lane.toLowerCase()] : undefined;
  if (key) {
    const match = champion.lanes.find((l) => l.lane === key);
    if (match) return match;
  }
  // 라인을 지정하지 않았거나 없는 라인이면 표본이 가장 큰 라인을 쓴다
  return [...champion.lanes].sort((a, b) => (b.games ?? 0) - (a.games ?? 0))[0];
}

/** 표본이 적은 항목을 걸러낸다 */
export function significant<T extends { pickRate: number; count: number }>(
  rows: T[] | undefined,
  { minPickRate = 8, minCount = 200, limit = 3 }: { minPickRate?: number; minCount?: number; limit?: number } = {},
): T[] {
  return (rows ?? [])
    .filter((r) => r.pickRate >= minPickRate && r.count >= minCount)
    .slice(0, limit);
}

const pct = (n: number) => `${n.toFixed(1)}%`;

/** 통계를 사람이 읽는 한 줄로 */
export function rateLabel(row: { pickRate: number; winRate: number; count: number }): string {
  return `픽률 ${pct(row.pickRate)}, 승률 ${pct(row.winRate)}, ${row.count.toLocaleString("ko-KR")}판`;
}

export interface OracleFacts {
  /** 통계 기준 표기 */
  scope: string;
  games?: number;
  lines: string[];
  /** 권장안에 넣을 이름들 */
  picks: {
    startingItems: string[];
    boots: string[];
    coreItems: string[];
    runes: string[];
    shards: string[];
    summoners: string[];
    skillOrder?: string;
    skillOrderDetail?: string;
  };
}

/**
 * 한 라인 통계를 프롬프트용 사실과 권장안 후보로 바꾼다.
 * 표본이 작은 항목은 제외하고, 각 항목에 픽률·승률·표본을 붙인다.
 */
export function oracleFacts(bundle: OracleBundle, lane: OracleLane): OracleFacts {
  const { meta } = bundle;
  const scope = `${meta.lolpsPatch} 패치 (lol.ps versionId ${meta.lolpsVersionId}, ${meta.lolpsPatchDate}), region ${meta.regionId}, tier ${meta.tierId}`;
  const lines: string[] = [];

  const master = significant(lane.skillOrder.master, { minPickRate: 20, minCount: 200, limit: 1 })[0];
  const lv11 = lane.skillOrder.lv11?.[0];
  if (master) {
    lines.push(`선마 순서 ${master.skills.join(" > ")} — ${rateLabel(master)}`);
  }
  if (lv11 && lv11.count >= 200) {
    lines.push(`11레벨까지 찍는 순서 ${lv11.skills.join("")} — ${rateLabel(lv11)}`);
  }

  const starting = significant(lane.items.starting, { minPickRate: 10, limit: 2 });
  if (starting.length) {
    lines.push(
      `시작 아이템 ${starting.map((s) => `${s.names.join(" + ")}(${rateLabel(s)})`).join(", ")}`,
    );
  }
  const boots = significant(lane.items.boots, { minPickRate: 10, limit: 2 });
  if (boots.length) {
    lines.push(`신발 ${boots.map((b) => `${b.name}(${rateLabel(b)})`).join(", ")}`);
  }
  const coreOrder = significant(lane.items.coreOrder3, { minPickRate: 5, minCount: 150, limit: 2 });
  if (coreOrder.length) {
    lines.push(
      `자주 쓰는 코어 순서 ${coreOrder.map((c) => `${c.names.join(" > ")}(${rateLabel(c)})`).join(", ")}`,
    );
  }
  const core1 = significant(lane.items.core1, { minPickRate: 10, limit: 3 });
  if (core1.length) {
    lines.push(`1코어 ${core1.map((c) => `${c.name}(${rateLabel(c)})`).join(", ")}`);
  }

  const page = significant(lane.runes.pages, { minPickRate: 10, minCount: 200, limit: 1 })[0];
  if (page) lines.push(`룬 페이지 ${page.names.join(", ")} — ${rateLabel(page)}`);
  const shards = significant(lane.runes.shards, { minPickRate: 15, limit: 1 })[0];
  if (shards) lines.push(`파편 ${shards.names.join(" / ")} — ${rateLabel(shards)}`);

  const summoners = significant(lane.summoners, { minPickRate: 15, limit: 2 });
  if (summoners.length) {
    lines.push(
      `소환사 주문 ${summoners.map((s) => `${s.names.join(" + ")}(${rateLabel(s)})`).join(", ")}`,
    );
  }

  const f = lane.features;
  if (f) {
    const rank = (label: string, entry: { value: number; rank: number }, digits = 1) =>
      `${label} ${entry.value.toFixed(digits)}(${entry.rank}/${f.totalChampions}위)`;
    lines.push(
      `14분 지표: ${rank("킬", f.killsAt14)}, ${rank("데스", f.deathsAt14)}, ${rank("CS", f.csAt14, 0)}, ${rank("분당 피해", f.damagePerMin, 0)}, ${rank("포탑 방패", f.turretPlates)} — 순위가 낮을수록 상위`,
    );
  }

  return {
    scope,
    games: lane.games,
    lines,
    picks: {
      startingItems: starting[0]?.names ?? [],
      boots: boots.slice(0, 1).map((b) => b.name),
      coreItems: coreOrder[0]?.names ?? core1.slice(0, 2).map((c) => c.name),
      runes: page?.names ?? significant(lane.runes.keystone, { minPickRate: 20, limit: 1 }).map((r) => r.name),
      shards: shards?.names ?? [],
      summoners: summoners[0]?.names ?? [],
      skillOrder: master ? master.skills.join(" > ") : undefined,
      skillOrderDetail: lv11 && lv11.count >= 200 ? lv11.skills.join("") : undefined,
    },
  };
}
