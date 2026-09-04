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
import { fetchJson, writeJson } from "./data-pipeline/io/json";

const VERSION_URL = "https://ddragon.leagueoflegends.com/api/versions.json";
const DATA_DIR = path.join(process.cwd(), "public", "data");

function removeOldReleaseDirectories(currentPatchVersion: string): void {
  if (!fs.existsSync(DATA_DIR)) return;
  for (const entry of fs.readdirSync(DATA_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === currentPatchVersion) continue;
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
  await writeJson(
    { schemaVersion: 2, patchVersion, sources },
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
