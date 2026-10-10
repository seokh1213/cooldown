import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { test } from "node:test";
import { promisify } from "node:util";

const runNode = promisify(execFile);

const scenarioSource = `
  import assert from "node:assert/strict";
  import * as fs from "node:fs";
  import path from "node:path";
  import { tmpdir } from "node:os";
  import { mock } from "node:test";
  import { syncBuiltinESMExports } from "node:module";
  import sharp from "sharp";
  const scenario = process.env.THUMBNAIL_TEST_SCENARIO;
  const root = fs.mkdtempSync(path.join(tmpdir(), "cooldown-thumbnail-publication-"));
  const sameVersion = scenario.startsWith("same-version");
  const version = sameVersion ? "16.19.1" : "16.20.1";
  const patch = sameVersion ? "26.19" : "26.20";
  const write = (file, content) => {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, typeof content === "string" ? content : JSON.stringify(content));
  };
  write("public/data/version.json", { schemaVersion: 2, patchVersion: patch, sources: { ddragon: version, cdragon: version.slice(0, -2) } });
  write("public/data/" + patch + "/champions/ko_KR/index.json", {});
  if (scenario !== "empty-catalogs") {
    for (const id of ["Zed", "Garen"]) {
      write("public/data/" + patch + "/champions/ko_KR/" + id + ".json", { champion: { abilities: {
        P: { id: id + "P", iconFile: id + "Passive.png" },
        ...Object.fromEntries(["Q", "W", "E", "R"].map(slot => [slot, { id: id + slot }]))
      } } });
    }
  }
  write("public/data/" + patch + "/items-normalized-ko_KR.json", { items: [{ id: "2000" }, { id: "1001" }] });
  write("public/data/" + patch + "/runes-normalized-ko_KR.json", { runes: [], statShards: [] });
  write("public/data/" + patch + "/summoner-normalized-ko_KR.json", { spells: [{ iconPath: "SummonerFlash.png" }, { iconPath: "SummonerDot.png" }] });
  write("public/img/16.19.1/champion/Garen.webp", "previous image");
  write("public/img/custom/keep.txt", "unrelated asset");
  write("src/infrastructure/generated/assetVersion.ts", "previous version source");
  write("src/infrastructure/generated/spriteSheets.ts", "previous sheet source");
  process.argv.push("--force");
  const colors = {
    red: await sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 240, g: 20, b: 20, alpha: 1 } } }).png().toBuffer(),
    blue: await sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 20, g: 20, b: 240, alpha: 1 } } }).png().toBuffer(),
    green: await sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 20, g: 240, b: 20, alpha: 1 } } }).png().toBuffer(),
  };
  globalThis.fetch = async (input) => {
    if (scenario.endsWith("fetch-failure")) return new Response("", { status: 503 });
    const url = String(input);
    const color = /\\/(Garen|1001|SummonerDot|GarenQ)\\.png$/.test(url) ? colors.red
      : /\\/(Zed|2000|SummonerFlash|GarenE)\\.png$/.test(url) ? colors.blue : colors.green;
    return new Response(color);
  };
  if (scenario.endsWith("publication-failure")) {
    const rename = fs.renameSync;
    mock.method(fs.default, "renameSync", (from, to) => {
      if (path.basename(from) === "assetVersion.ts" && to === path.join(root, "src/infrastructure/generated/assetVersion.ts")) {
        throw new Error("asset index publication failed");
      }
      return rename(from, to);
    });
    syncBuiltinESMExports();
  }
  const read = file => fs.readFileSync(path.join(root, file), "utf8");
  try {
    const { generateThumbnails } = await import("./dev/scripts/data-pipeline/commands/generate-thumbnails.ts");
    if (scenario.endsWith("failure") || scenario === "empty-catalogs") {
      await assert.rejects(generateThumbnails(root), /failed|empty catalogs/);
      assert.equal(read("public/img/16.19.1/champion/Garen.webp"), "previous image");
      assert.equal(read("src/infrastructure/generated/assetVersion.ts"), "previous version source");
      assert.equal(read("src/infrastructure/generated/spriteSheets.ts"), "previous sheet source");
      if (!sameVersion) assert.equal(fs.existsSync(path.join(root, "public/img", version)), false);
    } else {
      await generateThumbnails(root);
      const out = path.join(root, "public/img", version);
      const championSheet = JSON.parse(fs.readFileSync(path.join(out, "champions.json"), "utf8"));
      assert.deepEqual(championSheet, { size: 96, cols: 2, rows: 1, ids: ["Garen", "Zed"] });
      const itemSheet = JSON.parse(fs.readFileSync(path.join(out, "items.json"), "utf8"));
      assert.deepEqual(itemSheet.ids, ["1001", "2000"]);
      const pixel = async (file, left, top) => {
        const { data, info } = await sharp(path.join(out, file)).raw().toBuffer({ resolveWithObject: true });
        const offset = (top * info.width + left) * info.channels;
        return [...data.subarray(offset, offset + 3)];
      };
      const red = async (file, left, top) => { const [r, , b] = await pixel(file, left, top); assert.ok(r > 200 && b < 50, file); };
      const blue = async (file, left, top) => { const [r, , b] = await pixel(file, left, top); assert.ok(b > 200 && r < 50, file); };
      await red("champions.webp", 48, 48);
      await blue("champions.webp", 144, 48);
      await red("items.webp", 32, 32);
      await blue("items.webp", 96, 32);
      await red("ability/Garen.webp", 96, 32);
      await blue("ability/Garen.webp", 224, 32);
      const strip = await sharp(path.join(out, "ability/Garen.webp")).metadata();
      assert.equal(strip.width, 320);
      assert.equal(strip.height, 64);
      assert.equal((await sharp(path.join(out, "champions.avif")).metadata()).width, 192);
      assert.ok(read("src/infrastructure/generated/assetVersion.ts").includes(JSON.stringify(version)));
      assert.ok(read("src/infrastructure/generated/spriteSheets.ts").includes('ids: ["Garen","Zed"]'));
      if (!sameVersion) assert.equal(fs.existsSync(path.join(root, "public/img/16.19.1")), false);
    }
    assert.equal(read("public/img/custom/keep.txt"), "unrelated asset");
    assert.equal(fs.readdirSync(path.join(root, "public/img")).some(name => name.startsWith(".generation-")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
`;

async function checkThumbnails(scenario: string): Promise<void> {
  const { stderr } = await runNode(process.execPath, [
    "--import", "tsx", "--input-type=module", "--eval", scenarioSource,
  ], {
    cwd: new URL("../../../../", import.meta.url),
    env: { ...process.env, THUMBNAIL_TEST_SCENARIO: scenario },
  });
  assert.equal(stderr, "");
}

test("썸네일 503 실패 시 기존 이미지와 TS 색인을 보존한다", () => checkThumbnails("fetch-failure"));
test("같은 판본 강제 재생성 실패 시 기존 이미지를 보존한다", () => checkThumbnails("same-version-fetch-failure"));
test("빈 챔피언 목록을 기존 이미지 교체 전에 거부한다", () => checkThumbnails("empty-catalogs"));
test("TS 색인 교체 실패 시 이미지와 기존 색인을 함께 복원한다", () => checkThumbnails("publication-failure"));
test("같은 판본 TS 색인 실패 시 기존 이미지도 복원한다", () => checkThumbnails("same-version-publication-failure"));
test("이미지 픽셀로 정렬·격자·스킬 슬롯을 확인하고 완성된 이미지와 색인을 발행한다", () => checkThumbnails("success"));
test("같은 판본도 완성된 이미지와 색인을 함께 교체한다", () => checkThumbnails("same-version-success"));
