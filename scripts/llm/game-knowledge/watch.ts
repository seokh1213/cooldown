import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { collectSource, diffSnapshots, getText, officialPatches, sha256, SITEMAP, type Snapshot, type Source } from "./sources";

interface Registry { wiki: Array<{ title: string }>; cdragon: string[]; pinnedOfficialPatches: string[]; recentOfficialCount: number }
interface Baseline { schemaVersion: number; patch: string; snapshots: Snapshot[] }

async function readJson<T>(file: string): Promise<T> { return JSON.parse(await fs.readFile(file, "utf8")) as T; }

async function sourceList(registry: Registry, cdragon: string) {
  const xml = await getText(SITEMAP);
  const patches = officialPatches(xml);
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
  const errors: Array<{ id: string; error: string }> = [];
  await fs.mkdir(path.join(output, "sources"), { recursive: true });
  for (let start = 0; start < sources.length; start += 2) {
    const batch = sources.slice(start, start + 2);
    const results = await Promise.allSettled(batch.map(collectSource));
    for (const [index, result] of results.entries()) {
      const source = batch[index];
      if (result.status === "rejected") { errors.push({ id: source.id, error: String(result.reason) }); continue; }
      snapshots.push(result.value.snapshot);
      await fs.writeFile(path.join(output, "sources", `${sha256(source.id).slice(0, 16)}.txt`), result.value.raw);
    }
  }
  return { snapshots, errors };
}

export async function watchSources(output = path.join(process.cwd(), "research/.cache/game-knowledge/watch"), mode: "check" | "initialize" = "check", root = process.cwd()) {
  const marker = await readJson<{ patchVersion: string; sources: { cdragon: string } }>(path.join(root, "public/data/version.json"));
  const registry = await readJson<Registry>(path.join(root, "knowledge/game-source-registry.json"));
  const baselineFile = path.join(root, "knowledge/game-source-baseline.json");
  const baseline = mode === "initialize" ? { schemaVersion: 1, patch: marker.patchVersion, snapshots: [] } : await readJson<Baseline>(baselineFile);
  const { sources, patches, indexHash } = await sourceList(registry, marker.sources.cdragon);
  const { snapshots, errors } = await collect(sources, output);
  const changes = diffSnapshots(baseline.snapshots, snapshots);
  const report = { schemaVersion: 1, checkedAt: new Date().toISOString(), patch: marker.patchVersion,
    baselinePatch: baseline.patch, complete: errors.length === 0, indexHash, discoveredLatestPatch: patches.at(-1)!.patch,
    officialPatchCount: patches.length, changes, errors, reviewStatus: "detection-only", snapshots };
  await fs.writeFile(path.join(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(path.join(output, "official-index.json"), JSON.stringify(patches, null, 2));
  const summary = `# Game knowledge source check\n\nPatch: ${report.patch}; latest official: ${report.discoveredLatestPatch}\n\n${snapshots.length} sources checked; ${changes.length} changed/new; ${errors.length} failed. Detection does not approve facts.\n\n${changes.map(change => `- ${change.change}: [${change.id}](${change.url})`).join("\n")}\n${errors.map(error => `- Failed: ${error.id}: ${error.error}`).join("\n")}\n`;
  await fs.writeFile(path.join(output, "summary.md"), summary);
  if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
  if (errors.length) throw new Error(`Incomplete source check: ${errors.length} failed; baseline retained`);
  if (mode === "initialize") await fs.writeFile(baselineFile, `${JSON.stringify({ schemaVersion: 1, patch: marker.patchVersion, snapshots }, null, 2)}\n`);
  console.log(`${snapshots.length} sources; ${changes.length} changed/new; ${errors.length} failed`);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await watchSources(process.argv[2] === "--initialize" ? undefined : process.argv[2], process.argv.includes("--initialize") ? "initialize" : "check");
}
