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

const root = process.cwd();
const dataDir = path.join(root, "public/data");
const release = JSON.parse(fs.readFileSync(path.join(dataDir, "version.json"), "utf8")) as {
  patchVersion: string;
  sources: { ddragon: string };
};
const imgRoot = path.join(root, "public/img");
const out = path.join(imgRoot, release.sources.ddragon);

assert.ok(fs.existsSync(out), `썸네일 폴더가 없다: ${out}. \`npm run generate-thumbnails\` 를 돌려야 한다`);

const stale = fs.readdirSync(imgRoot).filter((entry) => entry !== release.sources.ddragon);
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

const missing: string[] = [];
for (const id of championIds) if (!fs.existsSync(path.join(out, "champion", `${id}.webp`))) missing.push(`champion/${id}`);
for (const id of itemIds) if (!fs.existsSync(path.join(out, "item", `${id}.webp`))) missing.push(`item/${id}`);
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

const total = [...championIds.map((id) => path.join(out, "champion", `${id}.webp`)), ...itemIds.map((id) => path.join(out, "item", `${id}.webp`))]
  .reduce((sum, file) => sum + fs.statSync(file).size, 0);
console.log(`✅ 썸네일 통과 (${championIds.length + itemIds.length}장 · ${(total / 1024 / 1024).toFixed(1)}MB)`);
