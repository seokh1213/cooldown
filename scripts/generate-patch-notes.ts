import path from "node:path";
import { decodePatchNotesIndex, type PatchSnapshot } from "../src/data/contracts/patchNotes";
import { decodeDataManifest } from "../src/data/contracts/dataManifest";
import { resolveStaticDataRelease } from "../src/lib/staticDataRelease";
import { collectPatchSnapshot } from "./patch-notes/collect";
import { comparePatchSnapshots } from "./patch-notes/diff";
import { extendPatchNotesIndex } from "./patch-notes/archive";
import { fetchJson } from "./data-pipeline/io/json";
import { findUnmappedChanges } from "./patch-notes/review";
import type { NumericChampion } from "./patch-notes/sourceTypes";
import { patchReleases, planCurrentComparisons, planPatchComparisons, type PatchComparison } from "./patch-notes/plan";
import { ARCHIVE_DIRECTORY, REPORT_DIRECTORY, readJson, archiveJson, writeJson } from "./patch-notes/storage";
import { generatePatchSkillArchives } from "./patch-notes/skills";

async function snapshot(ddragonVersion: string): Promise<PatchSnapshot> {
  const { patchVersion } = resolveStaticDataRelease(ddragonVersion);
  const file = path.join(ARCHIVE_DIRECTORY, "snapshots", `${patchVersion}.json`);
  const stored = await readJson(file) as PatchSnapshot | undefined;
  if (stored) {
    if (stored.schemaVersion !== 1 || stored.patchVersion !== patchVersion) {
      throw new Error(`Archived snapshot identity differs: ${patchVersion}`);
    }
    return stored;
  }
  const collected = await collectPatchSnapshot(ddragonVersion);
  await archiveJson(file, collected);
  return collected;
}

async function generateReport(comparison: PatchComparison, releases: Map<string, string>): Promise<void> {
  const { previous: previousPatch, current: currentPatch } = comparison;
  const resolve = (patch: string) => {
    const version = releases.get(patch);
    if (!version) throw new Error(`Source version unavailable: ${patch}`);
    return version;
  };
  const before = await snapshot(resolve(previousPatch));
  const after = await snapshot(resolve(currentPatch));
  const report = comparePatchSnapshots(before, after);
  const oldSource = await readJson(path.join(ARCHIVE_DIRECTORY, "sources", `${previousPatch}.json`)) as Record<string, NumericChampion> | undefined;
  const newSource = await readJson(path.join(ARCHIVE_DIRECTORY, "sources", `${currentPatch}.json`)) as Record<string, NumericChampion> | undefined;
  if (!oldSource || !newSource) throw new Error("Archived numeric sources are required for review");
  const review = findUnmappedChanges(oldSource, newSource);
  report.reviewCount = review.length;
  await generatePatchSkillArchives(report, after);
  await writeJson(path.join(ARCHIVE_DIRECTORY, "reviews", `${currentPatch}.json`), { previousPatch, currentPatch, changes: review });
  await writeJson(path.join(REPORT_DIRECTORY, `${currentPatch}.json`), report);
  const indexFile = path.join(REPORT_DIRECTORY, "index.json");
  const existing = await readJson(indexFile);
  const index = extendPatchNotesIndex(existing ? decodePatchNotesIndex(existing) : undefined, currentPatch, previousPatch);
  await writeJson(indexFile, index);
  console.log(`${previousPatch} → ${currentPatch}: ${report.entries.length} entities, ${report.entries.reduce((sum, entry) => sum + entry.changes.length, 0)} numeric changes, ${review.length} unmapped`);
}

async function comparisons(releases: Map<string, string>): Promise<PatchComparison[]> {
  const args = process.argv.slice(2);
  if (args[0] === "--backfill" && args.length === 2) return planPatchComparisons(releases, args[1]);
  if (args.length === 0 || (args[0] === "--current" && args.length === 1)) {
    const manifest = decodeDataManifest(await readJson(path.resolve("public/data/version.json")));
    // CI가 방금 수집한 데이터 판본으로 비교한다. upstream의 다음 패치를 섞지 않는다.
    releases.set(manifest.patchVersion, manifest.sources.ddragon);
    const stored = await readJson(path.join(REPORT_DIRECTORY, "index.json"));
    const archived = stored ? decodePatchNotesIndex(stored).patches.map(patch => patch.patchVersion) : [];
    return planCurrentComparisons(releases, manifest.patchVersion, archived);
  }
  if (args.length === 2 && args.every(patch => /^\d+\.\d+$/.test(patch)) && args[0] !== args[1]) {
    return [{ previous: args[0], current: args[1] }];
  }
  throw new Error("Use --current, --backfill 26, or two official patches: 26.18 26.19");
}

async function main(): Promise<void> {
  const versions = await fetchJson<string[]>("https://ddragon.leagueoflegends.com/api/versions.json");
  const releases = patchReleases(versions);
  const plans = await comparisons(releases);
  if (!plans.length) throw new Error("No released patches in the requested year");
  for (const comparison of plans) await generateReport(comparison, releases);
}

await main();
