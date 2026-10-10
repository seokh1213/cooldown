/** 새 입력을 준비하고 검증 가능한 기존 초안만 재사용한다. 바뀐 슬롯은 author가 이어 작성한다. */
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Job, Manifest } from "../../../../src/domain/knowledge/notes/mechanicsContract";
import type { ReviewDecision } from "./export";
import { baselineDirectory, compareInventory, loadBaseline, type Baseline, type DriftSlot } from "./drift";
import { prepare, ROOT } from "./prepare";
import { buildInventory, digest, readJson } from "./sources";
import { validateDraft } from "./validate";
import type { ScreenReport } from "./screen";

async function carryScreens(options: { previous: string; out: string; baseline: Baseline; reuse: DriftSlot[] }) {
  const oldJobs = new Map(options.baseline.jobs.map(job => [job.id, job]));
  const slots = new Map(options.reuse.map(slot => [slot.id, slot]));
  for (const champion of new Set(options.reuse.map(slot => oldJobs.get(slot.id)!.champion))) {
    const report = await readJson<ScreenReport>(path.join(options.previous, "reports/screens", `${champion}.json`)).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (!report) continue;
    const valid = report.snapshots.filter(snap => slots.has(snap.id) && snap.sourceHash === oldJobs.get(snap.id)?.sourceHash
      && snap.candidateHash === digest(options.baseline.drafts.get(snap.id)));
    if (!valid.length) continue;
    const ids = new Set(valid.map(snap => snap.id));
    await mkdir(path.join(options.out, "reports/screens"), { recursive: true });
    await writeFile(path.join(options.out, "reports/screens", `${champion}.json`), `${JSON.stringify({ ...report,
      snapshots: valid.map(snap => ({ ...snap, sourceHash: slots.get(snap.id)!.sourceHash })), findings: report.findings.filter(finding => ids.has(finding.id)),
      notes: [...report.notes, `Carried from ${options.baseline.manifest.patch} after identical semantic fingerprint; no new model review was performed.`],
      previousSnapshots: valid }, null, 2)}\n`);
  }
}

export async function stageUpdate(options: { root?: string; baseline?: string; output: string }) {
  const root = options.root ?? ROOT, previous = options.baseline ?? await baselineDirectory(root);
  const out = path.resolve(options.output);
  if (out === path.resolve(previous) || await access(out).then(() => true, () => false)) throw new Error("Refresh requires a new output directory");
  const [baseline, inventory] = await Promise.all([loadBaseline(previous), buildInventory(root)]);
  const report = compareInventory(baseline, inventory);
  await prepare(out, root);
  const decisions: ReviewDecision[] = [];
  const reuse = report.slots.filter(slot => slot.action === "reuse");
  for (const slot of reuse) {
    const job = await readJson<Job>(path.join(out, "inputs", `${slot.id}.json`));
    const draft = baseline.drafts.get(slot.id)!;
    if (!validateDraft(job, draft).valid) throw new Error(`Reused candidate failed current validation: ${slot.id}`);
    await writeFile(path.join(out, "candidates", `${slot.id}.json`), `${JSON.stringify(draft, null, 2)}\n`, { flag: "wx" });
    if (slot.retainedReview) {
      const prior = baseline.decisions.find(decision => decision.id === slot.id)!;
      decisions.push({ ...prior, sourceHash: job.sourceHash, candidateHash: digest(draft),
        notes: [...prior.notes, `Carried from ${baseline.manifest.patch} after identical semantic fingerprint and current validation. Previous sourceHash: ${prior.sourceHash}.`] });
    }
  }
  const manifest = await readJson<Manifest>(path.join(out, "manifest.json"));
  for (const job of manifest.jobs) job.state = reuse.some(slot => slot.id === job.id) ? "validated" : "pending";
  await mkdir(path.join(out, "reports"), { recursive: true });
  const json = async (name: string, data: unknown) => writeFile(path.join(out, name), `${JSON.stringify(data, null, 2)}\n`);
  await json("manifest.json", manifest);
  await json("review-ledger.json", { decisions });
  await carryScreens({ previous, out, baseline, reuse });
  await json("reports/update-plan.json", { ...report, approvalPolicy: "Changed slots never inherit review approval; author fills only missing candidates." });
  return { ...report.counts, pending: report.counts.regenerate };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error("Usage: refresh.ts <new-output-directory>");
  console.log(JSON.stringify(await stageUpdate({ output: process.argv[2] })));
}
