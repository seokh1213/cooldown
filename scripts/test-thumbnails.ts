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
import { runeIconKey } from "../src/data/assets/riotAssetUrls";
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

// `runes` 는 판본 밖에 두는 자리다. 시트 파일도 여기 있다. 낡은 것으로 세지 않는다.
const stale = fs
  .readdirSync(imgRoot)
  .filter((entry) => entry !== release.sources.ddragon && entry !== "runes" && !entry.startsWith("runes."));
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

const missing: string[] = [];
for (const id of championIds) if (!fs.existsSync(path.join(out, "champion", `${id}.webp`))) missing.push(`champion/${id}`);
for (const id of itemIds) if (!fs.existsSync(path.join(out, "item", `${id}.webp`))) missing.push(`item/${id}`);
for (const key of runeKeys) if (!fs.existsSync(path.join(imgRoot, "runes", `${key}.webp`))) missing.push(`runes/${key}`);
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
for (const [kind, expected, dir] of [
  ["champion", championIds, out],
  ["item", itemIds, out],
  // 룬 시트는 판본 밖에 있고 이름 차례로 붙는다. 화면도 같은 차례로 센다.
  ["rune", [...runeKeys].sort(), imgRoot],
] as const) {
  const sheetFile = path.join(dir, `${kind}s.webp`);
  const listFile = path.join(dir, `${kind}s.json`);
  assert.ok(fs.existsSync(sheetFile), `${kind} 스프라이트가 없다`);
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

const total = [...championIds.map((id) => path.join(out, "champion", `${id}.webp`)), ...itemIds.map((id) => path.join(out, "item", `${id}.webp`))]
  .reduce((sum, file) => sum + fs.statSync(file).size, 0);
console.log(`✅ 썸네일 통과 (${championIds.length + itemIds.length}장 · ${(total / 1024 / 1024).toFixed(1)}MB)`);
