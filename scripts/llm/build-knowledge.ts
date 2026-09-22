/**
 * 챔피언 사실 카드 일괄 생성
 *
 * 출력: public/data/<patch>/llm/champion-cards-<lang>.json
 *  - 웹(web-llm) 단계에서 이 파일만 fetch 하면 CLI 와 동일한 컨텍스트를 만들 수 있다.
 *  - 본문(스킬 툴팁 평문)까지 포함해도 챔피언당 수 KB 수준.
 *
 * 사용: npm run llm:build [-- --lang ko_KR]
 */
import * as fs from "fs";
import * as path from "path";
import {
  loadStaticData,
  PUBLIC_DATA_ROOT,
  resolvePatchVersion,
  type LlmLocale,
} from "./lib/data";
import { DAMAGE, GRADE, RANGE, RATIO_STATS, TAGS, missingCardWords } from "./lib/cardWords";
import { createChampionCardBuilder, type ChampionCard } from "./lib/facts";
import { loadSpellOverrides } from "./lib/spellOverrides";

export interface ChampionCardFile {
  schemaVersion: 1;
  patch: string;
  lang: LlmLocale;
  generatedAt: string;
  cards: ChampionCard[];
}

function parseLang(argv: string[]): LlmLocale {
  const idx = argv.indexOf("--lang");
  return (idx >= 0 ? argv[idx + 1] : "ko_KR") as LlmLocale;
}

/**
 * 위키에서 받아 둔 대시 판정을 읽는다. 없으면 빈 표를 돌려주고 툴팁 추정으로 내려간다.
 * `npm run llm:fetch-dashes` 로 만든다.
 */
function loadDashes(): Record<string, { dash: boolean; self: boolean }> {
  const file = path.join(PUBLIC_DATA_ROOT, resolvePatchVersion(), "llm", "ability-dashes.json");
  if (!fs.existsSync(file)) {
    console.warn("대시 판정 파일 부재 — 툴팁 추정으로 대체한다 (npm run llm:fetch-dashes)");
    return {};
  }
  return (
    JSON.parse(fs.readFileSync(file, "utf8")) as {
      abilities?: Record<string, { dash: boolean; self: boolean }>;
    }
  ).abilities ?? {};
}

function main() {
  const lang = parseLang(process.argv.slice(2));
  const data = loadStaticData(lang);
  const builder = createChampionCardBuilder(
    data.champions,
    data.riotMeta,
    data.wikiMeta,
    loadDashes(),
    loadSpellOverrides(),
  );
  const cards = builder.buildAll();

  /*
   * 효과 태그와 피해 유형을 한국어에서 가져다 쓴다.
   *
   * 이 값들은 툴팁 본문을 한국어 정규식으로 읽어 뽑는다("둔화시킵니다", "마법
   * 피해를 입힙니다"). 그래서 영어·중국어 카드에서는 거의 아무것도 안 잡혔다.
   *
   *          효과 태그   피해 유형   태그 없는 스킬
   *   한국어    1,799       696            24
   *   영어·중국어  247         0           741
   *
   * 카드가 이 꼴이면 상성 도출도 못 돌고(피해 유형이 "불명" 이 된다) 해설에 실을
   * 재료가 없다. 정규식을 언어마다 새로 쓰는 길은 언어가 늘 때마다 같은 일을
   * 되풀이하는 길이다.
   *
   * 태그는 **번역하지 않는 열쇠**다. 화면과 프롬프트가 `translateTag` 로 옮겨
   * 보이므로, 한국어에서 한 번 뽑아 모든 언어가 나눠 쓰면 된다. 챔피언 id 와 슬롯은
   * 언어와 무관하므로 짝을 잃을 자리도 없다.
   *
   * 스킬 태그만 옮겼더니 **한 겹 위가 그대로 남아 있었다.** 챔피언의 피해 성향과
   * 계수 성향은 스킬을 세어 만드는 값인데, 영어·중국어에서는 셀 것이 없어 역할
   * 가중치(Marksman +2, Mage +1)만 남아 있었다.
   *
   *              물리   마법   혼합
   *   한국어       58     95     20
   *   영어·중국어  110     63      0
   *
   * 173챔피언이 모두 달랐고 계수 성향은 136이 달랐다. 같은 챔피언인데 언어를 바꾸면
   * 다른 챔피언이 되는 셈이다. 도출된 값은 한 벌만 있어야 하므로 통째로 옮긴다.
   */
  if (lang !== "ko_KR") {
    const korean = loadStaticData("ko_KR");
    const base = createChampionCardBuilder(
      korean.champions,
      korean.riotMeta,
      korean.wikiMeta,
      loadDashes(),
      loadSpellOverrides(),
    ).buildAll();
    const bySlot = new Map<string, { damageTypes: ChampionCard["spells"][number]["damageTypes"]; effects: string[] }>();
    const byId = new Map<string, ChampionCard>();
    for (const card of base) {
      byId.set(card.id, card);
      for (const spell of card.spells) {
        bySlot.set(`${card.id}:${spell.slot}`, { damageTypes: spell.damageTypes, effects: spell.effects });
      }
    }
    for (const card of cards) {
      const derivedCard = byId.get(card.id);
      if (derivedCard) {
        card.mechanics = derivedCard.mechanics;
        card.damageProfile = derivedCard.damageProfile;
        card.scalingProfile = derivedCard.scalingProfile;
        card.rangeType = derivedCard.rangeType;
      }
      for (const spell of card.spells) {
        const derived = bySlot.get(`${card.id}:${spell.slot}`);
        if (!derived) continue;
        spell.damageTypes = derived.damageTypes;
        spell.effects = derived.effects;
      }
    }
  }

  /*
   * 태그가 세 언어를 다 갖췄는지 카드를 쓰기 전에 본다.
   *
   * 화면과 프롬프트는 이 값들을 `translateTag`·`translateDamage` 로 옮겨 보인다.
   * 표에 없는 값은 한국어 그대로 돌아오므로 영어·중국어 화면에 한국어가 섞여
   * 나가는데, 빈칸이 아니라서 눈으로는 고장으로 안 보인다. 실제로 그렇게 새고
   * 있었다. 표는 툴팁 정규식보다 늦게 자라기 마련이니 자동으로 잡아야 한다.
   */
  const gaps: Array<readonly [string, string[]]> = ([
    ["효과 태그", missingCardWords(cards.flatMap((c) => [...c.mechanics, ...c.spells.flatMap((s) => s.effects)]), TAGS)],
    ["피해 유형", missingCardWords(cards.flatMap((c) => c.spells.flatMap((s) => s.damageTypes)), DAMAGE)],
    ["사거리", missingCardWords(cards.map((c) => c.rangeType), RANGE)],
    ["계수 능력치", missingCardWords(cards.flatMap((c) => c.spells.flatMap((s) => Object.keys(s.ratios ?? {}))), RATIO_STATS)],
    ["능력치 등급", missingCardWords(cards.flatMap((c) => Object.values(c.stats).flatMap((s) => [s.gradeLv1, s.gradeLv18])), GRADE)],
  ] as const).filter(([, missing]) => missing.length > 0);
  if (gaps.length > 0) {
    for (const [what, missing] of gaps) {
      console.error(`${what} 번역 누락 ${missing.length}건: ${missing.join(", ")}`);
    }
    console.error("scripts/llm/lib/cardWords.ts 에 세 언어 표기를 채운 뒤 다시 돌리십시오.");
    process.exit(1);
  }

  const outDir = path.join(PUBLIC_DATA_ROOT, data.patch, "llm");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `champion-cards-${lang}.json`);
  const file: ChampionCardFile = {
    schemaVersion: 1,
    patch: data.patch,
    lang,
    generatedAt: new Date().toISOString(),
    cards,
  };
  fs.writeFileSync(outFile, JSON.stringify(file), "utf8");

  // 요약 통계
  const effectCount = new Map<string, number>();
  const primaryCount = new Map<string, number>();
  let withoutDdragon = 0;
  for (const card of cards) {
    for (const m of card.mechanics) effectCount.set(m, (effectCount.get(m) ?? 0) + 1);
    primaryCount.set(card.damageProfile.primary, (primaryCount.get(card.damageProfile.primary) ?? 0) + 1);
    if (card.roleTags.length === 0) withoutDdragon += 1;
  }
  const size = fs.statSync(outFile).size;
  console.log(`생성: ${path.relative(process.cwd(), outFile)} (${cards.length} 챔피언, ${(size / 1024).toFixed(0)} KB)`);
  console.log(`주 피해 유형 분포: ${Array.from(primaryCount, ([k, v]) => `${k} ${v}`).join(", ")}`);
  if (withoutDdragon) console.log(`ddragon 보조 데이터 부재 챔피언: ${withoutDdragon}`);
  console.log("효과 태그 빈도:");
  for (const [label, n] of Array.from(effectCount).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${label.padEnd(18)} ${n}`);
  }
}

main();
