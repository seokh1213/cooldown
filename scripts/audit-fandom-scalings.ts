/**
 * Fandom 위키와 우리 계수를 대조한다.
 *
 * lol.ps·poro.gg 는 우리와 같은 Riot 원본을 기계로 읽는다. 원본 해석이
 * 틀리면 셋 다 같이 틀린다. Fandom 은 사람이 적은 문서라 그 축을 벗어난
 * 검증이 된다.
 *
 * 비교 단위는 "(계수%, 스탯)" 쌍이다. 문장 구조가 서로 달라 문장 대조는
 * 뜻이 없고, 계수만 뽑아 집합으로 견준다.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const { patchVersion } = JSON.parse(
  await fs.readFile(path.join(projectRoot, "public/data/version.json"), "utf8"),
) as { patchVersion: string };

const fandomDir = path.join(projectRoot, "research/.oracle-cache/fandom");
const oursDir = path.join(
  projectRoot,
  "public/data",
  patchVersion,
  "champions/en_US",
);

/** Fandom 표기 → 우리 스탯 이름 */
const STAT_ALIASES: [RegExp, string][] = [
  [/^AP$/i, "ability power"],
  [/^bonus AP$/i, "bonus ability power"],
  [/^(total )?AD$/i, "attack damage"],
  [/^bonus AD$/i, "bonus attack damage"],
  [/^base AD$/i, "base attack damage"],
  [/^(total |maximum )?health$/i, "health"],
  [/^bonus health$/i, "bonus health"],
  [/^missing health$/i, "missing health"],
  [/^current health$/i, "current health"],
  [/^(total )?armou?r$/i, "armor"],
  [/^bonus armou?r$/i, "bonus armor"],
  [/^(total )?(MR|magic resistance?)$/i, "magic resist"],
  [/^bonus (MR|magic resistance?)$/i, "bonus magic resist"],
  [/^bonus attack speed$/i, "bonus attack speed"],
  [/^(total )?attack speed$/i, "attack speed"],
  [/^critical strike chance$/i, "critical strike chance"],
  [/^critical strike damage$/i, "critical strike damage"],
  [/^(bonus )?movement speed$/i, "movement speed"],
  [/^lethality$/i, "lethality"],
  [/^(total )?mana$/i, "mana"],
  [/^bonus mana$/i, "bonus mana"],
];

/** 우리 en_US 스탯 이름 → 정규화 */
const OUR_STATS: [RegExp, string][] = [
  [/^bonus Attack Damage$/i, "bonus attack damage"],
  [/^Attack Damage$/i, "attack damage"],
  [/^Ability Power$/i, "ability power"],
  [/^bonus Ability Power$/i, "bonus ability power"],
  [/^bonus Health$/i, "bonus health"],
  [/^Health$/i, "health"],
  [/^bonus Armor$/i, "bonus armor"],
  [/^Armor$/i, "armor"],
  [/^bonus Magic Resist$/i, "bonus magic resist"],
  [/^Magic Resist$/i, "magic resist"],
  [/^bonus Attack Speed$/i, "bonus attack speed"],
  [/^Attack Speed$/i, "attack speed"],
  [/^Critical Strike Chance$/i, "critical strike chance"],
  [/^Critical Strike Damage$/i, "critical strike damage"],
  [/^Movement Speed$/i, "movement speed"],
  [/^Lethality$/i, "lethality"],
  [/^Mana$/i, "mana"],
];

function normalize(raw: string, table: [RegExp, string][]): string | null {
  const cleaned = raw
    .replace(/'''/g, "")
    .replace(/\{\{[^}]*\|([^|}]*)\}\}/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  for (const [pattern, name] of table) {
    if (pattern.test(cleaned)) return name;
  }
  return null;
}

type Scaling = string; // "60% ability power"

function fandomScalings(wikitext: string): Set<Scaling> {
  const found = new Set<Scaling>();
  for (const line of wikitext.split("\n")) {
    if (!/^\s*\|\s*leveling/.test(line)) continue;
    for (const match of line.matchAll(/\(\+\s*([^)]*?)\)/g)) {
      const body = match[1];
      const valueMatch = /^([\d.]+)%\s+(.+)$/.exec(
        body.replace(/'''/g, "").replace(/\{\{fd\|([\d.]+)\}\}/g, "$1").trim(),
      );
      if (!valueMatch) continue;
      const stat = normalize(valueMatch[2], STAT_ALIASES);
      if (!stat) continue;
      found.add(`${Number(valueMatch[1])}% ${stat}`);
    }
  }
  return found;
}

function ourScalings(bodyHtml: string): Set<Scaling> {
  const text = bodyHtml.replace(/<[^>]+>/g, "").replace(/\[\[si:[a-z]+]]/g, "");
  const found = new Set<Scaling>();
  for (const match of text.matchAll(/\(([\d.]+)%\s+([A-Za-z ]+?)\)/g)) {
    const stat = normalize(match[2], OUR_STATS);
    if (!stat) continue;
    found.add(`${Number(match[1])}% ${stat}`);
  }
  return found;
}

interface Row {
  champion: string;
  slot: string;
  onlyFandom: string[];
  onlyOurs: string[];
}

const rows: Row[] = [];
let compared = 0;
let matched = 0;

for (const file of (await fs.readdir(fandomDir)).sort()) {
  if (!file.endsWith(".json")) continue;
  const championId = file.replace(/\.json$/, "");
  const fandom = JSON.parse(
    await fs.readFile(path.join(fandomDir, file), "utf8"),
  ) as { abilities: { slot: string; wikitext: string }[] };

  let ours: { champion: { abilities: Record<string, { bodyHtml: string }> } };
  try {
    ours = JSON.parse(
      await fs.readFile(path.join(oursDir, `${championId}.json`), "utf8"),
    );
  } catch {
    continue;
  }

  // 변신 챔피언은 한 슬롯에 스킬이 둘이다 (나르 W = 하이퍼 + 후려치기).
  // 슬롯별로 합쳐야 "한쪽에만 있다" 는 헛다리를 짚지 않는다.
  const bySlot = new Map<string, Set<Scaling>>();
  for (const ability of fandom.abilities) {
    const existing = bySlot.get(ability.slot) ?? new Set<Scaling>();
    for (const entry of fandomScalings(ability.wikitext)) existing.add(entry);
    bySlot.set(ability.slot, existing);
  }

  for (const [slot, theirs] of bySlot) {
    const mine = ours.champion.abilities[slot];
    if (!mine?.bodyHtml) continue;
    if (theirs.size === 0) continue;
    const ourSet = ourScalings(mine.bodyHtml);
    compared += 1;
    const onlyFandom = [...theirs].filter((entry) => !ourSet.has(entry));
    const onlyOurs = [...ourSet].filter((entry) => !theirs.has(entry));
    if (onlyFandom.length === 0 && onlyOurs.length === 0) {
      matched += 1;
      continue;
    }
    rows.push({ champion: championId, slot, onlyFandom, onlyOurs });
  }
}

console.log(`대조한 스킬 ${compared}개 중 완전 일치 ${matched}개`);
console.log(`차이 있는 스킬 ${rows.length}개\n`);

/**
 * 수치가 같은데 스탯 이름만 다르면 우리 쪽 스탯 매핑을 의심해야 한다.
 * 수치만 다른 경우는 대개 위키의 패치 반영이 늦은 것이다 (lol.ps 로 확인함).
 */
const values = (list: string[]) =>
  new Set(list.map((entry) => entry.split("% ")[0]));

const suspects = rows.filter((row) => {
  const ourValues = values(row.onlyOurs);
  return [...values(row.onlyFandom)].some((value) => ourValues.has(value));
});

/** 주문력은 기본값이 0 이라 "추가 주문력" 과 값이 같다. 표기 차이일 뿐이다 */
function isBonusLabelOnly(row: Row): boolean {
  const strip = (entry: string) => entry.replace(/\bbonus ability power\b/, "ability power");
  const theirs = new Set(row.onlyFandom.map(strip));
  return row.onlyOurs.every((entry) => theirs.has(strip(entry)));
}

const real = suspects.filter((row) => !isBonusLabelOnly(row));
const labelOnly = suspects.filter(isBonusLabelOnly);

console.log(`=== 스탯 이름이 다른 경우 ${real.length}건 (확인 필요) ===`);
for (const row of real) {
  console.log(`${row.champion} ${row.slot}`);
  console.log(`   Fandom: ${row.onlyFandom.join(", ")}`);
  console.log(`   우리  : ${row.onlyOurs.join(", ")}`);
}

console.log(`\n주문력/추가 주문력 표기 차이만: ${labelOnly.length}건`);
for (const row of labelOnly) console.log(`   ${row.champion} ${row.slot}`);

const numeric = rows.filter((row) => !suspects.includes(row));
console.log(`\n수치만 다른 경우: ${numeric.length}건 (위키 패치 반영 지연으로 추정)`);
