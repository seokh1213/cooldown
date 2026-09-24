import * as fs from "node:fs";
import * as path from "node:path";
import { DATA_LOCALES } from "../src/data/contracts/staticData";
import { resolveStaticDataRelease } from "../src/lib/staticDataRelease";
import {
  fetchCatalogSources,
  writeCatalogData,
} from "./data-pipeline/generation/catalog-stage";
import {
  fetchChampionSources,
  writeChampionData,
} from "./data-pipeline/generation/champion-stage";
import { validateGeneratedData } from "./data-pipeline/generation/validation-stage";
import { fetchCdragonBuild } from "./data-pipeline/sources/cdragon-build";
import { fetchJson, writeJson } from "./data-pipeline/io/json";

const VERSION_URL = "https://ddragon.leagueoflegends.com/api/versions.json";
const DATA_DIR = path.join(process.cwd(), "public", "data");

/**
 * 도우미 자료(`<패치>/llm`)는 이 생성기가 만들지 않는다. 위키에서 받은 것(대시·위키 메타·규칙
 * 노트)과 그로부터 지은 것(카드·지식 묶음·번역·미리 쓴 상성 답)이 섞여 있다. 옛 패치 폴더를 통째로
 * 지우면 새 패치에는 도우미 자료가 하나도 없게 된다 — 26.19 가 나온 날 CI 가 그 자리에서 멈췄다
 * (지식 점검이 새 패치의 카드를 못 찾았다). 지우기 전에 새 패치 폴더로 옮겨 두고, 새 자료로 다시
 * 짓는 일은 `npm run llm:carry` 가 한다.
 */
function carryAdvisorData(fromDir: string, currentPatchVersion: string, fromPatch: string): void {
  const source = path.join(fromDir, "llm");
  const target = path.join(DATA_DIR, currentPatchVersion, "llm");
  if (!fs.existsSync(source) || fs.existsSync(target)) return;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.renameSync(source, target);
  fs.writeFileSync(path.join(target, ".carried-from"), fromPatch);
  console.log(`📦 Carried advisor data ${fromPatch} → ${currentPatchVersion} (npm run llm:carry rebuilds it)`);
}

function removeOldReleaseDirectories(currentPatchVersion: string): void {
  if (!fs.existsSync(DATA_DIR)) return;
  for (const entry of fs.readdirSync(DATA_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === currentPatchVersion) continue;
    if (/^\d+\.\d+$/.test(entry.name)) carryAdvisorData(path.join(DATA_DIR, entry.name), currentPatchVersion, entry.name);
    console.log(`🗑️ Removing old patch data: ${entry.name}`);
    fs.rmSync(path.join(DATA_DIR, entry.name), {
      recursive: true,
      force: true,
    });
  }
}

async function generateStaticData(): Promise<void> {
  console.log("🚀 Starting static data generation");
  const versions = await fetchJson<string[]>(VERSION_URL);
  const release = resolveStaticDataRelease(versions[0]);
  const { patchVersion, sources } = release;
  console.log(
    `✅ Source identity: patch ${patchVersion}, ` +
      `DDragon ${sources.ddragon}, CDragon ${sources.cdragon}`,
  );
  removeOldReleaseDirectories(patchVersion);
  const versionDir = path.join(DATA_DIR, patchVersion);

  const catalogs = await fetchCatalogSources(release, DATA_LOCALES);
  const champions = await fetchChampionSources(release, DATA_LOCALES);
  writeChampionData(versionDir, release, DATA_LOCALES, champions);
  await writeCatalogData(versionDir, release, DATA_LOCALES, catalogs);
  await validateGeneratedData(versionDir, release, champions);
  // 다음 회차가 "바뀐 게 없다" 를 판단할 근거. 패치 버전만으로는 CDragon 재추출을 놓친다.
  const cdragonBuild = await fetchCdragonBuild(sources.cdragon);
  await writeJson(
    { schemaVersion: 2, patchVersion, sources, cdragonBuild },
    path.join(DATA_DIR, "version.json"),
  );

  console.log(
    `🎉 Generated patch ${patchVersion}: ${champions.championIds.length} champions, ` +
      `${DATA_LOCALES.length} locales`,
  );
}

generateStaticData().catch((error: unknown) => {
  console.error("❌ Static data generation failed", error);
  process.exitCode = 1;
});
