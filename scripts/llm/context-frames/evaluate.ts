import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { execFileSync } from "node:child_process";
import { setImmediate } from "node:timers/promises";
import { answerDialogue } from "../../../src/lib/advisor/dialogueFlow";
import { CONTEXT_POLICIES, CONTEXT_LIMITS, type ContextPolicy } from "../../../src/lib/advisor/contextFrameTypes";
import { ADVISOR_MODEL } from "../../../src/lib/advisor/config";
import { buildBank, digest, readRows, ROOT } from "../quality/bank";
import { currentDataDirectory, fileHash, filesUnder } from "../quality/archive";
import { evaluationDeps, localFetch, qualityContext, restoreReply, type ModelRuntime } from "../quality/dialogue";
import { gradeTurn, observedAnswer, describe, routeCheck } from "../quality/checks";
import { openModel } from "../quality/model";
import type { QualityStory, QualityRow, QualityReport } from "../quality/types";
import { contextChecks } from "./checks";
import { learnedContextRanker, type ContextRankModel } from "../../../src/lib/advisor/contextRanker";
import { TURN_LIMIT, dehydrateTurn } from "../../../src/lib/advisor/history";
import { guardedResidual } from "./hybrid";

const { values } = parseArgs({ options: {
  policy: { type: "string", default: "all" }, mode: { type: "string", default: "offline" },
  bank: { type: "string", default: "context" }, split: { type: "string", default: "development" },
  out: { type: "string" }, resume: { type: "boolean", default: false },
  limit: { type: "string", default: "all" },
  configs: { type: "string" },
  "rank-model": { type: "string", default: "research/llm-evals/workflow/models/context-selector.json" },
  "rank-policy": { type: "string", default: "pure" },
} });
const policies: ContextPolicy[] = values.policy === "all" ? [...CONTEXT_POLICIES] : [values.policy as ContextPolicy];
if (policies.some(policy => !CONTEXT_POLICIES.includes(policy))) throw new Error("Unknown context policy");
if (!["none", "offline", "model"].includes(values.mode!)) throw new Error("Unknown backend");
if (!["context", "stress", "regression"].includes(values.bank!)) throw new Error("Unknown bank");
if (!["pure", "guarded-residual"].includes(values["rank-policy"]!)) throw new Error("Unknown rank policy");
if (!["development", "validation", "all"].includes(values.split!)) throw new Error("Unknown split");
const mode = values.mode as "none" | "offline" | "model";
const limits = values.limit === "all" ? [...CONTEXT_LIMITS] : [Number(values.limit)];
if (limits.some(limit => !CONTEXT_LIMITS.includes(limit as typeof CONTEXT_LIMITS[number]))) throw new Error("Unsupported context limit");
const configs = values.configs ? values.configs.split(",").map(value => {
  const [policy, cap] = value.split(":");
  const limit = policy === "legacy" ? CONTEXT_LIMITS[0] : Number(cap);
  if (!CONTEXT_POLICIES.includes(policy as ContextPolicy) || !CONTEXT_LIMITS.includes(limit as typeof CONTEXT_LIMITS[number])) throw new Error("Invalid config");
  return { policy: policy as ContextPolicy, limit };
}) : policies.flatMap(policy => (policy === "legacy" ? [limits[0]] : limits).map(limit => ({ policy, limit })));
const output = path.resolve(ROOT, values.out ?? `research/.cache/context-frames/20261007/${values.bank}-${values.split}-${mode}`);
fs.mkdirSync(output, { recursive: true });
const fixtures = "research/llm-evals/workflow/datasets/context-frames";
const benchmarks = ["request-scope", "retrieval", "item-alias", "numeric-qa", "retired-verifier-330"];
const bank = values.bank === "regression" ? buildBank().filter(story => !story.suites.some(suite => benchmarks.includes(suite)))
  : (values.split === "all" ? ["development", "validation"] : [values.split!])
    .flatMap(split => readRows(`${fixtures}/${values.bank === "stress" ? "stress-" : ""}${split}.jsonl`) as unknown as QualityStory[]);
const sources = [...filesUnder("src/lib/advisor"), ...filesUnder("src/lib/knowledge"), ...filesUnder("src/workers"),
  ...filesUnder("scripts/llm/quality"), ...filesUnder("scripts/llm/context-frames"), ...filesUnder("scripts/llm/lib"),
  ...filesUnder("src/data/contracts"), ...filesUnder("src/i18n"), "scripts/llm/kev-agent/lib.ts", "scripts/prepare-ort.ts", "package-lock.json"];
const modelFile = values["rank-model"]!;
const data = ["public/data/version.json", ...filesUnder(currentDataDirectory()).filter(file => file.endsWith(".json")), ...filesUnder("public/models/offline"),
  ...filesUnder("public/models/judge"), ...filesUnder("knowledge").filter(file => file.endsWith(".json"))];
if (fs.existsSync(path.join(ROOT, modelFile))) data.push(modelFile);
const hashes = {
  caseHash: digest(bank), sourceHash: digest(sources.map(file => [file, fileHash(file)])), dataHash: digest(data.map(file => [file, fileHash(file)])),
  scorerHash: digest(["scripts/llm/quality/checks.ts", "scripts/llm/conversational-advisor/score.ts", "scripts/llm/context-frames/checks.ts"].map(file => [file, fileHash(file)])),
  graphHash: fileHash(`public/${ADVISOR_MODEL.graph}`),
  selectorHash: digest({ model: fs.existsSync(path.resolve(ROOT, modelFile)) ? fileHash(modelFile) : null, policy: values["rank-policy"] }),
};
const rawRanker = configs.some(config => config.policy === "learned") ? learnedContextRanker(JSON.parse(fs.readFileSync(path.resolve(ROOT, modelFile), "utf8")) as ContextRankModel) : undefined;
const ranker = rawRanker && values["rank-policy"] === "guarded-residual" ? guardedResidual(rawRanker) : rawRanker;
fs.writeFileSync(path.join(output, "provenance.json"), JSON.stringify({ ...hashes, configs, mode, bank: values.bank, split: values.split,
  rankModel: modelFile, rankPolicy: values["rank-policy"],
  restoredHistoryLimit: values.bank === "stress" ? TURN_LIMIT : null,
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(),
  sources: sources.map(file => [file, fileHash(file)]), data: data.map(file => [file, fileHash(file)]) }, null, 2));
type ContextRow = QualityRow & { decision?: unknown; frames: number; frameBytes: number; contextBytes: number; historyBytes: number; plans: unknown[]; memory: unknown };
const abort = new AbortController();
let model: Awaited<ReturnType<typeof openModel>> | undefined;
const stop = () => { abort.abort(); void model?.close(); };
process.once("SIGINT", stop); process.once("SIGTERM", stop);
const restoreFetch = localFetch();

async function evaluate(policy: ContextPolicy, limit: number, runtime?: ModelRuntime) {
  const callsBefore = model ? (await model.calls()).length : 0;
  const name = policy === "legacy" ? policy : `${policy}-${limit}`;
  const target = path.join(output, `${name}.json`);
  const report: QualityReport = { schema: 1, profile: `context-${policy}`, ...hashes,
    created: new Date().toISOString(), rows: [], checks: [] };
  const rows = new Map<string, ContextRow>();
  if (values.resume && fs.existsSync(target)) {
    const previous = JSON.parse(fs.readFileSync(target, "utf8")) as QualityReport;
    if (Object.keys(hashes).some(key => previous[key as keyof QualityReport] !== hashes[key as keyof typeof hashes])) throw new Error("Resume inputs changed");
    for (const row of previous.rows) rows.set(row.id, row as ContextRow);
  }
  const save = () => { report.rows = [...rows.values()]; fs.writeFileSync(target, JSON.stringify(report)); };
  for (const story of bank) {
    if (story.turns.every((_, index) => rows.has(`${story.id}:${index}`))) continue;
    const ctx = qualityContext(story.lang, mode), deps = evaluationDeps(runtime, story.lang);
    if (ranker) deps.rankContexts = ranker;
    ctx.contextPolicy = policy;
    ctx.contextLimit = limit;
    if (story.memory) ctx.turns = [{ role: "assistant", memory: story.memory as unknown as NonNullable<typeof ctx.turns[number]["memory"]> }];
    for (const [turn, entry] of story.turns.entries()) {
      abort.signal.throwIfAborted();
      const start = performance.now(), result = await answerDialogue(entry.q, ctx, deps);
      const checks = [...gradeTurn({ story, turn, output: result, ctx }), ...contextChecks(result, entry.expected)];
      if (entry.expected.routeGold) checks.push(...routeCheck({ output: result, ctx, expected: entry.expected }));
      if (entry.expected.mine) {
        const first = result.dialogue.parts[0]?.plan;
        checks.push({ label: "route-mine", pass: first?.type === "matchup" && first.mine.id === entry.expected.mine });
      }
      const frames = result.reply.memory.contextFrames ?? [];
      rows.set(`${story.id}:${turn}`, { id: `${story.id}:${turn}`, suite: story.suites, mode, question: entry.q,
        pass: checks.length && !story.manual ? checks.every(check => check.pass) : null, checks,
        text: result.reply.text, observed: observedAnswer(result.reply.answer), seconds: (performance.now() - start) / 1000,
        preserve: entry.expected.sameAsBaseline === true, numeric: result.numericAttempt,
        decision: result.contextDecision, frames: frames.length, frameBytes: Buffer.byteLength(JSON.stringify(frames)),
        contextBytes: Buffer.byteLength(JSON.stringify({ frames, omitted: result.reply.memory.contextOmissions })),
        historyBytes: Buffer.byteLength(JSON.stringify(ctx.turns.map((entry, id) => dehydrateTurn({ ...entry, id, content: entry.content ?? "" })))),
        plans: result.dialogue.parts.map(part => describe(part.plan)), memory: result.reply.memory });
      restoreReply(ctx, entry.q, result.reply);
      if (values.bank === "stress") ctx.turns = ctx.turns.slice(-TURN_LIMIT);
      if (model?.errors.length) throw new Error("Actual model worker failed");
      if (rows.size % 25 === 0) { save(); console.log(`${policy}: ${rows.size} turns saved`); await setImmediate(); }
    }
  }
  report.checks = [
    { name: "complete-coverage", pass: rows.size === bank.reduce((sum, story) => sum + story.turns.length, 0), log: target },
    { name: "source-unchanged", pass: hashes.sourceHash === digest(sources.map(file => [file, fileHash(file)])), log: "provenance.json" },
    { name: "data-unchanged", pass: hashes.dataHash === digest(data.map(file => [file, fileHash(file)])), log: "provenance.json" },
    { name: "graph-unchanged", pass: hashes.graphHash === fileHash(`public/${ADVISOR_MODEL.graph}`), log: "provenance.json" },
    { name: "worker-no-fallback", pass: !model?.errors.length, log: "worker-errors.json" },
  ];
  save();
  const entries = [...rows.values()];
  const times = entries.map(row => row.seconds).sort((a, b) => a - b);
  const summary = { policy, limit: policy === "legacy" ? null : limit, mode, total: entries.length, pass: entries.filter(row => row.pass === true).length,
    fail: entries.filter(row => row.pass === false).length, manual: entries.filter(row => row.pass === null).length,
    maxFrames: Math.max(0, ...entries.map(row => row.frames)), maxFrameBytes: Math.max(0, ...entries.map(row => row.frameBytes)),
    maxContextBytes: Math.max(0, ...entries.map(row => row.contextBytes)),
    maxHistoryBytes: Math.max(0, ...entries.map(row => row.historyBytes)),
    p50Seconds: times[Math.floor(times.length * .5)], p95Seconds: times[Math.floor(times.length * .95)],
    clarifications: entries.filter(row => (row.decision as { action?: string })?.action === "clarify").length,
    complete: report.checks.every(check => check.pass) };
  console.log(JSON.stringify(summary));
  if (model) fs.writeFileSync(path.join(output, `worker-calls-${name}.json`), JSON.stringify((await model.calls()).slice(callsBefore)));
  fs.writeFileSync(path.join(output, `${name}-summary.json`), JSON.stringify(summary, null, 2));
  if (!summary.complete) throw new Error("Evaluation inputs changed or coverage incomplete");
}

try {
  if (mode === "model") {
    model = await openModel({ headless: true, cacheDirectory: path.join(ROOT, "research/.cache/context-frames/20261007/runtime"),
      signal: abort.signal, onCloseReady: close => { abort.signal.addEventListener("abort", () => { void close(); }, { once: true }); } });
  }
  for (const { policy, limit } of configs) await evaluate(policy, limit, model?.runtime);
  if (model) fs.writeFileSync(path.join(output, "worker-calls.json"), JSON.stringify(await model.calls()));
} finally {
  if (model) { fs.writeFileSync(path.join(output, "worker-errors.json"), JSON.stringify(model.errors)); await model.close(); }
  restoreFetch(); process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop);
}
