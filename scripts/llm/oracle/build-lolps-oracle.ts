/**
 * lol.ps 통계 오라클 구축
 *
 * 챔피언별로 실제 사용자 통계를 받아 로컬에 저장한다.
 *   - 스킬 마스터 순서 (레벨 구간별)
 *   - 아이템 (시작·신발·1~5코어)
 *   - 룬 (주 트리 4슬롯, 보조 2슬롯, 파편)
 *   - 소환사 주문
 *   - 14분 지표와 라인 내 순위 (킬·데스·CS·피해량·포탑 방패)
 *
 * **버전 고정이 핵심이다.** 출력 파일 이름과 메타데이터에 게임 패치와 lol.ps versionId,
 * 지역·티어를 모두 남긴다. 다른 패치를 받으면 다른 파일이 생기므로 통계가 섞이지 않는다.
 *
 * 출력: public/data/<patch>/oracle/lolps-v<versionId>-r<region>-t<tier>.json
 * 캐시: research/.oracle-cache/lolps/... (git 무시)
 *
 * 사용:
 *   npm run oracle:build                      # 현재 패치, 사이트 기본 티어(2)
 *   npm run oracle:build -- --tier 1          # 표본이 가장 넓은 티어
 *   npm run oracle:build -- --patch 26.16     # 지난 패치 통계
 *   npm run oracle:build -- --limit 5         # 챔피언 5종만 (연습)
 *   npm run oracle:build -- --refresh         # 캐시 무시하고 새로 받기
 *   npm run oracle:build -- --all-lanes       # 위키 포지션 무시하고 5라인 전부
 */
import * as fs from "fs";
import * as path from "path";
import { loadStaticData, PUBLIC_DATA_ROOT } from "../lib/data";
import {
  fetchChampSummary,
  fetchLaneFeatures,
  type ChampSummary,
  fetchRuneStats,
  fetchSkillStats,
  fetchSpellItemStats,
  fetchVersions,
  LANES,
  WIKI_POSITION_TO_LANE,
  type ItemEntry,
  type ItemSetEntry,
  type QueryScope,
  type RateEntry,
  type RuneEntry,
  type RunePageEntry,
  type StatPerkEntry,
} from "./lolps-client";

interface NamedRate {
  id: number;
  name: string;
  winRate: number;
  pickRate: number;
  count: number;
}

/** 여러 이름이 한 묶음인 통계 (시작 아이템 세트, 코어 순서, 룬 페이지, 파편 조합) */
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

interface LaneOracle {
  laneId: number;
  lane: string;
  laneLabel: string;
  games?: number;
  /** 레벨 구간별 스킬 순서 (상위 항목 우선) */
  skillOrder: {
    lv1: SkillOrderRow[];
    lv3: SkillOrderRow[];
    lv6: SkillOrderRow[];
    lv11: SkillOrderRow[];
    master: SkillOrderRow[];
  };
  items: {
    /** 시작 아이템 조합 (도란의 방패 + 체력 물약 등) */
    starting: NamedSetRate[];
    boots: NamedRate[];
    core1: NamedRate[];
    core2: NamedRate[];
    core3: NamedRate[];
    /** 코어 2~3개를 순서까지 포함한 조합 */
    coreOrder2: NamedSetRate[];
    coreOrder3: NamedSetRate[];
  };
  runes: {
    keystone: NamedRate[];
    main2: NamedRate[];
    main3: NamedRate[];
    main4: NamedRate[];
    sub: NamedRate[];
    /** 완성된 룬 페이지 (주 트리 4 + 보조 2) */
    pages: NamedSetRate[];
    /** 파편 3개 조합 */
    shards: NamedSetRate[];
  };
  summoners: NamedSetRate[];
  /**
   * 상성별 승률. 이 라인에서 이 챔피언이 상대별로 어떻게 하는지.
   * 챔피언·라인 단위 통계로는 답할 수 없던 "누가 카운터인가" 를 여기서 답한다.
   */
  matchups?: {
    /** 상대하기 어려운 챔피언. winRate 는 **이 챔피언의** 승률이라 낮을수록 불리 */
    hard: Array<{ id: string; name: string; winRate: number; count: number }>;
    /** 상대하기 쉬운 챔피언 */
    easy: Array<{ id: string; name: string; winRate: number; count: number }>;
  };
  /** 14분 지표와 라인 내 순위 (순위가 낮을수록 상위) */
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

/**
 * 요약 응답에서 상성별 승률을 뽑는다.
 *
 * 빌드 유형(buildTypeId)마다 행이 나오지만 상성 목록은 같으므로 첫 행만 쓴다.
 * 표본이 아주 작은 조합은 잡음이라 버린다.
 */
const MIN_MATCHUP_COUNT = 30;

function buildMatchups(
  summary: ChampSummary | undefined,
  championByKey: Map<number, { id: string; name: string }>,
): LaneOracle["matchups"] {
  const row = summary?.[0];
  if (!row) return undefined;
  const pick = (
    ids: number[] | undefined,
    rates: number[] | undefined,
    counts: number[] | undefined,
  ) =>
    (ids ?? [])
      .map((key, i) => {
        const champ = championByKey.get(key);
        const winRate = rates?.[i];
        const count = counts?.[i] ?? 0;
        if (!champ || winRate === undefined || count < MIN_MATCHUP_COUNT) return undefined;
        return { id: champ.id, name: champ.name, winRate, count };
      })
      .filter((v): v is { id: string; name: string; winRate: number; count: number } => !!v);

  const hard = pick(row.counterChampionIdList, row.counterWinrateList, row.counterCountList);
  const easy = pick(
    row.counterEasyChampionIdList,
    row.counterEasyWinrateList,
    row.counterEasyCountList,
  );
  return hard.length || easy.length ? { hard, easy } : undefined;
}

interface ChampionOracle {
  id: string;
  key: number;
  name: string;
  lanes: LaneOracle[];
}

interface OracleFile {
  schemaVersion: 1;
  /** 우리 정적 데이터의 게임 패치 */
  patchVersion: string;
  /** lol.ps 내부 버전 id — 통계의 기준 */
  lolpsVersionId: number;
  /** lol.ps 가 표기한 패치 문자열 */
  lolpsPatch: string;
  lolpsPatchDate: string;
  regionId: number;
  tierId: number;
  source: string;
  note: string;
  fetchedAt: string;
  championCount: number;
  champions: ChampionOracle[];
}

const num = (raw: string | number | undefined) => (raw === undefined ? 0 : Number(raw));

function parseArgs(argv: string[]) {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    patch: get("--patch"),
    tier: Number(get("--tier") ?? 2),
    region: Number(get("--region") ?? 0),
    limit: get("--limit") ? Number(get("--limit")) : undefined,
    refresh: argv.includes("--refresh"),
    allLanes: argv.includes("--all-lanes"),
    delayMs: Number(get("--delay") ?? 220),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const data = loadStaticData("ko_KR");
  const targetPatch = args.patch ?? data.patch;

  const versions = await fetchVersions();
  if (versions.length === 0) throw new Error("lol.ps 버전 목록을 받지 못했다");
  const version = versions.find((v) => v.description === targetPatch);
  if (!version) {
    throw new Error(
      `lol.ps 에 패치 ${targetPatch} 가 없다. 사용 가능: ${versions.slice(0, 8).map((v) => v.description).join(", ")}`,
    );
  }
  console.log(
    `게임 패치 ${targetPatch} → lol.ps versionId ${version.versionId} (${version.patchDate}) / region ${args.region} / tier ${args.tier}`,
  );

  // id → 한국어 이름 사전
  const itemNames = new Map<number, string>();
  for (const item of data.items.items) itemNames.set(Number(item.id), item.name);
  const runeNames = new Map<number, string>();
  for (const rune of data.runes.runes) runeNames.set(Number(rune.id), rune.name);
  for (const shard of data.runes.statShards) runeNames.set(Number(shard.id), shard.name);
  const summonerNames = new Map<number, string>();
  for (const spell of data.summoners.spells) summonerNames.set(Number(spell.key), spell.name);

  const named = (entries: (ItemEntry | RuneEntry)[] | undefined, dict: Map<number, string>): NamedRate[] =>
    (entries ?? []).sort((a, b) => Number(b.pickRate) - Number(a.pickRate)).map((e) => {
      const id = "itemId" in e ? e.itemId : e.runeId;
      return {
        id,
        name: dict.get(id) ?? `미상(${id})`,
        winRate: num(e.winRate),
        pickRate: num(e.pickRate),
        count: e.count,
      };
    });

  const setRate = (
    entries: Array<RateEntry & { names: string[] }> | undefined,
    limit = 5,
  ): NamedSetRate[] =>
    (entries ?? [])
      .map((e) => ({ names: e.names, winRate: num(e.winRate), pickRate: num(e.pickRate), count: e.count }))
      .sort((a, b) => b.pickRate - a.pickRate)
      .slice(0, limit);

  /** 중첩 배열까지 평탄화해 이름으로 바꾼다 */
  const namesOf = (ids: Array<number | number[]>, dict: Map<number, string>): string[] =>
    ids.flat().map((id) => dict.get(id) ?? `미상(${id})`);

  const itemSets = (entries: ItemSetEntry[] | undefined, limit = 4): NamedSetRate[] =>
    setRate(
      (entries ?? []).map((e) => ({ ...e, names: namesOf(e.itemIdList, itemNames) })),
      limit,
    );

  const rows = (entries: Array<RateEntry & { skillNameList: string[] }> | undefined): SkillOrderRow[] =>
    (entries ?? []).map((e) => ({
      skills: e.skillNameList,
      winRate: num(e.winRate),
      pickRate: num(e.pickRate),
      count: e.count,
    }));

  const targets = args.limit ? data.champions.slice(0, args.limit) : data.champions;
  // 상성 통계는 상대를 챔피언 키(숫자)로 준다. 이름을 붙이려면 역인덱스가 필요하다.
  const championByKey = new Map(
    data.champions.map((c) => [Number(c.key), { id: c.id, name: c.name }]),
  );
  console.log(`대상 챔피언 ${targets.length}종\n`);

  const champions: ChampionOracle[] = [];
  let requestCount = 0;
  let done = 0;

  for (const champ of targets) {
    const championId = Number(champ.key);
    const wikiPositions = data.wikiMeta.get(champ.id)?.positions ?? [];
    // 위키 포지션이 있으면 그 라인만 조회해 요청 수를 줄인다
    const laneIds = args.allLanes || wikiPositions.length === 0
      ? LANES.map((l) => l.id)
      : Array.from(
          new Set(
            wikiPositions
              .map((p) => WIKI_POSITION_TO_LANE[p])
              .filter((v): v is number => v !== undefined),
          ),
        );

    const lanes: LaneOracle[] = [];
    for (const laneId of laneIds) {
      const scope: QueryScope = {
        region: args.region,
        version: version.versionId,
        tier: args.tier,
        lane: laneId,
      };
      const opts = { refresh: args.refresh, delayMs: args.delayMs };
      const [skill, spellItem, runes, features, summary] = [
        await fetchSkillStats(championId, scope, opts),
        await fetchSpellItemStats(championId, scope, opts),
        await fetchRuneStats(championId, scope, opts),
        await fetchLaneFeatures(championId, scope, opts),
        await fetchChampSummary(championId, scope, opts),
      ];
      requestCount += 5;

      const master = rows(skill?.master);
      const games = features?.count ?? master[0]?.count;
      // 표본이 아예 없는 라인은 담지 않는다
      if (!games) continue;

      const laneMeta = LANES.find((l) => l.id === laneId)!;
      const spellRows = setRate(
        (spellItem?.spellWinrates ?? []).map((e) => ({
          ...e,
          names: [e.spell1Id, e.spell2Id].map((id) => summonerNames.get(id) ?? `미상(${id})`),
        })),
        4,
      );
      const runePages = setRate(
        ((runes?.runeWinrates.total ?? []) as RunePageEntry[]).map((e) => ({
          ...e,
          names: [...e.category1RuneIdList, ...e.category2RuneIdList].map(
            (id) => runeNames.get(id) ?? `미상(${id})`,
          ),
        })),
        3,
      );
      const shardSets = setRate(
        ((runes?.statperkWinrates ?? []) as StatPerkEntry[]).map((e) => ({
          ...e,
          names: e.statperkIdList.map((id) => runeNames.get(id) ?? `미상(${id})`),
        })),
        3,
      );

      lanes.push({
        laneId,
        lane: laneMeta.key,
        laneLabel: laneMeta.label,
        games,
        skillOrder: {
          lv1: rows(skill?.lv1),
          lv3: rows(skill?.lv3),
          lv6: rows(skill?.lv6),
          lv11: rows(skill?.lv11),
          master,
        },
        items: {
          starting: itemSets(spellItem?.itemWinrates.starting, 3),
          boots: named(spellItem?.itemWinrates.shoes, itemNames).slice(0, 3),
          core1: named(spellItem?.itemWinrates.th1, itemNames).slice(0, 4),
          core2: named(spellItem?.itemWinrates.th2, itemNames).slice(0, 4),
          core3: named(spellItem?.itemWinrates.th3, itemNames).slice(0, 4),
          coreOrder2: itemSets(spellItem?.itemWinrates.till2, 3),
          coreOrder3: itemSets(spellItem?.itemWinrates.till3, 3),
        },
        runes: {
          keystone: named(runes?.runeWinrates.main1, runeNames).slice(0, 3),
          main2: named(runes?.runeWinrates.main2, runeNames).slice(0, 3),
          main3: named(runes?.runeWinrates.main3, runeNames).slice(0, 3),
          main4: named(runes?.runeWinrates.main4, runeNames).slice(0, 3),
          sub: named(runes?.runeWinrates.sub1, runeNames).slice(0, 4),
          pages: runePages,
          shards: shardSets,
        },
        summoners: spellRows,
        matchups: buildMatchups(summary, championByKey),
        features: features
          ? {
              totalChampions: features.totalChampions,
              killsAt14: { value: features.avgKillsAt14min, rank: features.avgKillsAt14minRank },
              deathsAt14: { value: features.avgDeathsAt14min, rank: features.avgDeathsAt14minRank },
              assistsAt14: { value: features.avgAssistsAt14min, rank: features.avgAssistsAt14minRank },
              csAt14: { value: features.avgCsAt14min, rank: features.avgCsAt14minRank },
              damagePerMin: {
                value: features.avgDamageDealtToChampionsPerMin,
                rank: features.avgDamageDealtToChampionsPerMinRank,
              },
              turretPlates: {
                value: features.avgTurretPlatesTaken,
                rank: features.avgTurretPlatesTakenRank,
              },
            }
          : undefined,
      });
    }

    if (lanes.length) champions.push({ id: champ.id, key: championId, name: champ.name, lanes });
    done += 1;
    if (done % 20 === 0) console.log(`  ${done}/${targets.length} (요청 ${requestCount}건)`);
  }

  const outDir = path.join(PUBLIC_DATA_ROOT, data.patch, "oracle");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(
    outDir,
    `lolps-v${version.versionId}-r${args.region}-t${args.tier}.json`,
  );
  const file: OracleFile = {
    schemaVersion: 1,
    patchVersion: targetPatch,
    lolpsVersionId: version.versionId,
    lolpsPatch: version.description,
    lolpsPatchDate: version.patchDate,
    regionId: args.region,
    tierId: args.tier,
    source: "lol.ps API (skill/spellitem/runestatperk/champ-lane-features)",
    note: "통계는 위 versionId·region·tier 조합 기준이다. 다른 패치는 다른 파일로 저장된다. 티어 라벨은 사이트 번들에서 확인하지 못해 id 로 남긴다.",
    fetchedAt: new Date().toISOString(),
    championCount: champions.length,
    champions: champions.sort((a, b) => a.id.localeCompare(b.id)),
  };
  fs.writeFileSync(outFile, `${JSON.stringify(file, null, 2)}\n`, "utf8");

  const laneCount = champions.reduce((n, c) => n + c.lanes.length, 0);
  const gamesTotal = champions.reduce(
    (n, c) => n + c.lanes.reduce((m, l) => m + (l.games ?? 0), 0),
    0,
  );
  const size = fs.statSync(outFile).size;
  console.log(`\n생성: ${path.relative(process.cwd(), outFile)} (${(size / 1024).toFixed(0)} KB)`);
  console.log(
    `챔피언 ${champions.length}종 / 챔피언·라인 ${laneCount}건 / 표본 합계 ${gamesTotal.toLocaleString("ko-KR")}판 / 요청 ${requestCount}건`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
