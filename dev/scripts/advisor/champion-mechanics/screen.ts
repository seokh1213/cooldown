import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Draft, Job } from "../../../../src/domain/knowledge/notes/mechanicsContract";
import { invokeCodex } from "./author";
import { digest, readJson } from "./sources";
import { buildReviewView } from "./review-view";

export interface Finding { id: string; path: string; severity: "high" | "medium"; sourceId: string; quote: string; issue: string; correction: string }
export interface ScreenReport {
  model: string; effort: string; status: "screened"; snapshots: Array<{ id: string; sourceHash: string; candidateHash: string }>;
  findings: Finding[]; notes: string[];
}
const findingSchema = { type: "object", additionalProperties: false, properties: {
  id: { type: "string" }, path: { type: "string" }, severity: { type: "string", enum: ["high", "medium"] },
  sourceId: { type: "string" }, quote: { type: "string" }, issue: { type: "string" }, correction: { type: "string" },
}, required: ["id", "path", "severity", "sourceId", "quote", "issue", "correction"] };
const screenSchema = { type: "object", additionalProperties: false, properties: {
  findings: { type: "array", items: findingSchema }, notes: { type: "array", items: { type: "string" } },
}, required: ["findings", "notes"] };
export function normalizeFinding(jobs: Job[], finding: Finding): Finding {
  const named = jobs.find(item => finding.id === item.id || finding.id.startsWith(`${item.id}.`));
  const job = named ?? (/^[A-Z]\w*\.[PQWER](\.|$)/.test(finding.id) ? undefined : jobs.find(item => finding.path.startsWith(`${item.id}.`)));
  if (!job) return finding;
  const localPath = finding.path.startsWith(`${job.id}.`) ? finding.path.slice(job.id.length + 1) : finding.path;
  return { ...finding, id: job.id, path: localPath.replace(/\[(\d+)\]/g, ".$1") };
}
export function validateFindings(jobs: Job[], findings: Finding[]) {
  return findings.every(finding => jobs.find(job => job.id === finding.id)?.sources
    .some(source => source.id === finding.sourceId && finding.quote.length > 0 && source.text.includes(finding.quote))
    && /^(summary|rules(?:\.\d+)?|gaps)(\.|$)/.test(finding.path));
}
export function mergeScreens(prior: ScreenReport | null, latest: ScreenReport): ScreenReport {
  const replaced = new Set(latest.snapshots.map(item => item.id));
  return { ...latest, snapshots: [...(prior?.snapshots ?? []).filter(item => !replaced.has(item.id)), ...latest.snapshots],
    findings: [...(prior?.findings ?? []).filter(item => !replaced.has(item.id)), ...latest.findings],
    notes: [...new Set([...(prior?.notes ?? []), ...latest.notes])] };
}
const SCREEN_GUIDE = `Independently review extracted mechanics against supplied sources, not your game knowledge. Return only concrete unsupported/contradictory predicates, events, actors, stat owners, units, values, target/form scope, omitted material effects, or misleading Korean summary. id must be exactly the input slot id (e.g. Briar.Q), not a finding name. path is local dot notation with zero-based indices (e.g. rules.0.conditions.1), without champion prefix. Every finding needs an exact original source quote. Prefer English tooltip; include locale disagreement only if it materially changes meaning. Text/gaps honestly preserving uncertain formulas are NOT defects. Do not demand invented conditions. No human approval.
Check especially: stacks/charges/casts/entities versus hit_count; damage numbers used as counts/distances; current/missing/max/bonus Health; conditional damage versus universal damage; cast, hit, pickup, expiry or cancelled attack events; optional permission versus prerequisite; durations attached to a buff versus damage/heal; first versus all targets; percentages/all ranked values; bonus HP conversion versus scaling modifier; typed predicates contradicting their own explanatory text; first and last shots/forms/weapon variants. STATS lacks currentHealth and missingHealth, so retain those as text/unknown + gap, never force maxHealth. NumberRefs are source locations, not proof of their semantic role. Use issue and correction in Korean. Do not flag copied code-owned facts merely because they are omitted from the draft. Do not browse or use tools.`;
async function screenKit(out: string, ids: string[]) {
  const jobs = await Promise.all(ids.map(id => readJson<Job>(path.join(out, "inputs", `${id}.json`))));
  const drafts = await Promise.all(ids.map(id => readJson<Draft>(path.join(out, "candidates", `${id}.json`))));
  const views = jobs.map((job, index) => buildReviewView(job, drafts[index]));
  const snapshots = jobs.map((job, index) => ({ id: job.id, sourceHash: job.sourceHash, candidateHash: digest(drafts[index]) }));
  const directory = await mkdtemp(path.join(os.tmpdir(), "cooldown-mechanics-screen-"));
  try {
    const schema = path.join(directory, "schema.json"), output = path.join(directory, "response.json");
    await writeFile(schema, JSON.stringify(screenSchema));
    let supplied: Pick<ScreenReport, "findings" | "notes"> = { findings: [], notes: [] };
    let feedback = "";
    for (let attempt = 1; attempt <= 2; attempt++) {
      const result = await invokeCodex({ directory, schema, output, prompt: `${SCREEN_GUIDE}\n${JSON.stringify(views)}\n${feedback}` });
      if (result.code) throw new Error(`screen_exit_${result.code}`);
      supplied = JSON.parse(await readFile(output, "utf8"));
      supplied.findings = supplied.findings.map(finding => normalizeFinding(jobs, finding));
      if (validateFindings(jobs, supplied.findings)) break;
      await mkdir(path.join(out, "reports/screen-rejected"), { recursive: true });
      await writeFile(path.join(out, "reports/screen-rejected", `${jobs[0].champion}.json`), `${JSON.stringify(supplied, null, 2)}\n`);
      if (attempt === 2) throw new Error("Screen finding contains invalid source citation or path");
      feedback = `Your previous report has a wrong slot id, path or quote. Every quote must be a single exact substring of the source for that SAME slot id. Never combine non-adjacent sentences or borrow another slot's source. Correct the report:\n${JSON.stringify(supplied)}`;
    }
    const report: ScreenReport = { model: "gpt-6-luna", effort: "medium", status: "screened", snapshots, ...supplied };
    const target = path.join(out, "reports/screens", `${jobs[0].champion}.json`);
    const prior = await readJson<ScreenReport>(target).catch(() => null);
    await writeFile(target, `${JSON.stringify(mergeScreens(prior, report), null, 2)}\n`);
    return { champion: jobs[0].champion, slots: ids.length, findings: supplied.findings.length, ok: true };
  } finally { await rm(directory, { recursive: true, force: true }); }
}
export async function runScreen(out: string, concurrency: number, excluded: string[] = []) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) throw new Error("Concurrency must be 1..16");
  await mkdir(path.join(out, "reports/screens"), { recursive: true });
  const grouped = new Map<string, string[]>();
  for (const file of (await readdir(path.join(out, "candidates"))).filter(file => file.endsWith(".json")).sort()) {
    const id = file.slice(0, -5), champion = id.split(".")[0];
    if (excluded.includes(champion)) continue;
    const prior = await readJson<ScreenReport>(path.join(out, "reports/screens", `${champion}.json`)).catch(() => null);
    const draft = await readJson<Draft>(path.join(out, "candidates", file));
    const job = await readJson<Job>(path.join(out, "inputs", file));
    if (prior?.snapshots.some(item => item.id === id && item.candidateHash === digest(draft) && item.sourceHash === job.sourceHash)) continue;
    grouped.set(champion, [...(grouped.get(champion) ?? []), id]);
  }
  const kits = [...grouped.values()];
  let next = 0;
  const results: unknown[] = [];
  await Promise.all(Array.from({ length: Math.min(concurrency, kits.length) }, async () => {
    while (next < kits.length) {
      const ids = kits[next++];
      const result = await screenKit(out, ids).catch(error => ({ champion: ids[0].split(".")[0], ok: false, reason: String(error) }));
      results.push(result);
      console.log(JSON.stringify({ completed: results.length, total: kits.length, ...result }));
    }
  }));
  return results;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const results = await runScreen(path.resolve(process.argv[2] ?? "dev/research/champion-mechanics/26.19-v2"), Number(process.argv[3] ?? 8),
    process.argv.find(arg => arg.startsWith("--exclude="))?.slice(10).split(",") ?? []);
  console.log(JSON.stringify({ screenedKits: results.length }));
}
