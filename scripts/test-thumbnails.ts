/**
 * 썸네일이 자료와 짝이 맞는지 검사한다
 *
 * 화면은 원본 대신 미리 줄여 둔 사본을 가리킨다. 그래서 한 장이라도 빠지면 그
 * 자리는 깨진 그림이 된다. 대체 경로를 두지 않은 대신, 자료에 있는 모든 챔피언과
 * 아이템에 사본이 있는지를 여기서 못 박는다.
 *
 * 판본이 바뀌면 폴더 이름도 바뀌므로, 지난 판본이 남아 있는지도 함께 본다.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { formIconKey, runeIconKey } from "../src/data/assets/riotAssetUrls";
import { FORMULA_GROUPS } from "../src/data/gameFormulas";
import { STAT_DEFINITIONS } from "../src/types/combatStats";
import { RUNE_TREE_META } from "../src/data/mappers/runeMapper";

const root = process.cwd();
const dataDir = path.join(root, "public/data");
const release = JSON.parse(fs.readFileSync(path.join(dataDir, "version.json"), "utf8")) as {
  patchVersion: string;
  sources: { ddragon: string };
};
const imgRoot = path.join(root, "public/img");
const out = path.join(imgRoot, release.sources.ddragon);

assert.ok(fs.existsSync(out), `썸네일 폴더가 없다: ${out}. \`npm run generate-thumbnails\` 를 돌려야 한다`);

/*
 * `runes` 와 `stat` 은 판본 밖에 두는 자리다. 시트 파일도 여기 있다.
 *
 * 룬은 자료에 판본이 안 들어 있어 부르는 쪽이 값을 모르고, 스탯 글리프는 패치별
 * 자료가 아니라 UI 그림이라 값이 안 바뀐다. 둘 다 낡은 것으로 세지 않는다.
 */
const stale = fs
  .readdirSync(imgRoot)
  .filter(
    (entry) =>
      entry !== release.sources.ddragon && entry !== "runes" && entry !== "stat" && !entry.startsWith("runes."),
  );
assert.deepEqual(stale, [], "지난 판본 썸네일이 남아 있다. 저장소가 패치마다 불어난다");

const championIds = fs
  .readdirSync(path.join(dataDir, release.patchVersion, "champions", "ko_KR"))
  .filter((f) => f.endsWith(".json") && f !== "index.json")
  .map((f) => f.replace(/\.json$/, ""));
const itemIds = (
  JSON.parse(fs.readFileSync(path.join(dataDir, release.patchVersion, "items-normalized-ko_KR.json"), "utf8")) as {
    items: Array<{ id: string }>;
  }
).items.map((item) => item.id);

/*
 * 룬은 판본 폴더 밖에 있다. 룬 자료에 판본이 안 들어 있어 부르는 쪽이 값을 모르고,
 * Data Dragon 도 룬 아이콘만은 판본 없는 주소로 주기 때문이다.
 *
 * 경로 꼴이 둘로 섞여 오므로 화면과 생성기가 같은 규칙으로 이름을 지어야 한다.
 * 여기서 그 짝을 확인한다 — 어긋나면 룬 화면 그림이 통째로 깨진다.
 */
const runeKeys = [
  ...new Set(
    [...fs.readFileSync(path.join(dataDir, release.patchVersion, "runes-normalized-ko_KR.json"), "utf8").matchAll(/"iconPath"\s*:\s*"([^"]+)"/g)]
      .map((match) => match[1])
      .filter((iconPath) => iconPath.endsWith(".png"))
      .map(runeIconKey)
      // 계열 아이콘 다섯 장은 자료가 아니라 매퍼에 박혀 있다. 여기 없으면 룬 화면이 깨진다.
      .concat(Object.values(RUNE_TREE_META).map((tree) => runeIconKey(tree.icon))),
  ),
];
assert.ok(runeKeys.length > 40, `룬 아이콘이 ${runeKeys.length}개뿐이다`);

/** 소환사 주문 아이콘. 백과 네 탭 중 마지막으로 우리 자리로 옮긴 것이다. */
const summonerIcons = [
  ...new Set(
    (
      JSON.parse(fs.readFileSync(path.join(dataDir, release.patchVersion, "summoner-normalized-ko_KR.json"), "utf8")) as {
        spells: Array<{ iconPath?: string }>;
      }
    ).spells
      .map((spell) => (spell.iconPath ?? "").replace(/\.png$/, ""))
      .filter(Boolean),
  ),
].sort();
assert.ok(summonerIcons.length > 20, `소환사 주문 아이콘이 ${summonerIcons.length}개뿐이다`);

/*
 * 챔피언 스킬·패시브 아이콘. 마지막까지 Data Dragon 을 직접 보던 것이다.
 * 시트로 묶지 않고 낱장으로 둔다 — 한 화면에 다섯에서 여덟 장만 쓰기 때문이다.
 */
const abilityIcons: string[] = [];
const passiveIcons: string[] = [];
/*
 * 변신 스킬 아이콘. 화면과 생성기가 같은 규칙으로 이름을 지어야 한다 — 어긋나면
 * 엘리스·니달리·제이스·그웬의 스킬 칸이 통째로 빈다.
 */
const formKeys: string[] = [];
for (const id of championIds) {
  const champion = (
    JSON.parse(fs.readFileSync(path.join(dataDir, release.patchVersion, "champions", "ko_KR", `${id}.json`), "utf8")) as {
      champion?: {
        abilities?: Record<string, { id?: string; iconFile?: string; forms?: Array<{ iconPath: string }> }>;
      };
    }
  ).champion;
  for (const [slot, ability] of Object.entries(champion?.abilities ?? {})) {
    if (slot === "P") {
      if (ability?.iconFile) passiveIcons.push(ability.iconFile.replace(/\.png$/, ""));
    } else if (ability?.id) {
      abilityIcons.push(ability.id);
    }
    for (const form of ability?.forms ?? []) formKeys.push(formIconKey(form.iconPath));
  }
}
assert.ok(abilityIcons.length > 500, `스킬 아이콘이 ${abilityIcons.length}개뿐이다`);
assert.ok(passiveIcons.length > 150, `패시브 아이콘이 ${passiveIcons.length}개뿐이다`);
assert.ok(formKeys.length > 20, `변신 아이콘이 ${formKeys.length}개뿐이다`);

/*
 * 스탯 글리프. 툴팁의 계수 항과 아이템 능력치 줄이 함께 쓴다.
 *
 * 화면이 마지막까지 CommunityDragon 을 직접 보던 것이라, 우리 자리로 옮기면서
 * 이름이 나오는 세 자리를 다 모아야 한다 — 챔피언 자료의 자리 표시, 계산식 표,
 * 스탯 정의. 한 장이라도 빠지면 그 줄의 그림만 조용히 빈다.
 */
const statIcons = new Set<string>();
for (const group of FORMULA_GROUPS) for (const entry of group.entries) if (entry.icon) statIcons.add(entry.icon);
for (const definition of Object.values(STAT_DEFINITIONS)) if (definition.icon) statIcons.add(definition.icon);
for (const id of championIds) {
  const raw = fs.readFileSync(path.join(dataDir, release.patchVersion, "champions", "ko_KR", `${id}.json`), "utf8");
  for (const token of raw.matchAll(/\[\[si:([a-z]+)]]/g)) statIcons.add(token[1]);
}
assert.ok(statIcons.size > 15, `스탯 글리프가 ${statIcons.size}개뿐이다`);
const missingStatIcons = [...statIcons].filter((name) => !fs.existsSync(path.join(imgRoot, "stat", `${name}.webp`)));
assert.deepEqual(missingStatIcons, [], `스탯 글리프가 빠진 것 ${missingStatIcons.length}건`);

const missing: string[] = [];
for (const id of championIds) if (!fs.existsSync(path.join(out, "champion", `${id}.webp`))) missing.push(`champion/${id}`);
for (const id of itemIds) if (!fs.existsSync(path.join(out, "item", `${id}.webp`))) missing.push(`item/${id}`);
for (const key of runeKeys) if (!fs.existsSync(path.join(imgRoot, "runes", `${key}.webp`))) missing.push(`runes/${key}`);
for (const name of summonerIcons) if (!fs.existsSync(path.join(out, "summoner", `${name}.webp`))) missing.push(`summoner/${name}`);
for (const name of new Set(abilityIcons)) if (!fs.existsSync(path.join(out, "spell", `${name}.webp`))) missing.push(`spell/${name}`);
for (const name of new Set(passiveIcons)) if (!fs.existsSync(path.join(out, "passive", `${name}.webp`))) missing.push(`passive/${name}`);
for (const key of new Set(formKeys)) if (!fs.existsSync(path.join(out, "form", `${key}.webp`))) missing.push(`form/${key}`);
assert.deepEqual(missing.slice(0, 20), [], `썸네일이 빠진 것 ${missing.length}건`);

assert.ok(championIds.length > 150, `챔피언이 ${championIds.length}명뿐이다. 자료를 못 읽은 것이다`);
assert.ok(itemIds.length > 500, `아이템이 ${itemIds.length}개뿐이다. 자료를 못 읽은 것이다`);

/*
 * 크기도 본다. 줄이는 것이 목적인데 원본만 한 파일이 들어가 있으면 헛일이다.
 * 챔피언 96px WebP 가 평균 2.3KB, 아이템 64px 가 1KB 남짓이다. 넉넉히 잡아 8KB.
 */
const heavy: string[] = [];
for (const kind of ["champion", "item"] as const) {
  for (const file of fs.readdirSync(path.join(out, kind))) {
    const bytes = fs.statSync(path.join(out, kind, file)).size;
    if (bytes > 8 * 1024) heavy.push(`${kind}/${file} ${Math.round(bytes / 1024)}KB`);
  }
}
assert.deepEqual(heavy.slice(0, 10), [], "줄어들지 않은 썸네일이 있다");

/*
 * 스프라이트와 그 목록이 자료와 맞는지 본다.
 *
 * 목록 화면이 이것을 보고 칸을 자른다. 차례가 하나만 밀려도 챔피언마다 엉뚱한
 * 그림이 나오는데, 눈으로는 "왜 이 아이콘이지" 싶을 뿐 고장으로 안 보인다.
 */
for (const [kind, source, dir] of [
  ["champion", championIds, out],
  ["item", itemIds, out],
  // 룬 시트는 판본 밖에 있다. 넷 다 이름 차례로 붙고, 화면도 같은 비교로 센다.
  ["summoner", summonerIcons, out],
  ["rune", runeKeys, imgRoot],
] as const) {
  /*
   * 차례는 **이름순**이다.
   *
   * 예전에는 자료에 실린 차례를 그대로 봤다. 그래서 이 시험은 생성기와 자기 자신이
   * 같은지만 확인했고, 정작 화면이 다른 차례로 세고 있는 것은 못 잡았다 — 가렌
   * 자리에 아트록스가 나오는 채로 통과했다. 이제 양쪽이 같은 비교를 쓰므로
   * 여기서도 그 비교로 견준다.
   */
  const expected = [...new Set<string>(source)].sort();
  const sheetFile = path.join(dir, `${kind}s.webp`);
  const listFile = path.join(dir, `${kind}s.json`);
  assert.ok(fs.existsSync(sheetFile), `${kind} 스프라이트가 없다`);
  /*
   * AVIF 사본도 짝으로 있어야 한다.
   *
   * 화면은 `image-set` 으로 둘을 함께 걸고 브라우저가 읽을 수 있는 쪽을 집는다.
   * AVIF 쪽만 없으면 읽을 수 있는 브라우저가 404 를 받아 배경이 빈다 — 그것도
   * 화면은 조용하다. 그리고 줄어들지 않았으면 만들 까닭이 없으므로 크기도 본다.
   */
  const avifFile = path.join(dir, `${kind}s.avif`);
  assert.ok(fs.existsSync(avifFile), `${kind} AVIF 사본이 없다`);
  assert.ok(
    fs.statSync(avifFile).size < fs.statSync(sheetFile).size,
    `${kind}: AVIF 사본이 WebP 보다 크다. 만들 까닭이 없다`,
  );
  const list = JSON.parse(fs.readFileSync(listFile, "utf8")) as { size: number; cols: number; rows: number; ids: string[] };
  assert.deepEqual(list.ids, expected, `${kind}: 스프라이트 차례가 자료와 다르다`);
  assert.ok(list.cols * list.rows >= list.ids.length, `${kind}: 격자가 칸 수보다 작다`);
  assert.ok(list.size > 0, `${kind}: 칸 크기가 없다`);
  /*
   * 화면은 목록 파일을 받지 않고 열 수를 스스로 센다. 그 셈이 생성기와 같아야 한다 —
   * 어긋나면 아이콘이 통째로 밀리는데 눈으로는 고장으로 안 보인다.
   */
  assert.equal(list.cols, Math.max(1, Math.ceil(Math.sqrt(list.ids.length))), `${kind}: 열 수 셈이 화면과 다르다`);
}

/*
 * 스킬 띠는 챔피언마다 한 장이어야 한다.
 *
 * 띠에는 옆에 붙는 목록이 없다. 칸 차례가 P·Q·W·E·R 로 정해져 있어 화면이 슬롯
 * 글자만으로 자리를 세기 때문이다(`src/components/ui/ability-icon.tsx`). 목록이
 * 없는 대신 **띠 자체가 빠졌는지**는 여기서 본다. 빠지면 그 챔피언의 VS 화면에
 * 아이콘이 통째로 안 나오는데, 요청이 404 로 끝나 화면은 조용하다.
 */
const abilityStripDir = path.join(out, "ability");
assert.ok(fs.existsSync(abilityStripDir), "스킬 띠 폴더가 없다. `npm run generate-thumbnails` 를 돌려야 한다");
const missingStrips = championIds.filter(
  (id) => !fs.existsSync(path.join(abilityStripDir, `${id}.webp`)) || !fs.existsSync(path.join(abilityStripDir, `${id}.avif`)),
);
assert.deepEqual(missingStrips.slice(0, 10), [], `스킬 띠가 빠진 챔피언 ${missingStrips.length}명`);
// 다섯 칸짜리 한 줄이라 낱장 다섯 장과 엇비슷해야 한다. 크게 벗어나면 붙이는 규칙이 바뀐 것이다.
const fatStrips = fs
  .readdirSync(abilityStripDir)
  .filter((file) => file.endsWith(".webp") && fs.statSync(path.join(abilityStripDir, file)).size > 24 * 1024);
assert.deepEqual(fatStrips.slice(0, 5), [], "스킬 띠가 낱장 다섯 장보다 훨씬 무겁다");

const total = [...championIds.map((id) => path.join(out, "champion", `${id}.webp`)), ...itemIds.map((id) => path.join(out, "item", `${id}.webp`))]
  .reduce((sum, file) => sum + fs.statSync(file).size, 0);
console.log(`✅ 썸네일 통과 (${championIds.length + itemIds.length}장 · ${(total / 1024 / 1024).toFixed(1)}MB)`);
