/**
 * 지식 카드 작성용 자료 묶음
 *
 * 챔피언 하나를 쓰는 데 필요한 모든 자료를 한 번에 출력한다.
 * 작성자(사람이든 서브에이전트든)가 웹을 다시 뒤지지 않아도 되게 하는 것이 목적이다.
 *
 *   1. 사실 카드      스탯 등급, 계수, 스킬별 효과 태그와 쿨타임
 *   2. 분류           라이엇 피해 유형·특성, 위키 클래스·하위 클래스·포지션
 *   3. 통계 오라클    선마 순서, 아이템, 룬, 주문, 14분 지표와 라인 내 순위
 *   4. 위키 팁        플레이 팁, 상대 팁, 스킬 슬롯별 운용 노트 (영문)
 *   5. 작성 지침      지금 스키마에서 무엇을 쓰고 무엇을 쓰지 말아야 하는지
 *
 * 사용:
 *   npm run llm:source-pack -- --champ Nasus
 *   npm run llm:source-pack -- --champ 나서스 --lane top
 *   npm run llm:source-pack -- --todo            # 아직 지식 카드가 없는 챔피언 목록 (표본순)
 */
import * as fs from "fs";
import * as path from "path";
import { loadStaticData } from "./lib/data";
import { championCardToText, createChampionCardBuilder } from "./lib/facts";
import { loadOracleBundle, oracleFacts, selectLane, type OracleChampion } from "./lib/oracle";
import { PLAYBOOK_ROOT } from "./lib/playbook";

interface WikiTips {
  id: string;
  playingAs: string[];
  playingAgainst: string[];
  playstyle: Array<{ slot: string; name: string; notes: string[] }>;
}

function loadWikiTips(patch: string): Map<string, WikiTips> {
  const file = path.resolve(
    process.cwd(),
    "public",
    "data",
    patch,
    "llm",
    "champion-wiki-tips.json",
  );
  const map = new Map<string, WikiTips>();
  if (!fs.existsSync(file)) return map;
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { champions?: WikiTips[] };
  for (const c of parsed.champions ?? []) map.set(c.id, c);
  return map;
}

function existingPlaybooks(): Set<string> {
  if (!fs.existsSync(PLAYBOOK_ROOT)) return new Set();
  return new Set(fs.readdirSync(PLAYBOOK_ROOT).filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", "")));
}

const GUIDE = `## 작성 지침

지금 구조에서 **아이템·룬·소환사 주문·스킬 순서는 통계 오라클이 자동으로 채운다.**
그러니 지식 카드에는 통계가 알려주지 못하는 것만 쓴다.

써야 하는 category
- combo   : 실제 스킬 순서 (예: "E 진입 → 평타 → W → Q"). 판정과 캔슬 타이밍을 함께
- phase   : 힘의 구간. 몇 레벨에 세지고 언제 약한지, 왜 그런지
- skill   : 스킬 슬롯별 운용. 판정 범위, 아껴야 할 상황, 상대 반응 유도
- laning  : 라인 운영. 웨이브, 딜 교환 패턴, 귀환 타이밍
- teamfight: 한타에서의 역할과 진입 조건
- against : 이 챔피언을 상대할 때 (다른 챔피언의 조언에 실린다)

쓰지 않아도 되는 category
- start-item, core-item, rune, summoner : 통계가 대신한다.
  다만 "상대가 회복형이면 처형인의 대검" 처럼 **조건부 예외**는 situational-item 으로 쓴다.

규칙
1. 수치를 쓰지 않는다. 패치마다 바뀌고 사실 카드가 이미 갖고 있다.
   레벨 구간(1~2레벨, 6레벨)은 예외로 허용한다.
2. 아이템·룬·주문 이름을 쓰면 refs 에 옮겨 적는다. 비교 대상으로만 언급하면 avoid 에 적는다.
   이름은 반드시 현재 데이터 표기를 쓴다(순간이동, 판금 장화).
3. 조건부 지식은 when 으로 쓴다.
   키: enemyDamage(물리/마법/혼합), enemyScaling(AD/AP/혼합), enemyRange(근접/원거리),
       enemyHasEffects, enemyLacksEffects, enemyRoles, enemyIds, lanes
4. 각 항목에 source 와 verifiedPatch 를 넣는다. 위키 팁을 옮겼으면 그렇게 적는다.
5. 위키 팁은 영문이고 최신 패치 기준이 아닐 수 있다. 구조적 상호작용(판정, 콤보)은 신뢰하되
   메타 판단은 통계와 어긋나지 않는지 확인한다.

playing 10~14항목, against 4~6항목을 목표로 한다. 근거가 없으면 억지로 채우지 않는다.`;

function main() {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };

  const data = loadStaticData("ko_KR");
  const oracleBundle = loadOracleBundle();

  if (argv.includes("--todo")) {
    const done = existingPlaybooks();
    const rows: Array<{ id: string; name: string; games: number; lanes: string }> = [];
    for (const champ of data.champions) {
      if (done.has(champ.id)) continue;
      const entry: OracleChampion | undefined = oracleBundle?.byChampion.get(champ.id);
      const games = entry?.lanes.reduce((n, l) => n + (l.games ?? 0), 0) ?? 0;
      rows.push({
        id: champ.id,
        name: champ.name,
        games,
        lanes: entry?.lanes.map((l) => l.laneLabel).join(",") ?? "-",
      });
    }
    rows.sort((a, b) => b.games - a.games);
    console.log(`지식 카드 미작성 ${rows.length}종 (표본 많은 순)\n`);
    for (const r of rows) {
      console.log(`${r.id.padEnd(16)}${r.name.padEnd(10)}${String(r.games).padStart(8)}판  ${r.lanes}`);
    }
    console.log(`\n작성 완료: ${done.size}종`);
    return;
  }

  const query = get("--champ");
  if (!query) {
    console.log("사용법: --champ <챔피언> [--lane top|jungle|mid|bot|support] 또는 --todo");
    return;
  }

  const builder = createChampionCardBuilder(data.champions, data.riotMeta, data.wikiMeta);
  const found = builder.find(query);
  if (!found) throw new Error(`챔피언을 찾을 수 없다: ${query}`);
  const card = builder.build(found.id);
  if (!card) throw new Error("사실 카드 생성 실패");

  console.log(`# ${card.name} (${card.id}) 지식 카드 작성 자료\n`);

  console.log("## 1. 사실 카드\n");
  console.log(championCardToText(card, { includeSpellText: true, spellTextMax: 300 }));

  console.log("\n## 2. 분류\n");
  if (card.wiki) {
    console.log(
      `위키 클래스: ${card.wiki.heroType ?? "?"}${card.wiki.altType ? `/${card.wiki.altType}` : ""} · 하위 클래스 ${card.wiki.subclass ?? "-"} · 포지션 ${card.wiki.positions.join(", ") || "-"}`,
    );
  }
  if (card.riot) {
    console.log(
      `라이엇: 피해 ${card.riot.damageType ?? "-"} · ${card.riot.attackType ?? "-"} · 특성 ${card.riot.tagPrimary ?? "-"}${card.riot.tagSecondary ? `, ${card.riot.tagSecondary}` : ""}`,
    );
    if (card.riot.playstyle) {
      const p = card.riot.playstyle;
      console.log(
        `플레이스타일(0~3): 피해 ${p.damage}, 내구도 ${p.durability}, 군중 제어 ${p.crowdControl}, 기동력 ${p.mobility}, 유틸 ${p.utility}`,
      );
    }
  }

  console.log("\n## 3. 통계 오라클\n");
  const entry = oracleBundle?.byChampion.get(card.id);
  if (!oracleBundle || !entry) {
    console.log("(오라클 데이터 없음 — npm run oracle:build 필요)");
  } else {
    const lane = selectLane(entry, get("--lane"));
    if (!lane) {
      console.log("(해당 라인 통계 없음)");
    } else {
      const facts = oracleFacts(oracleBundle, lane);
      console.log(`기준: ${facts.scope}`);
      console.log(`라인: ${lane.laneLabel} (${(lane.games ?? 0).toLocaleString("ko-KR")}판)`);
      for (const line of facts.lines) console.log(`- ${line}`);
      if (entry.lanes.length > 1) {
        console.log(
          `다른 라인: ${entry.lanes
            .filter((l) => l.lane !== lane.lane)
            .map((l) => `${l.laneLabel}(${(l.games ?? 0).toLocaleString("ko-KR")}판)`)
            .join(", ")}`,
        );
      }
    }
  }

  console.log("\n## 4. 위키 팁 (영문, 스킬 이름은 한국어)\n");
  const tips = loadWikiTips(data.patch).get(card.id);
  if (!tips) {
    console.log("(위키 팁 없음 — 이 챔피언은 Strategy 문서에 팁 섹션이 없다)");
  } else {
    if (tips.playingAs.length) {
      console.log("### 플레이할 때");
      for (const t of tips.playingAs) console.log(`- ${t}`);
    }
    if (tips.playingAgainst.length) {
      console.log("\n### 상대할 때");
      for (const t of tips.playingAgainst) console.log(`- ${t}`);
    }
    if (tips.playstyle.length) {
      console.log("\n### 스킬 슬롯별 운용");
      for (const p of tips.playstyle) {
        console.log(`[${p.slot}] ${p.name}`);
        for (const n of p.notes) console.log(`  - ${n}`);
      }
    }
  }

  console.log(`\n## 5. 기존 지식 카드\n`);
  const file = path.join(PLAYBOOK_ROOT, `${card.id}.json`);
  console.log(fs.existsSync(file) ? `이미 존재: ${path.relative(process.cwd(), file)}` : "없음 (신규 작성)");

  console.log(`\n${GUIDE}`);
}

main();
