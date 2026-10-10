import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile, access, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Draft, Job, Manifest } from "../../../../src/domain/knowledge/notes/mechanicsContract";
import { digest, readJson } from "./sources";
import { validateDraft } from "./validate";
import { DRAFT_SCHEMA } from "./schema";
import { completeNumberEvidence } from "./evidence";

export function kitSchema(jobs: Job[]) {
  // The provider's strict JSON subset excludes uniqueItems; local Ajv still enforces it.
  const providerSchema = JSON.parse(JSON.stringify(DRAFT_SCHEMA, (key, value) => key === "uniqueItems" ? undefined : value));
  return { type: "object", additionalProperties: false,
    properties: Object.fromEntries(jobs.map(job => [job.slot, providerSchema])), required: jobs.map(job => job.slot) };
}
export function authorInput(job: Job) {
  const hasEnglishBody = job.sources.some(source => source.id === "en:body");
  const numbers = job.numbers.filter(number => !hasEnglishBody || !number.sourceId.startsWith("ko:"));
  return { id: job.id, champion: job.champion, slot: job.slot, slotRole: job.slotRole, variants: job.variants,
    sources: job.sources, numbers, facts: { name: job.facts.name, crowdControl: job.facts.crowdControl } };
}
export function invokeCodex(context: { directory: string; schema: string; output: string; prompt: string }): Promise<{ code: number; error?: string }> {
  return new Promise(resolve => {
    const child = spawn("codex", ["exec", "--json", "--ephemeral", "--ignore-user-config", "--disable", "plugins", "--disable", "multi_agent",
      "--skip-git-repo-check", "-s", "read-only", "-m", "gpt-6-luna", "-c", 'model_reasoning_effort="medium"',
      "-C", context.directory, "--output-schema", context.schema, "-o", context.output, "-"], { stdio: ["pipe", "pipe", "pipe"] });
    // Provider events can contain session IDs and prompts. Drain them without persisting or printing them.
    child.stdout.resume();
    child.stderr.resume();
    child.on("error", error => resolve({ code: -1, error: error.message }));
    child.on("close", code => resolve({ code: code ?? -1 }));
    child.stdin.end(context.prompt);
  });
}
export async function authorKit(context: { out: string; jobs: Job[]; guide: string; feedback?: string; expectedHashes?: Record<string, string> }) {
  const { out, jobs, guide } = context;
  const directory = await mkdtemp(path.join(os.tmpdir(), "cooldown-mechanics-"));
  const schema = path.join(directory, "kit.schema.json");
  const output = path.join(directory, "response.json");
  await writeFile(schema, JSON.stringify(kitSchema(jobs)));
  const basePrompt = `${guide}\n\nComplete ONE champion kit. Return ONLY an object keyed by assigned slots, with full Drafts. Do not browse, invoke tools, create files or call another model. Preserve negatives, actor, time, variants and conditional scopes. Existing numeric facts/formulas remain code-owned.\nVERY IMPORTANT: Every numberRef must come from the exact SAME sourceId cited in that rule.evidence, AND the cited quote must contain that specific number's original position. Never mix Korean number IDs with English quotes. When English body exists only English numeric IDs are supplied. Korean text remains for detecting contradictions, not inventing numeric references. If a numeric amount is unspecified (e.g. refund mana cost), leave parameters empty rather than borrowing a damage value as mana. CC annotations belong only to kind=crowd_control, damageType only to kind=damage. 'Can cast while winding up' means additional permission, not a requirement. First-hit restrictions need an explicit first-hit source phrase. Edge hit or AoE does not mean first hit. Count, distance and seconds are different units.\nINPUTS:\n${JSON.stringify(jobs.map(authorInput))}\n`;
  let feedback = context.feedback ?? "";
  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const result = await invokeCodex({ directory, schema, output, prompt: `${basePrompt}\n${feedback}` });
      if (result.code !== 0) return { champion: jobs[0].champion, ids: jobs.map(job => job.id), ok: false, reason: `codex_exit_${result.code}`, attempts: attempt };
      let drafts: Record<string, Draft>;
      try { drafts = JSON.parse(await readFile(output, "utf8")); }
      catch { feedback = "Previous response was not parseable JSON. Return exactly the required kit object."; continue; }
      const failures = jobs.flatMap(job => {
        if (drafts[job.slot]?.rules) drafts[job.slot] = completeNumberEvidence(job, drafts[job.slot]).draft;
        const validation = validateDraft(job, drafts[job.slot]);
        return validation.valid ? [] : [{ id: job.id, errors: validation.errors }];
      });
      if (failures.length) {
        const rejected = path.join(out, "reports", "rejected");
        await mkdir(rejected, { recursive: true });
        await writeFile(path.join(rejected, `${jobs[0].champion}.attempt-${attempt}.json`), `${JSON.stringify({ drafts, failures }, null, 2)}\n`);
        feedback = `Previous response: ${JSON.stringify(drafts)}\nCorrect only reported errors, preserving valid facts. Every numeric reference must be in a cited source sentence. If needed add the exact original sentence that contains that number; don't translate quotes or invent numbers. Errors: ${JSON.stringify(failures)}`;
        continue;
      }
      for (const job of jobs) {
        // A coordinator must not overwrite an independent writer's candidate.
        const target = path.join(out, "candidates", `${job.id}.json`);
        if (context.expectedHashes?.[job.id]) {
          if (digest(await readJson<Draft>(target)) !== context.expectedHashes[job.id]) throw new Error(`Concurrent candidate change: ${job.id}`);
          await writeFile(target, `${JSON.stringify(drafts[job.slot], null, 2)}\n`);
        } else await writeFile(target, `${JSON.stringify(drafts[job.slot], null, 2)}\n`, { flag: "wx" });
      }
      return { champion: jobs[0].champion, ids: jobs.map(job => job.id), ok: true, attempts: attempt };
    }
    return { champion: jobs[0].champion, ids: jobs.map(job => job.id), ok: false, reason: "validation_failed", attempts: 2 };
  } finally { await rm(directory, { recursive: true, force: true }); }
}
export async function runAuthor(out: string, options: { concurrency: number; limit?: number; excludeChampions?: string[] }) {
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 16) throw new Error("Concurrency must be 1..16");
  const manifest = await readJson<Manifest>(path.join(out, "manifest.json"));
  const guide = await readFile(path.join(out, "WRITER_GUIDE.md"), "utf8");
  const grouped = new Map<string, Job[]>();
  for (const item of manifest.jobs) {
    if (options.excludeChampions?.includes(item.champion)) continue;
    if (await access(path.join(out, "candidates", `${item.id}.json`)).then(() => true, () => false)) continue;
    const job = await readJson<Job>(path.join(out, "inputs", `${item.id}.json`));
    grouped.set(job.champion, [...(grouped.get(job.champion) ?? []), job]);
  }
  const kits = [...grouped.values()].slice(0, options.limit);
  let next = 0;
  let reportWrite = Promise.resolve();
  const results: Array<Awaited<ReturnType<typeof authorKit>>> = [];
  const workers = Array.from({ length: Math.min(options.concurrency, kits.length) }, async () => {
    while (next < kits.length) {
      const jobs = kits[next++];
      const started = Date.now();
      const result = await authorKit({ out, jobs, guide }).catch(error => ({ champion: jobs[0].champion, ids: jobs.map(job => job.id), ok: false, reason: String(error), attempts: 0 }));
      const measured = { ...result, seconds: Math.round((Date.now() - started) / 1000) };
      results.push(measured);
      const progress = `${JSON.stringify({ totalKits: kits.length, completedKits: results.length, results }, null, 2)}\n`;
      reportWrite = reportWrite.then(() => writeFile(path.join(out, "reports/author-progress.json"), progress));
      await reportWrite;
      console.log(JSON.stringify({ completed: results.length, total: kits.length, ...measured }));
    }
  });
  await Promise.all(workers);
  return { model: "gpt-6-luna", effort: "medium", concurrency: options.concurrency, kits: kits.length,
    successful: results.filter(result => result.ok).length, failed: results.filter(result => !result.ok) };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await runAuthor(path.resolve(process.argv[2] ?? "dev/research/champion-mechanics/26.19-v2"),
    { concurrency: Number(process.argv[3] ?? 12), limit: process.argv[4] && !process.argv[4].startsWith("--") ? Number(process.argv[4]) : undefined,
      excludeChampions: process.argv.find(arg => arg.startsWith("--exclude="))?.slice("--exclude=".length).split(",") });
  await writeFile(path.join(path.resolve(process.argv[2] ?? "dev/research/champion-mechanics/26.19-v2"), "reports/author-summary.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));
  process.exitCode = result.failed.length ? 1 : 0;
}
