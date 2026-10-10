import { access, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Draft, Job } from "./contract";
import { readJson } from "./sources";
import { completeNumberEvidence } from "./evidence";
import { validateDraft } from "./validate";
import { authorKit } from "./author";

interface RejectedKit { drafts: Record<string, Draft>; failures: Array<{ id: string; errors: unknown[] }> }
export function recoverableDrafts(jobs: Job[], rejected: RejectedKit) {
  return jobs.flatMap(job => {
    const supplied = rejected.drafts[job.slot];
    if (!supplied?.rules) return [];
    const draft = completeNumberEvidence(job, supplied).draft;
    return validateDraft(job, draft).valid ? [{ job, draft }] : [];
  });
}
/** 진행 중인 키트를 건드리지 않고, 호출이 끝난 실패 키트의 유효 슬롯만 복구한다. */
export async function recoverCompleted(out: string) {
  const progress = await readJson<{ results: Array<{ champion: string; ids: string[]; ok: boolean }> }>(path.join(out, "reports/author-progress.json"));
  const guide = await readFile(path.join(out, "WRITER_GUIDE.md"), "utf8");
  const repairs = [];
  let recovered = 0;
  for (const result of progress.results.filter(item => !item.ok)) {
    const rejectedFile = path.join(out, "reports/rejected", `${result.champion}.attempt-2.json`);
    if (!await access(rejectedFile).then(() => true, () => false)) continue;
    const rejected = await readJson<RejectedKit>(rejectedFile);
    const jobs = await Promise.all(result.ids.map(id => readJson<Job>(path.join(out, "inputs", `${id}.json`))));
    for (const { job, draft } of recoverableDrafts(jobs, rejected)) {
      const target = path.join(out, "candidates", `${job.id}.json`);
      if (await access(target).then(() => true, () => false)) continue;
      await writeFile(target, `${JSON.stringify(draft, null, 2)}\n`, { flag: "wx" });
      recovered++;
    }
    const existing = new Set(await readdir(path.join(out, "candidates")));
    const missing = jobs.filter(job => !existing.has(`${job.id}.json`));
    if (missing.length) repairs.push({ out, jobs: missing, guide,
      feedback: `Repair these previous drafts against their exact sources. Do not remove mechanics merely to pass validation.\n${JSON.stringify({ drafts: Object.fromEntries(missing.map(job => [job.slot, rejected.drafts[job.slot]])), failures: rejected.failures })}` });
  }
  return { recovered, repairs };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.resolve(process.argv[2] ?? "dev/research/champion-mechanics/26.19-v2");
  const { recovered, repairs } = await recoverCompleted(out);
  console.log(JSON.stringify({ recovered, repairKits: repairs.length }));
  let next = 0;
  const results: unknown[] = [];
  await Promise.all(Array.from({ length: Math.min(4, repairs.length) }, async () => {
    while (next < repairs.length) {
      const result = await authorKit(repairs[next++]);
      results.push(result);
      console.log(JSON.stringify(result));
    }
  }));
  await writeFile(path.join(out, "reports/recovery.json"), `${JSON.stringify({ recovered, results }, null, 2)}\n`);
}
