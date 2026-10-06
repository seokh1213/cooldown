import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
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

// Advisor inputs survive patch changes; llm:carry rebuilds derived outputs after publication.
function carryAdvisorData(fromDir: string, target: string, fromPatch: string): void {
  const source = path.join(fromDir, "llm");
  if (!fs.existsSync(source) || fs.existsSync(target)) return;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true });
  fs.writeFileSync(path.join(target, ".carried-from"), fromPatch);
  console.log(`📦 Copied advisor data from ${fromPatch} (npm run llm:carry rebuilds it)`);
}

function oldPatchDirectories(dataDirectory: string, currentPatchVersion: string): string[] {
  return fs.readdirSync(dataDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== currentPatchVersion && /^\d+\.\d+$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left, "en", { numeric: true }));
}

function removeOldReleaseDirectories(dataDirectory: string, currentPatchVersion: string): void {
  for (const name of oldPatchDirectories(dataDirectory, currentPatchVersion)) {
    console.log(`🗑️ Removing old patch data: ${name}`);
    fs.rmSync(path.join(dataDirectory, name), {
      recursive: true,
      force: true,
    });
  }
}

function publishGeneratedData(dataDirectory: string, stagingDirectory: string, patchVersion: string): void {
  const target = path.join(dataDirectory, patchVersion);
  const previous = path.join(stagingDirectory, "previous-patch");
  const hadPrevious = fs.existsSync(target);
  if (hadPrevious) fs.renameSync(target, previous);
  let installed = false;
  try {
    fs.renameSync(path.join(stagingDirectory, patchVersion), target);
    installed = true;
    // Replace the manifest last so failed publication keeps the previous release usable.
    fs.renameSync(path.join(stagingDirectory, "version.json"), path.join(dataDirectory, "version.json"));
  } catch (error) {
    if (installed) fs.rmSync(target, { recursive: true, force: true });
    if (hadPrevious) fs.renameSync(previous, target);
    throw error;
  }
}

export async function generateStaticData(dataDirectory = DATA_DIR): Promise<void> {
  console.log("🚀 Starting static data generation");
  const versions = await fetchJson<string[]>(VERSION_URL);
  const release = resolveStaticDataRelease(versions[0]);
  const { patchVersion, sources } = release;
  console.log(
    `✅ Source identity: patch ${patchVersion}, ` +
      `DDragon ${sources.ddragon}, CDragon ${sources.cdragon}`,
  );
  const catalogs = await fetchCatalogSources(release, DATA_LOCALES);
  const champions = await fetchChampionSources(release, DATA_LOCALES);
  fs.mkdirSync(dataDirectory, { recursive: true });
  const stagingDirectory = fs.mkdtempSync(path.join(dataDirectory, ".generation-"));
  let published = false;
  try {
    const versionDir = path.join(stagingDirectory, patchVersion);
    const existing = path.join(dataDirectory, patchVersion);
    if (fs.existsSync(existing)) fs.cpSync(existing, versionDir, { recursive: true });
    for (const oldPatch of oldPatchDirectories(dataDirectory, patchVersion)) {
      carryAdvisorData(path.join(dataDirectory, oldPatch), path.join(versionDir, "llm"), oldPatch);
    }
    writeChampionData(versionDir, release, DATA_LOCALES, champions);
    await writeCatalogData(versionDir, release, DATA_LOCALES, catalogs);
    await validateGeneratedData(versionDir, release, champions);
    // Same-patch CDragon rebuilds also change this marker.
    const cdragonBuild = await fetchCdragonBuild(sources.cdragon);
    await writeJson(
      { schemaVersion: 2, patchVersion, sources, cdragonBuild },
      path.join(stagingDirectory, "version.json"),
    );
    publishGeneratedData(dataDirectory, stagingDirectory, patchVersion);
    published = true;
    removeOldReleaseDirectories(dataDirectory, patchVersion);
  } finally {
    // Keep the previous files available if filesystem errors also prevent rollback.
    if (published || !fs.existsSync(path.join(stagingDirectory, "previous-patch"))) {
      fs.rmSync(stagingDirectory, { recursive: true, force: true });
    }
  }

  console.log(
    `🎉 Generated patch ${patchVersion}: ${champions.championIds.length} champions, ` +
      `${DATA_LOCALES.length} locales`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  generateStaticData().catch((error: unknown) => {
    console.error("❌ Static data generation failed", error);
    process.exitCode = 1;
  });
}
