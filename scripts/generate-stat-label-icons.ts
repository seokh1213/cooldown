/**
 * 아이템 능력치 줄에 붙일 스탯 글리프 표를 만든다
 *
 * 스킬 툴팁은 "60% 공격력" 앞에 검 모양을 붙여 어떤 스탯인지 한눈에 보이게 한다.
 * 아이템 능력치 줄도 같은 값을 말하는데 글자만 있었다.
 *
 *   체력 150 / 방어력 8 / 강인함 30%
 *
 * 줄은 라이엇이 준 그 나라 말 문장이라 스탯 코드가 안 붙어 있다. 이름을 언어마다
 * 손으로 적는 길은 택하지 않는다 — 세 벌을 지어내야 하고, 지어낸 이름은 라이엇이
 * 말을 바꾸는 순간 조용히 어긋난다.
 *
 * 대신 두 걸음으로 짓는다.
 *
 *   1) **잇는다.** 같은 아이템의 같은 줄 번호는 세 언어에서 같은 것을 말한다.
 *      868개를 훑으면 25묶음이 나오고 충돌이 한 건도 없다.
 *        강인함 | Tenacity | 韧性
 *   2) **이름을 단다.** 묶음의 한국어나 영어 이름이 우리 저장소에 이미 적혀 있는
 *      이름과 똑같으면 그 글리프를 붙인다. 출처는 스탯 정의(`STAT_DEFINITIONS`)와
 *      수치 공식 표(`FORMULA_GROUPS`) 둘이고, 둘 다 사람이 세 언어로 써 둔 글이다.
 *
 * 한쪽 언어에서만 이름이 붙어도 나머지 둘이 따라온다. 중국어는 우리 저장소에
 * 스탯 이름이 없어 1) 이 없으면 한 건도 못 붙는다.
 *
 * 이름을 못 단 묶음에는 아무것도 붙이지 않는다. 모든 피해 흡혈·초당 골드는 글리프
 * 자체가 없고(404 확인), 재사용 대기시간 감소는 스킬 가속과 다른 값이라 그 글리프를
 * 빌려 쓰면 틀린 말이 된다.
 *
 * 출력: src/data/generated/statLabelIcons.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { decodeDataManifest } from "../src/data/contracts/dataManifest";
import { FORMULA_GROUPS } from "../src/data/gameFormulas";
import { STAT_DEFINITIONS } from "../src/types/combatStats";

const LOCALES = ["ko_KR", "en_US", "zh_CN"] as const;
type Locale = (typeof LOCALES)[number];

const root = process.cwd();
const dataDir = path.join(root, "public/data");
const release = decodeDataManifest(JSON.parse(fs.readFileSync(path.join(dataDir, "version.json"), "utf8")));

interface Item {
  id: string;
  statDescriptions?: string[];
}

function loadItems(locale: Locale): Map<string, Item> {
  const file = path.join(dataDir, release.patchVersion, `items-normalized-${locale}.json`);
  const items = (JSON.parse(fs.readFileSync(file, "utf8")) as { items: Item[] }).items;
  return new Map(items.map((item) => [item.id, item]));
}

/** 능력치 줄에서 수치와 표시를 걷어낸 이름. "공격력 <span>10</span>" → "공격력" */
function labelOf(line: string): string {
  return line
    .replace(/<[^>]*>/g, "")
    .replace(/[\d.,%+-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 우리 저장소에 이미 적혀 있는 이름 → 글리프. 대소문자는 무시한다. */
function buildAnchors(): Map<string, string> {
  const anchors = new Map<string, string>();
  const put = (name: string | undefined, icon: string | undefined) => {
    if (name && icon) anchors.set(name.toLowerCase(), icon);
  };
  for (const definition of Object.values(STAT_DEFINITIONS)) {
    put(definition.label.ko, definition.icon);
    put(definition.label.en, definition.icon);
  }
  for (const group of FORMULA_GROUPS) {
    for (const entry of group.entries) {
      put(entry.title.ko_KR, entry.icon);
      put(entry.title.en_US, entry.icon);
    }
  }
  return anchors;
}

/** 이름이 똑같을 때. 가장 믿을 만한 짝이다. */
function exactly(row: Record<Locale, string>, anchors: Map<string, string>): string | undefined {
  return anchors.get(row.ko_KR.toLowerCase()) ?? anchors.get(row.en_US.toLowerCase());
}

/**
 * 이름이 줄 안에 들어 있을 때.
 *
 * 라이엇이 같은 값을 더 길게 부르는 자리가 있다 — "기본 체력 재생", "초당 체력 재생".
 * 우리가 아는 이름은 "체력 재생" 하나뿐이지만 가리키는 것은 같다.
 *
 * **가장 긴 이름을 고른다.** "기본 체력 재생" 안에는 "체력" 도 들어 있어, 짧은 쪽을
 * 먼저 맞히면 재생 줄에 체력 글리프가 붙는다.
 */
function contained(row: Record<Locale, string>, anchors: Map<string, string>): string | undefined {
  let best: { length: number; icon: string } | undefined;
  for (const [name, icon] of anchors) {
    for (const text of [row.ko_KR, row.en_US]) {
      if (!text.toLowerCase().includes(name)) continue;
      if (!best || name.length > best.length) best = { length: name.length, icon };
    }
  }
  return best?.icon;
}

function main(): void {
  const byLocale = Object.fromEntries(LOCALES.map((locale) => [locale, loadItems(locale)])) as Record<
    Locale,
    Map<string, Item>
  >;
  const anchors = buildAnchors();

  /*
   * 같은 아이템의 같은 줄 번호로 세 언어를 묶는다.
   *
   * 줄 수가 언어마다 다른 아이템은 건너뛴다 — 번호가 서로 다른 것을 가리키게 되면
   * 엉뚱한 글리프가 붙는데, 그것은 빈 칸보다 나쁘다.
   */
  const clusters = new Map<string, Record<Locale, string> | "conflict">();
  for (const [id, item] of byLocale.ko_KR) {
    const lines = item.statDescriptions ?? [];
    for (let index = 0; index < lines.length; index += 1) {
      const row = {} as Record<Locale, string>;
      let aligned = true;
      for (const locale of LOCALES) {
        const other = byLocale[locale].get(id)?.statDescriptions ?? [];
        if (other.length !== lines.length) {
          aligned = false;
          break;
        }
        row[locale] = labelOf(other[index]);
      }
      if (!aligned) continue;
      const seen = clusters.get(row.ko_KR);
      if (!seen) clusters.set(row.ko_KR, row);
      else if (seen !== "conflict" && LOCALES.some((locale) => seen[locale] !== row[locale])) {
        clusters.set(row.ko_KR, "conflict");
      }
    }
  }

  const table: Record<Locale, Record<string, string>> = { ko_KR: {}, en_US: {}, zh_CN: {} };
  const byContainment: string[] = [];
  const unnamed: string[] = [];
  const conflicting: string[] = [];
  for (const [key, row] of clusters) {
    if (row === "conflict") {
      conflicting.push(key);
      continue;
    }
    const exact = exactly(row, anchors);
    const icon = exact ?? contained(row, anchors);
    if (!icon) {
      unnamed.push(key);
      continue;
    }
    if (!exact) byContainment.push(`${key} → ${icon}`);
    for (const locale of LOCALES) table[locale][row[locale]] = icon;
  }

  const body = LOCALES.map(
    (locale) => `  ${locale}: ${JSON.stringify(table[locale], null, 4).replace(/\n/g, "\n  ")},`,
  ).join("\n");
  const file = [
    "/* 자동 생성 — `npm run generate-stat-label-icons`. 손으로 고치지 마십시오. */",
    "",
    "/** 아이템 능력치 줄의 이름 → 스탯 글리프. 이름은 라이엇이 준 그 나라 말이다. */",
    "export const STAT_LABEL_ICONS: Record<string, Record<string, string>> = {",
    body,
    "};",
    "",
  ].join("\n");
  const out = path.join(root, "src/data/generated/statLabelIcons.ts");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, file, "utf8");

  const named = Object.keys(table.ko_KR).length;
  console.log(`스탯 글리프 표: 묶음 ${clusters.size}종 중 ${named}종에 이름을 달았다 (${path.relative(root, out)})`);
  if (byContainment.length) console.log(`  이름이 들어 있어 맞힌 것 ${byContainment.length}종: ${byContainment.join(", ")}`);
  if (unnamed.length) console.log(`  이름 없음 ${unnamed.length}종: ${unnamed.join(", ")}`);
  if (conflicting.length) console.log(`  언어별 줄이 어긋난 것 ${conflicting.length}종: ${conflicting.join(", ")}`);
}

main();
