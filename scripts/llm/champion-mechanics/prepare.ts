import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SCHEMA_VERSION, type Manifest } from "./contract";
import { GUIDE } from "./guide";
import { DRAFT_SCHEMA } from "./schema";
import { buildInventory, digest, promptHash, readJson } from "./sources";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const PILOT_IDS = ["Pyke.P", "Akshan.P", "LeeSin.R", "Jayce.Q", "Hwei.E", "Aphelios.E", "Nidalee.Q", "Mordekaiser.R"];
export async function prepare(out: string, root = ROOT) {
  const { patch, jobs, overview } = await buildInventory(root);
  const inventoryHash = digest(jobs.map(job => ({ id: job.id, sourceHash: job.sourceHash })));
  const oldManifest = await readJson<Manifest>(path.join(out, "manifest.json")).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  const hasCandidates = oldManifest && await Promise.all(oldManifest.jobs.map(job => access(path.join(out, "candidates", `${job.id}.json`)).then(() => true, () => false)));
  if (hasCandidates?.some(Boolean) && (oldManifest?.inventoryHash !== inventoryHash || oldManifest.promptHash !== promptHash())) {
    throw new Error("Existing candidates have different source/schema hashes. Prepare a new output directory; do not restamp old candidates.");
  }
  for (const folder of ["inputs", "candidates", "overview", "reports", "assignments"]) await mkdir(path.join(out, folder), { recursive: true });
  const json = async (file: string, value: unknown) => writeFile(path.join(out, file), `${JSON.stringify(value, null, 2)}\n`);
  for (const job of jobs) await json(`inputs/${job.id}.json`, job);
  for (const common of overview) await json(`overview/${common.id}.json`, common);
  await json("draft.schema.json", DRAFT_SCHEMA);
  await json("candidate.template.json", { summary: "<근거에 따른 한국어 요약>", rules: [], gaps: [] });
  await writeFile(path.join(out, "WRITER_GUIDE.md"), `${GUIDE}\n`);
  const manifest = { schemaVersion: SCHEMA_VERSION, patch, promptHash: promptHash(),
    inventoryHash,
    counts: { champions: overview.length, common: overview.length, abilities: jobs.length, total: overview.length + jobs.length },
    requestedAuthor: { model: "gpt-6-luna", effort: "medium" },
    jobs: jobs.map(job => ({ id: job.id, champion: job.champion, slot: job.slot,
      sourceHash: job.sourceHash, promptHash: job.promptHash,
      state: oldManifest?.jobs.find(item => item.id === job.id)?.state ?? "pending", pilot: PILOT_IDS.includes(job.id) })),
  };
  await json("manifest.json", manifest);
  return manifest.counts;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.resolve(process.argv[2] ?? "research/champion-mechanics/26.19-v2");
  console.log(JSON.stringify({ output: path.relative(ROOT, out), counts: await prepare(out) }));
}
