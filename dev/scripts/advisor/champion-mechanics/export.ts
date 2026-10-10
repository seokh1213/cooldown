import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Draft, Job, Manifest } from "../../../../src/domain/knowledge/notes/mechanicsContract";
import { checkDirectory } from "./check";
import { ROOT } from "./prepare";
import { buildInventory, digest, readJson } from "./sources";
import { validatedRecord } from "./validate";

export interface ReviewDecision {
  id: string; sourceHash: string; candidateHash: string;
  verdict: "accepted" | "needs_revision"; checks: string[]; notes: string[];
}
export function acceptedReview(job: Job, draft: Draft, decision?: ReviewDecision) {
  return decision?.verdict === "accepted" && decision.sourceHash === job.sourceHash && decision.candidateHash === digest(draft);
}
export function reviewRisks(draft: Draft): string[] {
  const effects = draft.rules.flatMap(rule => rule.effects);
  const flags = new Set<string>();
  if (effects.some(effect => ["stat_conversion", "crowd_control", "revive", "execute", "transform"].includes(effect.kind))) flags.add("mechanics");
  if (draft.rules.some(rule => rule.variant !== "base")) flags.add("variants");
  if (draft.rules.some(rule => rule.conditions.length)) flags.add("conditions");
  if (draft.gaps.length) flags.add("source_gaps");
  return [...flags];
}
export async function exportRecords(out: string, root = ROOT) {
  const manifest = await readJson<Manifest>(path.join(out, "manifest.json"));
  const fresh = await buildInventory(root);
  if (fresh.patch !== manifest.patch || digest(fresh.jobs.map(job => ({ id: job.id, sourceHash: job.sourceHash }))) !== manifest.inventoryHash) {
    throw new Error("Current source inventory differs from frozen extraction input");
  }
  const report = await checkDirectory(out, manifest.jobs.map(job => job.id));
  if (report.counts.valid !== manifest.jobs.length) throw new Error(`Cannot export partial/invalid data: ${report.counts.valid}/${manifest.jobs.length}`);
  const ledger = await readJson<{ decisions: ReviewDecision[] }>(path.join(out, "review-ledger.json")).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return { decisions: [] };
    throw error;
  });
  await mkdir(path.join(out, "records"), { recursive: true });
  const reviewQueue = [];
  let reviewed = 0;
  for (const pending of manifest.jobs) {
    const job = await readJson<Job>(path.join(out, "inputs", `${pending.id}.json`));
    const draft = await readJson<Draft>(path.join(out, "candidates", `${pending.id}.json`));
    const accepted = acceptedReview(job, draft, ledger.decisions.find(decision => decision.id === job.id));
    const record = { ...validatedRecord(job, draft), status: accepted ? "reviewed" : "validated", candidateHash: digest(draft) };
    await writeFile(path.join(out, "records", `${job.id}.json`), `${JSON.stringify(record, null, 2)}\n`);
    pending.state = record.status;
    if (accepted) reviewed++;
    else reviewQueue.push({ id: job.id, risks: reviewRisks(draft), sourceHash: job.sourceHash, candidateHash: digest(draft) });
  }
  const summary = { ...manifest.counts, authored: manifest.jobs.length, validated: manifest.jobs.length, reviewed,
    pendingSemanticReview: reviewQueue.length, deployment: "not_integrated" };
  await writeFile(path.join(out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(out, "reports/validation.json"), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(path.join(out, "reports/review-queue.json"), `${JSON.stringify(reviewQueue, null, 2)}\n`);
  await writeFile(path.join(out, "reports/summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await exportRecords(path.resolve(process.argv[2] ?? "dev/research/champion-mechanics/26.19-v2"))));
}
