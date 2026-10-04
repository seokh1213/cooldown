/** Parallel, read-only semantic review. Artifacts require serial primary integration. */
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";
import { runCodexTranslation } from "./lib/matchup-translation-runtime";
import { buildSemanticReviewPrompt, parseSemanticReviewResult } from "./lib/parallel-semantic-review";
import { fingerprint, reviewKey } from "./lib/translation-review-queue";
import type { ReviewDecision, ReviewSection } from "./lib/translation-review-queue";

export type ManifestSection = ReviewSection & { sourceSha256: string; candidateSha256: string };
export interface ReviewJob { id: string; sections: ManifestSection[] }
interface Manifest { generatedAt: string; sections: ManifestSection[]; runDirectory?: string; patch?: string }
interface Settings {
  input: string; outputDir: string; concurrency: number; batch: number;
  deadline: number; model: string; runLog?: string;
}
interface Artifact {
  jobId: string; status: "completed" | "failed" | "deadline";
  model: string; reasoningEffort: "medium"; directModelComparison: boolean;
  sourceFingerprintValidated: boolean; completionAt: string; seconds: number;
  decisions: ReviewDecision[]; reason?: string;
}
interface ReviewDependencies {
  validate: (sections: ManifestSection[]) => void;
  glossary: (sections: ManifestSection[]) => string;
  call: (prompt: string, job: ReviewJob) => Promise<string>;
  now: () => number;
}

export function prepareJobs(manifest: Manifest, batchSize: number): ReviewJob[] {
  if (!Number.isInteger(batchSize) || batchSize < 128 || batchSize > 512) throw new Error("Invalid batch size");
  if (!manifest.generatedAt || !Array.isArray(manifest.sections)) throw new Error("Invalid manifest");
  const keys = new Set<string>();
  for (const section of manifest.sections) {
    if (![section.ko, section.text, section.me, section.enemy, section.slot].every((value) => typeof value === "string" && value.length > 0)) throw new Error("Invalid section");
    if (!/^[A-Za-z]+$/.test(section.me) || !/^[A-Za-z]+$/.test(section.enemy) || !["en_US", "zh_CN"].includes(section.lang)) throw new Error("Invalid section identity");
    if (fingerprint(section.ko) !== section.sourceSha256 || fingerprint(section.text) !== section.candidateSha256) throw new Error("Manifest fingerprint mismatch");
    const key = reviewKey(section);
    if (keys.has(key)) throw new Error("Duplicate section");
    keys.add(key);
  }
  const sections = [...manifest.sections].sort((left, right) =>
    [left.me, left.enemy, left.slot, left.lang].join("/").localeCompare([right.me, right.enemy, right.slot, right.lang].join("/")));
  const jobs: ReviewJob[] = [];
  for (let offset = 0; offset < sections.length; offset += batchSize) {
    jobs.push({ id: `batch-${String(jobs.length).padStart(5, "0")}`, sections: sections.slice(offset, offset + batchSize) });
  }
  return jobs;
}

export async function workPool<T>(jobs: T[], options: { concurrency: number; deadline: number; now: () => number }, work: (job: T) => Promise<void>): Promise<T[]> {
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 24) throw new Error("Invalid concurrency");
  let next = 0;
  async function worker(): Promise<void> {
    while (next < jobs.length && options.now() < options.deadline) {
      const job = jobs[next++];
      await work(job);
    }
  }
  await Promise.all(Array.from({ length: Math.min(options.concurrency, jobs.length) }, () => worker()));
  return jobs.slice(next);
}

export async function reviewBatch(job: ReviewJob, options: { model: string; deadline: number }, dependencies: ReviewDependencies): Promise<Artifact> {
  const start = dependencies.now();
  const artifact: Artifact = {
    jobId: job.id, status: "failed", model: options.model, reasoningEffort: "medium",
    directModelComparison: false, sourceFingerprintValidated: false,
    completionAt: "", seconds: 0, decisions: [],
  };
  let stage = "source_fingerprint_mismatch";
  try {
    dependencies.validate(job.sections);
    stage = "official_glossary_unavailable";
    const prompt = buildSemanticReviewPrompt(job.sections, dependencies.glossary(job.sections));
    if (dependencies.now() >= options.deadline) {
      artifact.status = "deadline";
      artifact.reason = "call_start_deadline_reached";
    } else {
      stage = "model_call_failed";
      const raw = await dependencies.call(prompt, job);
      artifact.directModelComparison = true;
      stage = "source_changed_during_review";
      dependencies.validate(job.sections);
      artifact.sourceFingerprintValidated = true;
      stage = "invalid_model_decisions";
      artifact.decisions = parseSemanticReviewResult(raw, job.sections).map((decision) => ({ ...decision, needsPrimaryReview: true }));
      artifact.status = "completed";
    }
  } catch {
    artifact.reason = stage;
    artifact.decisions = [];
  }
  artifact.completionAt = new Date(dependencies.now()).toISOString();
  artifact.seconds = Math.max(0, (dependencies.now() - start) / 1000);
  return artifact;
}

type Store = { pairs: Record<string, Record<string, { basis: string; text: string }>> };
function readJson<T>(file: string): T { return JSON.parse(fs.readFileSync(file, "utf8")) as T; }
function readStore(file: string): Store { return fs.existsSync(file) ? readJson<Store>(file) : { pairs: {} }; }

export function validateLiveSections(sections: ManifestSection[], locations: { sourceDir: string; candidateDir: string; trustedDir: string }): void {
  const sources = new Map<string, { pairs: Record<string, Record<string, string>> }>();
  const stores = new Map<string, Store>();
  const store = (file: string): Store => {
    if (!stores.has(file)) stores.set(file, readStore(file));
    return stores.get(file)!;
  };
  for (const section of sections) {
    const sourceFile = path.join(locations.sourceDir, `${section.me}.json`);
    if (!sources.has(sourceFile)) sources.set(sourceFile, readJson(sourceFile));
    const ko = sources.get(sourceFile)!.pairs[section.enemy]?.[section.slot];
    let candidate = store(path.join(locations.candidateDir, section.lang, `${section.me}.json`)).pairs[section.enemy]?.[section.slot];
    if (candidate?.basis !== ko) candidate = store(path.join(locations.trustedDir, section.lang, `${section.me}.json`)).pairs[section.enemy]?.[section.slot];
    if (typeof ko !== "string" || candidate?.basis !== ko || fingerprint(ko) !== section.sourceSha256 || fingerprint(candidate.text) !== section.candidateSha256) throw new Error("Live fingerprint mismatch");
  }
}

interface GlossaryAbility { name: string; summary?: string; bodyHtml?: string }
interface GlossaryCard { name: string; title?: string; abilities: Record<string, GlossaryAbility> }

function referenceText(html: string | undefined): string {
  const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  const plain = (html ?? "").replace(/<[^>]*>/g, " ")
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, entity: string) => entities[entity])
    .replace(/\s+/g, " ").trim();
  return [...plain].slice(0, 800).join("");
}

function glossaryCard(key: string, card: GlossaryCard): string {
  const names = Object.entries(card.abilities).map(([slot, ability]) => `${slot}: ${ability.name}`).join("; ");
  const summaries = Object.entries(card.abilities).map(([slot, ability]) => {
    const summary = referenceText(ability.summary);
    return summary ? `${slot} summary: ${summary}` : "";
  }).filter(Boolean);
  const passive = card.abilities.P;
  if (key === "zh_CN/Kayn" && !referenceText(passive?.summary).includes("影流刺客")) {
    const forms = [...new Set((passive?.bodyHtml ?? "").match(/影流刺客|暗裔杀手/g) ?? [])];
    if (forms.length) summaries.push(`P local form names: ${forms.join(" / ")}`);
  }
  return [`${key}: ${card.name}; ${names}`, `title: ${referenceText(card.title)}`, ...summaries].join("\n");
}

export function officialGlossary(championDir: string): (sections: ManifestSection[]) => string {
  const cache = new Map<string, string>();
  return (sections) => {
    const keys = new Set(sections.flatMap((section) => [section.me, section.enemy].map((champion) => `${section.lang}/${champion}`)));
    return [...keys].map((key) => {
      if (!cache.has(key)) {
        const card = readJson<{ champion: GlossaryCard }>(path.join(championDir, `${key}.json`)).champion;
        cache.set(key, glossaryCard(key, card));
      }
      return cache.get(key)!;
    }).join("\n") + "\nHwei en_US QQ Devastating Fire; EQ Grim Visage; EE Crushing Maw. Hwei zh_CN QQ 没骨火; EQ 阴沉变意; EE 双钩血喉. AurelionSol zh_CN R 星落 / 天瀑.";
  };
}

function atomicJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "w" });
  fs.renameSync(temporary, file);
}

export function parseArguments(args: string[]): Settings {
  const values = new Map<string, string>();
  const allowed = new Set(["input", "output-dir", "concurrency", "batch", "deadline", "model", "run-log"]);
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index]?.replace(/^--/, "");
    if (!args[index]?.startsWith("--") || !allowed.has(name) || !args[index + 1] || values.has(name)) throw new Error("Invalid arguments");
    values.set(name, args[index + 1]);
  }
  const input = values.get("input"), output = values.get("output-dir"), deadlineText = values.get("deadline");
  if (!input || !output || !deadlineText || !/Z$/.test(deadlineText)) throw new Error("Required input, output-dir and UTC deadline");
  const concurrency = Number(values.get("concurrency") ?? 8), batch = Number(values.get("batch") ?? 256);
  const deadline = Date.parse(deadlineText), model = values.get("model") ?? "gpt-6.1-sol";
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 24 || !Number.isInteger(batch) || batch < 128 || batch > 512 || !Number.isFinite(deadline) || model !== "gpt-6.1-sol") throw new Error("Invalid runner settings");
  return { input: path.resolve(input), outputDir: path.resolve(output), concurrency, batch, deadline, model, runLog: values.get("run-log") };
}

function findRunDirectory(input: string): string {
  let directory = path.dirname(input);
  while (directory !== path.dirname(directory)) {
    if (fs.existsSync(path.join(directory, "candidates"))) return directory;
    directory = path.dirname(directory);
  }
  throw new Error("Run directory unavailable");
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const settings = parseArguments(args);
  const manifest = readJson<Manifest>(settings.input);
  const jobs = prepareJobs(manifest, settings.batch);
  const runDirectory = manifest.runDirectory ? path.resolve(manifest.runDirectory) : findRunDirectory(settings.input);
  const patch = manifest.patch ?? resolvePatchVersion();
  if (!/^\d+\.\d+$/.test(patch)) throw new Error("Invalid patch");
  const relativeOutput = path.relative(runDirectory, settings.outputDir);
  if (!relativeOutput || relativeOutput.startsWith("..") || path.isAbsolute(relativeOutput) || /^(candidates|seed|worker\.lock)(?:[\\/]|$)/.test(relativeOutput)) throw new Error("Output must be a dedicated run artifact directory");
  if (settings.runLog && (path.dirname(path.resolve(settings.runLog)) !== settings.outputDir || !/\.jsonl$/.test(settings.runLog))) throw new Error("Run log must be a JSONL file inside output-dir");
  const locations = { sourceDir: path.join(PUBLIC_DATA_ROOT, patch, "llm", "matchups"), candidateDir: path.join(runDirectory, "candidates"), trustedDir: path.join("knowledge", "matchup-translations") };
  const glossary = officialGlossary(path.join(PUBLIC_DATA_ROOT, patch, "champions"));
  const startedAt = Date.now();
  const counts = { completed: 0, failed: 0, deadline: 0, approved: 0, approved_with_edit: 0, held: 0, reviewedSections: 0, failedSections: 0 };
  const processing = new Set<string>();
  let jobSeconds = 0;
  const progress = (): void => atomicJson(path.join(settings.outputDir, "progress.json"), {
    generatedAt: manifest.generatedAt, updatedAt: new Date().toISOString(), model: settings.model,
    reasoningEffort: "medium", totalJobs: jobs.length, totalSections: manifest.sections.length,
    ...counts, processing: [...processing], elapsedSeconds: (Date.now() - startedAt) / 1000,
    aggregateJobSeconds: jobSeconds,
  });
  // Refuse to replace any earlier artifacts, including results from a partial run.
  if (fs.existsSync(path.join(settings.outputDir, "progress.json")) || jobs.some((job) => fs.existsSync(path.join(settings.outputDir, `${job.id}.json`)))) throw new Error("Output directory already contains review artifacts");
  progress();
  const deferred = await workPool(jobs, { concurrency: settings.concurrency, deadline: settings.deadline, now: Date.now }, async (job) => {
    processing.add(job.id);
    progress();
    const artifact = await reviewBatch(job, settings, {
      validate: (sections) => validateLiveSections(sections, locations), glossary, now: Date.now,
      call: (prompt, current) => runCodexTranslation(prompt, { model: settings.model, stage: "parallel-semantic-review", lang: "mixed", id: current.id, logPath: settings.runLog }),
    });
    atomicJson(path.join(settings.outputDir, `${job.id}.json`), { batchGeneratedAt: manifest.generatedAt, reviewer: `cli-sol-${job.id}`, sections: job.sections, ...artifact });
    counts[artifact.status] += 1;
    if (artifact.status === "completed") {
      counts.reviewedSections += job.sections.length;
      for (const decision of artifact.decisions) counts[decision.status] += 1;
    } else counts.failedSections += job.sections.length;
    jobSeconds += artifact.seconds;
    processing.delete(job.id);
    progress();
  });
  for (const job of deferred) {
    atomicJson(path.join(settings.outputDir, `${job.id}.json`), { batchGeneratedAt: manifest.generatedAt, jobId: job.id, status: "deadline", model: settings.model, reasoningEffort: "medium", directModelComparison: false, sourceFingerprintValidated: false, completionAt: new Date().toISOString(), seconds: 0, decisions: [], reason: "call_start_deadline_reached" });
    counts.deadline += 1;
    counts.failedSections += job.sections.length;
  }
  progress();
  console.log(JSON.stringify(counts));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(() => {
    console.error("Parallel semantic review runner failed; inspect saved artifacts.");
    process.exitCode = 1;
  });
}
