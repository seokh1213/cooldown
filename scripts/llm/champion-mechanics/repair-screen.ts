import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Draft, Job } from "./contract";
import type { ScreenReport } from "./screen";
import { digest, readJson } from "./sources";
import { authorKit } from "./author";

export function currentFindings(job: Job, draft: Draft, report: ScreenReport) {
  const snapshot = report.snapshots.find(item => item.id === job.id);
  if (!snapshot || snapshot.sourceHash !== job.sourceHash || snapshot.candidateHash !== digest(draft)) return [];
  return report.findings.filter(finding => finding.id === job.id);
}
export async function repairScreened(out: string, options: { concurrency: number; excluded: string[] }) {
  const guide = await readFile(path.join(out, "WRITER_GUIDE.md"), "utf8");
  const repairs: Parameters<typeof authorKit>[0][] = [];
  for (const file of (await readdir(path.join(out, "reports/screens"))).filter(file => file.endsWith(".json")).sort()) {
    if (options.excluded.includes(file.slice(0, -5))) continue;
    const report = await readJson<ScreenReport>(path.join(out, "reports/screens", file));
    const jobs = [], supplied: Record<string, Draft> = {}, expectedHashes: Record<string, string> = {}, findings = [];
    for (const snapshot of report.snapshots) {
      const job = await readJson<Job>(path.join(out, "inputs", `${snapshot.id}.json`));
      const draft = await readJson<Draft>(path.join(out, "candidates", `${snapshot.id}.json`));
      const current = currentFindings(job, draft, report);
      if (!current.length) continue;
      jobs.push(job); supplied[job.slot] = draft; expectedHashes[job.id] = digest(draft); findings.push(...current);
    }
    if (jobs.length) repairs.push({ out, jobs, guide, expectedHashes,
      feedback: `An independent source review flagged the following. Verify each claim against the source; the reviewer may be wrong. Correct actual semantic mistakes; retain valid mechanics, actor, variant, scope and source evidence. Do not delete a rule merely to pass validation. If the fixed schema cannot express missing/current HP or stacks, preserve source text and an explicit gap rather than falsely choosing maxHealth or hit_count. Do not invent facts, formulas or schema fields. Return full corrected Draft for each assigned slot.\nPREVIOUS DRAFTS: ${JSON.stringify(supplied)}\nREVIEW FINDINGS: ${JSON.stringify(findings)}` });
  }
  let next = 0;
  const results: Array<Awaited<ReturnType<typeof authorKit>> | { champion: string; ok: boolean; reason: string }> = [];
  await Promise.all(Array.from({ length: Math.min(options.concurrency, repairs.length) }, async () => {
    while (next < repairs.length) {
      const context = repairs[next++];
      const result = await authorKit(context).catch(() => ({ champion: context.jobs[0].champion, ok: false, reason: "repair_failed" }));
      results.push(result);
      console.log(JSON.stringify({ completed: results.length, total: repairs.length, ...result }));
    }
  }));
  await writeFile(path.join(out, "reports/screen-repair.json"), `${JSON.stringify({ model: "gpt-6-luna", effort: "medium", results }, null, 2)}\n`);
  return results;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await repairScreened(path.resolve(process.argv[2] ?? "research/champion-mechanics/26.19-v2"), {
    concurrency: Number(process.argv[3] ?? 8), excluded: process.argv.find(arg => arg.startsWith("--exclude="))?.slice(10).split(",") ?? [],
  });
}
