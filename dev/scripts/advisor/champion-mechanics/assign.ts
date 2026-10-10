import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Job } from "./contract";
import { readJson } from "./sources";

/** 같은 챔피언을 한 작업자에게 주고, 원문 길이로 작업량을 분산한다. */
export function partitionJobs(jobs: Job[], concurrency: number, completed: Set<string> = new Set()) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 6) throw new Error("Concurrency must be 1..6");
  const grouped = new Map<string, Job[]>();
  for (const job of jobs) {
    if (completed.has(job.id)) continue;
    grouped.set(job.champion, [...(grouped.get(job.champion) ?? []), job]);
  }
  const cost = (items: Job[]) => items.reduce((sum, job) => sum + job.sources.reduce((size, source) => size + source.text.length, 0), 0);
  const groups = [...grouped.values()].sort((a, b) => cost(b) - cost(a) || a[0].champion.localeCompare(b[0].champion));
  const batches = Array.from({ length: concurrency }, (_, index) => ({ worker: index + 1, cost: 0, ids: [] as string[] }));
  for (const group of groups) {
    const batch = [...batches].sort((a, b) => a.cost - b.cost || a.worker - b.worker)[0];
    batch.ids.push(...group.map(job => job.id));
    batch.cost += cost(group);
  }
  return batches;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.resolve(process.argv[2] ?? "dev/research/champion-mechanics/26.19-v2");
  const manifest = await readJson<{ jobs: Array<{ id: string; pilot: boolean }> }>(path.join(out, "manifest.json"));
  const jobs = await Promise.all(manifest.jobs.map(job => readJson<Job>(path.join(out, "inputs", `${job.id}.json`))));
  const excluded = new Set(process.argv.includes("--skip-pilot") ? manifest.jobs.filter(job => job.pilot).map(job => job.id) : []);
  const batches = partitionJobs(jobs, Number(process.argv[3] ?? 6), excluded);
  for (const batch of batches) await writeFile(path.join(out, "assignments", `worker-${batch.worker}.json`), `${JSON.stringify(batch, null, 2)}\n`);
  console.log(JSON.stringify(batches.map(batch => ({ worker: batch.worker, jobs: batch.ids.length, cost: batch.cost }))));
}
