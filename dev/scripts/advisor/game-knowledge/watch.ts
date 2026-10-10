import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { saveHealth, sourceFailure, type SourceFailure } from "../../ci/source-health.mjs";
import { collectSource, diffSnapshots, getText, officialPatches, PATCH_INDEX, sha256, SITEMAP, type Snapshot, type Source } from "./sources";
import { writeMonsterCandidates } from "./monster-candidates";
import { writeNoteImpacts } from "./note-impacts";

interface Registry { wiki: Array<{ title: string }>; cdragon: string[]; pinnedOfficialPatches: string[]; recentOfficialCount: number }
interface Baseline { schemaVersion: number; patch: string; snapshots: Snapshot[] }

async function readJson<T>(file: string): Promise<T> { return JSON.parse(await fs.readFile(file, "utf8")) as T; }

async function sourceList(registry: Registry, cdragon: string) {
  // 사이트맵은 새 패치 게시보다 늦게 갱신되므로 공식 목록의 링크도 함께 확인한다.
  const indexes = await Promise.all([getText(SITEMAP), getText(PATCH_INDEX)]);
  const patches = officialPatches(indexes.join("\n"));
  if (!patches.length) throw new Error("No official PC patch URLs discovered");
  const selected = patches.filter((entry, index) => index >= patches.length - registry.recentOfficialCount || registry.pinnedOfficialPatches.includes(entry.patch));
  const sources: Source[] = [
    ...registry.wiki.map(({ title }) => ({ id: `wiki:${title}`, kind: "wiki" as const, title, url: `https://wiki.leagueoflegends.com/en-us/${title.replace(/ /g, "_")}` })),
    ...selected.map(({ patch, url }) => ({ id: `official:${patch}`, kind: "official" as const, url })),
    ...registry.cdragon.map(name => ({ id: `cdragon:${name}`, kind: "cdragon" as const, url: `https://raw.communitydragon.org/${cdragon}/game/data/characters/${name}/${name}.bin.json` })),
  ];
  return { sources, patches, indexHash: sha256(JSON.stringify(patches)) };
}

async function collect(sources: Source[], output: string) {
  const snapshots: Snapshot[] = [];
  const errors: SourceFailure[] = [];
  const deadline = Date.now() + 8 * 60 * 1000;
  await fs.mkdir(path.join(output, "sources"), { recursive: true });
  for (let start = 0; start < sources.length; start += 2) {
    // CI가 강제 종료하기 전에 불완전 보고서와 연속 장애 시작 시각을 보존한다.
    if (Date.now() >= deadline) {
      errors.push(...sources.slice(start).map(source => sourceFailure(source.id, new DOMException("Collection retry budget exhausted", "TimeoutError"))));
      break;
    }
    const batch = sources.slice(start, start + 2);
    const results = await Promise.allSettled(batch.map(collectSource));
    for (const [index, result] of results.entries()) {
      const source = batch[index];
      if (result.status === "rejected") { errors.push(sourceFailure(source.id, result.reason)); continue; }
      snapshots.push(result.value.snapshot);
      await fs.writeFile(path.join(output, "sources", `${sha256(source.id).slice(0, 16)}.txt`), result.value.raw);
    }
  }
  return { snapshots, errors };
}

export async function watchSources(output = path.join(process.cwd(), "dev/research/.cache/game-knowledge/watch"), mode: "check" | "initialize" | "ci" = "check", root = process.cwd()) {
  const marker = await readJson<{ patchVersion: string; sources: { cdragon: string } }>(path.join(root, "public/data/version.json"));
  const registry = await readJson<Registry>(path.join(root, "dev/data/knowledge/game-source-registry.json"));
  const baselineFile = path.join(root, "dev/data/knowledge/game-source-baseline.json");
  const baseline = mode === "initialize" ? { schemaVersion: 1, patch: marker.patchVersion, snapshots: [] } : await readJson<Baseline>(baselineFile);
  let patches: Array<{ patch: string; url: string }> = [];
  let expectedSources: number | null = null;
  let indexHash: string | null = null;
  let snapshots: Snapshot[] = [];
  let errors: SourceFailure[] = [];
  await fs.mkdir(output, { recursive: true });
  try {
    const discovered = await sourceList(registry, marker.sources.cdragon);
    patches = discovered.patches;
    indexHash = discovered.indexHash;
    expectedSources = discovered.sources.length;
    ({ snapshots, errors } = await collect(discovered.sources, output));
  } catch (error) {
    errors.push(sourceFailure("source-discovery", error));
  }
  const monsterReview = await writeMonsterCandidates(output, snapshots, root);
  const changes = diffSnapshots(baseline.snapshots, snapshots);
  const noteReview = await writeNoteImpacts(output, snapshots, baseline.snapshots, root);
  const health = mode === "ci" ? saveHealth(process.env.SOURCE_HEALTH_FILE ?? path.join(root, "dev/research/.cache/source-health/knowledge.json"), errors,
    { publishedPatch: marker.patchVersion, discoveredLatestPatch: patches.at(-1)?.patch ?? null }) : undefined;
  const report = { schemaVersion: 1, checkedAt: new Date().toISOString(), patch: marker.patchVersion,
    baselinePatch: baseline.patch, complete: errors.length === 0, expectedSources, availability: health?.status ?? (errors.length ? "unavailable" : "available"),
    firstUnavailableAt: health?.firstUnavailableAt ?? null, indexHash, discoveredLatestPatch: patches.at(-1)?.patch ?? null,
    officialPatchCount: patches.length, changes, errors, reviewStatus: "detection-only", snapshots,
    monsterCandidates: monsterReview.candidates.length, affectedMonsterFacts: monsterReview.affectedFacts.length,
    affectedReviewedNotes: noteReview.affectedNotes.length };
  await fs.writeFile(path.join(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(path.join(output, "official-index.json"), JSON.stringify(patches, null, 2));
  const summary = `# Game knowledge source check\n\nPatch: ${report.patch}; latest official: ${report.discoveredLatestPatch}; availability: ${report.availability}; complete: ${report.complete}.\n\n${snapshots.length}/${expectedSources ?? "unknown"} sources checked; ${changes.length} changed/new; ${errors.length} failed. Detection does not approve facts. Partial collection cannot establish that missing sources are unchanged.\n\n${monsterReview.candidates.length} monster candidates; ${monsterReview.affectedFacts.length} reviewed monster facts and ${noteReview.affectedNotes.length} reviewed notes affected.\n\n${changes.map(change => `- ${change.change}: [${change.id}](${change.url})`).join("\n")}\n${errors.map(error => `- Failed: ${error.id}: ${error.error}`).join("\n")}\n`;
  await fs.writeFile(path.join(output, "summary.md"), summary);
  if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
  if (errors.length && health?.status !== "deferred") throw new Error(`Incomplete source check: ${errors.length} failed; baseline retained`);
  if (mode === "initialize") await fs.writeFile(baselineFile, `${JSON.stringify({ schemaVersion: 1, patch: marker.patchVersion, snapshots }, null, 2)}\n`);
  console.log(`${snapshots.length} sources; ${changes.length} changed/new; ${errors.length} failed`);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const output = process.argv.slice(2).find(argument => !argument.startsWith("--"));
  await watchSources(output, process.argv.includes("--initialize") ? "initialize" : process.argv.includes("--ci") ? "ci" : "check");
}
