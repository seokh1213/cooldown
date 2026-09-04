/**
 * 통계 오라클 조회
 *
 * 수집한 lol.ps 통계를 사람이 읽는 형태로 출력한다.
 * 버전이 다른 파일이 여러 개 있으면 목록에서 고른다.
 *
 * 사용:
 *   npm run oracle:query -- --champ 나서스
 *   npm run oracle:query -- --champ Nasus --lane top
 *   npm run oracle:query -- --list                 # 수집된 오라클 파일 목록
 *   npm run oracle:query -- --champ 아트록스 --file lolps-v154-r0-t2.json
 */
import * as fs from "fs";
import * as path from "path";
import { loadStaticData, PUBLIC_DATA_ROOT, resolvePatchVersion } from "../lib/data";

interface NamedRate {
  id: number;
  name: string;
  winRate: number;
  pickRate: number;
  count: number;
}
interface NamedSetRate {
  names: string[];
  winRate: number;
  pickRate: number;
  count: number;
}
interface SkillOrderRow {
  skills: string[];
  winRate: number;
  pickRate: number;
  count: number;
}
export interface LaneOracle {
  laneId: number;
  lane: string;
  laneLabel: string;
  games?: number;
  skillOrder: Record<string, SkillOrderRow[]>;
  items: {
    starting: NamedSetRate[];
    boots: NamedRate[];
    core1: NamedRate[];
    core2: NamedRate[];
    core3: NamedRate[];
    coreOrder2: NamedSetRate[];
    coreOrder3: NamedSetRate[];
  };
  runes: {
    keystone: NamedRate[];
    main2: NamedRate[];
    main3: NamedRate[];
    main4: NamedRate[];
    sub: NamedRate[];
    pages: NamedSetRate[];
    shards: NamedSetRate[];
  };
  summoners: NamedSetRate[];
  features?: Record<string, { value: number; rank: number } | number>;
}
export interface ChampionOracle {
  id: string;
  key: number;
  name: string;
  lanes: LaneOracle[];
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
  champions: ChampionOracle[];
}

export function oracleDir(patch?: string): string {
  return path.join(PUBLIC_DATA_ROOT, resolvePatchVersion(patch), "oracle");
}

export function listOracleFiles(patch?: string): string[] {
  const dir = oracleDir(patch);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.startsWith("lolps-") && f.endsWith(".json")).sort();
}

export function loadOracle(fileName?: string, patch?: string): OracleFile | undefined {
  const files = listOracleFiles(patch);
  const pick = fileName ?? files[0];
  if (!pick) return undefined;
  return JSON.parse(fs.readFileSync(path.join(oracleDir(patch), pick), "utf8")) as OracleFile;
}

const pct = (n: number) => `${n.toFixed(1)}%`;

function printLane(lane: LaneOracle) {
  console.log(
    `\n## ${lane.laneLabel} (${(lane.games ?? 0).toLocaleString("ko-KR")}판)`,
  );
  const master = lane.skillOrder.master?.[0];
  if (master) console.log(`선마 순서: ${master.skills.join(" > ")} (픽률 ${pct(master.pickRate)}, 승률 ${pct(master.winRate)})`);
  const lv11 = lane.skillOrder.lv11?.[0];
  if (lv11) console.log(`11레벨까지: ${lv11.skills.join("")}`);

  const setLine = (label: string, rows: NamedSetRate[], sep = " + ") => {
    if (!rows.length) return;
    console.log(
      `${label}: ${rows.map((r) => `${r.names.join(sep)} ${pct(r.pickRate)}/승 ${pct(r.winRate)}`).join(" | ")}`,
    );
  };
  const rateLine = (label: string, rows: NamedRate[]) => {
    if (!rows.length) return;
    console.log(
      `${label}: ${rows.map((r) => `${r.name} ${pct(r.pickRate)}/승 ${pct(r.winRate)}`).join(" | ")}`,
    );
  };

  setLine("시작 아이템", lane.items.starting);
  rateLine("신발", lane.items.boots);
  rateLine("1코어", lane.items.core1);
  rateLine("2코어", lane.items.core2);
  rateLine("3코어", lane.items.core3);
  setLine("코어 순서", lane.items.coreOrder3, " > ");
  setLine("룬 페이지", lane.runes.pages, ", ");
  setLine("파편", lane.runes.shards, " / ");
  setLine("소환사 주문", lane.summoners);

  const f = lane.features;
  if (f && typeof f.totalChampions === "number") {
    const rankOf = (key: string) => {
      const v = f[key];
      return typeof v === "object" ? `${v.value.toFixed(1)} (${v.rank}위)` : "-";
    };
    console.log(
      `14분 지표 (라인 ${f.totalChampions}종 중): 킬 ${rankOf("killsAt14")}, 데스 ${rankOf("deathsAt14")}, CS ${rankOf("csAt14")}, 분당 피해 ${rankOf("damagePerMin")}, 포탑 방패 ${rankOf("turretPlates")}`,
    );
  }
}

function main() {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };

  if (argv.includes("--list")) {
    const files = listOracleFiles();
    console.log(`수집된 오라클 ${files.length}건:`);
    for (const f of files) {
      const o = loadOracle(f);
      console.log(
        `  ${f} — 패치 ${o?.lolpsPatch} (versionId ${o?.lolpsVersionId}, ${o?.lolpsPatchDate}), region ${o?.regionId}, tier ${o?.tierId}, 챔피언 ${o?.championCount}종, 수집 ${o?.fetchedAt.slice(0, 10)}`,
      );
    }
    return;
  }

  const oracle = loadOracle(get("--file"));
  if (!oracle) throw new Error("오라클 파일이 없다. npm run oracle:build 를 먼저 실행하라");
  const query = get("--champ");
  if (!query) {
    console.log("사용법: --champ <챔피언> [--lane top|jungle|mid|bot|support] [--file <파일>] 또는 --list");
    return;
  }

  const data = loadStaticData("ko_KR");
  const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  const champ =
    data.champions.find((c) => c.id.toLowerCase() === norm(query)) ??
    data.champions.find((c) => norm(c.name) === norm(query)) ??
    data.champions.find((c) => norm(c.name).includes(norm(query)));
  if (!champ) throw new Error(`챔피언을 찾을 수 없다: ${query}`);

  const entry = oracle.champions.find((c) => c.id === champ.id);
  if (!entry) throw new Error(`${champ.name} 통계가 오라클에 없다`);

  console.log(
    `${entry.name} — 패치 ${oracle.lolpsPatch} (lol.ps versionId ${oracle.lolpsVersionId}, ${oracle.lolpsPatchDate}) / region ${oracle.regionId} / tier ${oracle.tierId}`,
  );
  const laneFilter = get("--lane");
  for (const lane of entry.lanes) {
    if (laneFilter && lane.lane !== laneFilter) continue;
    printLane(lane);
  }
}

main();
