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
    const scenario = process.env.PUBLICATION_TEST_SCENARIO;
    const directory = fs.mkdtempSync(path.join(tmpdir(), "cooldown-publication-"));
    const samePatch = scenario.startsWith("same-patch");
    const nextPatch = samePatch ? "26.19" : "26.20";
    const previousFile = path.join(directory, "26.19/champions/ko_KR/index.json");
    const advisorFile = path.join(directory, "26.19/llm/notes.json");
    const manifestFile = path.join(directory, "version.json");
    const previousManifest = JSON.stringify({ schemaVersion: 2, patchVersion: "26.19",
      sources: { ddragon: "16.19.1", cdragon: "16.19" } });
    const write = (file, content) => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    };
    write(previousFile, "previous champions");
    write(advisorFile, "preserved advisor inputs");
    write(manifestFile, previousManifest);
    write(path.join(directory, "releases/immutable/keep.json"), "unrelated release");
    write(path.join(directory, "custom/keep.txt"), "unrelated directory");
    globalThis.fetch = async () => { throw new Error("Real network forbidden in this test"); };
    if (scenario.endsWith("manifest-failure")) {
      const rename = fs.renameSync;
      mock.method(fs.default, "renameSync", (from, to) => {
        if (to === manifestFile) throw new Error("manifest publication failed");
        return rename(from, to);
      });
      syncBuiltinESMExports();
    }
    mock.module("./dev/scripts/data-pipeline/io/json.ts", { exports: {
      fetchJson: async () => [samePatch ? "16.19.2" : "16.20.1"],
      writeJson: async (value, file) => write(file, JSON.stringify(value)),
    } });
    mock.module("./dev/scripts/data-pipeline/generation/catalog-stage.ts", { exports: {
      fetchCatalogSources: async () => {
        if (scenario === "fetch-failure") throw new Error("catalog download failed");
        return {};
      },
      writeCatalogData: async (versionDir) => write(path.join(versionDir, "items.json"), "new items"),
    } });
    mock.module("./dev/scripts/data-pipeline/generation/champion-stage.ts", { exports: {
      fetchChampionSources: async () => ({ championIds: ["Garen"] }),
      writeChampionData: (versionDir) => write(path.join(versionDir, "champions/ko_KR/index.json"), "new champions"),
    } });
    mock.module("./dev/scripts/data-pipeline/generation/validation-stage.ts", { exports: {
      validateGeneratedData: async (versionDir) => {
        assert.equal(fs.readFileSync(previousFile, "utf8"), "previous champions");
        assert.equal(fs.readFileSync(advisorFile, "utf8"), "preserved advisor inputs");
        assert.equal(fs.readFileSync(path.join(versionDir, "champions/ko_KR/index.json"), "utf8"), "new champions");
        if (scenario.endsWith("validation-failure")) throw new Error("generated data validation failed");
      },
    } });
    mock.module("./dev/scripts/data-pipeline/sources/cdragon-build.ts", { exports: {
      fetchCdragonBuild: async () => ({ content: "new build", characters: "new timestamp" }),
    } });
    try {
      const { generateStaticData } = await import("./dev/scripts/data-pipeline/commands/generate-static-data.ts");
      if (scenario.endsWith("failure")) {
        await assert.rejects(generateStaticData(directory), /failed/);
        assert.equal(fs.readFileSync(previousFile, "utf8"), "previous champions");
        assert.equal(fs.readFileSync(advisorFile, "utf8"), "preserved advisor inputs");
        assert.equal(fs.readFileSync(manifestFile, "utf8"), previousManifest);
        if (!samePatch) assert.equal(fs.existsSync(path.join(directory, nextPatch)), false);
      } else {
        await generateStaticData(directory);
        assert.equal(fs.readFileSync(path.join(directory, nextPatch, "champions/ko_KR/index.json"), "utf8"), "new champions");
        assert.equal(fs.readFileSync(path.join(directory, nextPatch, "llm/notes.json"), "utf8"), "preserved advisor inputs");
        assert.equal(JSON.parse(fs.readFileSync(manifestFile, "utf8")).patchVersion, nextPatch);
        if (!samePatch) {
          assert.equal(fs.existsSync(path.join(directory, "26.19")), false);
          assert.equal(fs.readFileSync(path.join(directory, nextPatch, "llm/.carried-from"), "utf8"), "26.19");
        }
      }
      assert.equal(fs.readFileSync(path.join(directory, "releases/immutable/keep.json"), "utf8"), "unrelated release");
      assert.equal(fs.readFileSync(path.join(directory, "custom/keep.txt"), "utf8"), "unrelated directory");
      assert.equal(fs.readdirSync(directory).some(name => name.startsWith(".generation-")), false);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  `;

async function checkPublication(scenario: string): Promise<void> {
  const { stderr } = await runNode(process.execPath, [
    "--experimental-test-module-mocks",
    "--disable-warning=ExperimentalWarning",
    "--import", "tsx",
    "--input-type=module",
    "--eval", scenarioSource,
  ], {
    cwd: new URL("../../../", import.meta.url),
    env: { ...process.env, PUBLICATION_TEST_SCENARIO: scenario },
  });
  assert.equal(stderr, "");
}

test("다운로드 실패 시 기존 패치와 manifest를 보존한다", () => checkPublication("fetch-failure"));
test("새 패치 검증 실패 시 기존 패치와 advisor 입력을 보존한다", () => checkPublication("validation-failure"));
test("동일 패치 검증 실패 시 기존 파일을 덮어쓰지 않는다", () => checkPublication("same-patch-validation-failure"));
test("manifest 발행 실패 시 교체한 패치 폴더를 복원한다", () => checkPublication("manifest-failure"));
test("동일 패치 manifest 발행 실패 시 기존 폴더를 복원한다", () => checkPublication("same-patch-manifest-failure"));
test("검증 후 새 패치를 발행하고 숫자 패치 폴더만 정리한다", () => checkPublication("success"));
test("동일 패치도 검증 후 발행하며 advisor 입력을 보존한다", () => checkPublication("same-patch-success"));
