import fs from "node:fs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { ADVISOR_MODEL } from "../../../src/lib/advisor/config";
import { DEFAULT_CONTEXT_LIMIT, DEFAULT_CONTEXT_POLICY } from "../../../src/lib/advisor/contextFrameTypes";
import { CONTEXT_APPROVAL_FILE, EXPANDED_CONTEXT_APPROVAL_FILE, STRESS_APPROVAL_FILE } from "../context-frames/approval";
import { audit } from "./audit";
import { ROOT, WORKFLOW, buildBank, digest, readRows } from "./bank";
import { currentDataDirectory, fileHash, filesUnder } from "./archive";
import { localFetch, evaluationDeps, runDialogue } from "./dialogue";
import { runBenchmarks, splitAudit, benchmarkModes } from "./benchmarks";
import { openModel } from "./model";
import { compareReports, verifyReview, reviewPacket, saveReport } from "./report";
import { comparePipelineReports, type DataProvenance } from "./pipelineComparison";
import type { QualityStory, QualityRow, QualityReport } from "./types";

const { values } = parseArgs({ options: {
  profile: { type: "string", default: "regression" }, out: { type: "string" }, baseline: { type: "string" }, review: { type: "string" },
  graph: { type: "string" }, suite: { type: "string" }, resume: { type: "boolean", default: false },
  "pipeline-baseline": { type: "string" },
  headless: { type: "boolean", default: false }, "base-weights": { type: "boolean", default: false },
} });
const profile = values.profile!;
if (values.baseline && values["pipeline-baseline"]) throw new Error("Choose baseline or pipeline-baseline");
if (!["regression", "model", "quality", "infrastructure", "ui"].includes(profile)) throw new Error("Profiles: regression, model, quality, infrastructure, ui");
const output = path.resolve(ROOT, values.out ?? `research/.cache/quality/${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}`);
fs.mkdirSync(path.join(output, "logs"), { recursive: true });
const inventory = audit();
let bank = buildBank();
if (profile === "quality") bank.push(...readRows(`${WORKFLOW}/datasets/review/archive.jsonl`) as unknown as QualityStory[]);
if (values.suite) bank = bank.filter(story => story.suites.some(suite => values.suite!.split(",").includes(suite)));
if (!bank.length) throw new Error("No test cases selected");
const sourceFiles = [...filesUnder("src/lib/advisor"), ...filesUnder("src/workers"), ...filesUnder("scripts/llm/quality"),
  ...filesUnder("scripts/llm/conversational-advisor"), ...filesUnder("src/hooks").filter(file => /Advisor/.test(file)),
  ...filesUnder("src/components/features/advisor"), ...filesUnder("scripts/llm/kev-agent"), ...filesUnder("src/lib/knowledge")];
const dataFiles = [...filesUnder(currentDataDirectory()).filter(file => file.endsWith(".json")), ...filesUnder("public/models/offline"), ...filesUnder("public/models/judge"),
  ...filesUnder("public/models/kev/b3e").filter(file => !file.endsWith(".onnx")), ...filesUnder("knowledge").filter(file => file.endsWith(".json")),
  ...filesUnder("docs").filter(file => /lol-fundamentals\.md$/.test(file))];
const report: QualityReport = { schema: 1, profile, caseHash: digest(bank), sourceHash: digest(sourceFiles.map(file => [file, fileHash(file)])),
  scorerHash: digest(["scripts/llm/quality/checks.ts", "scripts/llm/quality/benchmarks.ts", "scripts/llm/quality/numeric.ts", "scripts/llm/conversational-advisor/score.ts", "scripts/llm/mechanic-schema/cases.ts"].map(file => [file, fileHash(file)])),
  dataHash: digest(dataFiles.map(file => [file, fileHash(file)])), created: new Date().toISOString(), rows: [], checks: [] };
if (profile === "model" || profile === "quality") {
  report.graphHash = fileHash(values.graph ?? `public/${ADVISOR_MODEL.graph}`);
  report.numericPurpose = values["base-weights"] ? "base" : "qa";
}
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
fs.writeFileSync(path.join(output, "provenance.json"), JSON.stringify({ sourceCommit, dirty: true, inventoryBankHash: inventory.bankHash,
  sourceFiles: sourceFiles.map(file => [file, fileHash(file)]), dataFiles: dataFiles.map(file => [file, fileHash(file)]),
  numericPurpose: values["base-weights"] ? "grounded-summary (QA disabled)" : "grounded-numeric" }, null, 2));
const restoredFetch = localFetch();
const interrupted = new AbortController();
let closeModel: (() => Promise<void>) | undefined;
const stop = () => { interrupted.abort(); void closeModel?.(); };
process.once("SIGINT", stop); process.once("SIGTERM", stop);
const rows = new Map<string, QualityRow>();
if (values.resume && fs.existsSync(path.join(output, "results.json"))) {
  const previous = JSON.parse(fs.readFileSync(path.join(output, "results.json"), "utf8")) as QualityReport;
  if (["caseHash", "sourceHash", "dataHash", "graphHash", "numericPurpose"].some(key => previous[key as keyof QualityReport] !== report[key as keyof QualityReport])) throw new Error("Resume inputs changed");
  for (const row of previous.rows) rows.set(`${row.mode}:${row.id}`, row);
}
const record = (row: QualityRow) => {
  interrupted.signal.throwIfAborted();
  rows.set(`${row.mode}:${row.id}`, row); report.rows = [...rows.values()];
  if (rows.size % 25 === 0) { saveReport(output, report); console.log(`${rows.size} measurements saved`); }
};
async function check(name: string, command: string, args: string[]) {
  const log = `logs/${name}.log`, stream = fs.createWriteStream(path.join(output, log));
  const child = spawn(command, args, { cwd: ROOT, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.pipe(stream); child.stderr.pipe(stream);
  const pass = await new Promise<boolean>((resolve, reject) => { child.on("error", reject); child.on("close", code => resolve(code === 0)); });
  await new Promise<void>(resolve => stream.end(resolve));
  report.checks.push({ name, pass, log }); saveReport(output, report);
  console.log(`${name}: ${pass ? "PASS" : "FAIL"}`);
}
const isBench = (story: QualityStory) => ["request-scope", "retrieval", "item-alias", "numeric-qa", "retired-verifier-330"].some(suite => story.suites.includes(suite));
const pendingStories = (mode: string) => bank.filter(story => !isBench(story) && !story.turns.every((_, turn) => rows.has(`${mode}:${story.id}:${turn}`)));

try {
  const splitErrors = splitAudit(bank);
  report.checks.push({ name: "split-separation", pass: !splitErrors.length, log: "logs/splits.json" });
  fs.writeFileSync(path.join(output, "logs/splits.json"), JSON.stringify(splitErrors));
  if (profile !== "model") {
    const tests = [...filesUnder("tests/unit"), ...filesUnder("tests/data")].filter(file => /(?:advisor|context-frames|request|generation|lora|retrieval|evaluation|sft|llm-script|quality|knowledge|mechanic|claim|passive|stat-ranking|rule).*\.test\.ts$/.test(path.basename(file)));
    await check("node-regression", process.execPath, ["--import", "tsx", "--test", ...tests]);
    await check("types", "npx", ["tsc", "-p", "tsconfig.scripts.json", "--pretty", "false"]);
    await check("mechanics-answer", "npx", ["tsx", "scripts/llm/champion-mechanics/evaluate.ts", path.join(output, "mechanics-answer.json"), "--check"]);
    const contexts = path.join(output, "context-frames");
    await check("context-window", "npx", ["tsx", "scripts/llm/context-frames/evaluate.ts", "--split", "all", "--configs", `legacy,${DEFAULT_CONTEXT_POLICY}:${DEFAULT_CONTEXT_LIMIT}`, "--out", contexts]);
    await check("context-comparison", "npx", ["tsx", "scripts/llm/context-frames/compare.ts", "--directory", contexts, "--require", `${DEFAULT_CONTEXT_POLICY}-${DEFAULT_CONTEXT_LIMIT}`, "--approved", CONTEXT_APPROVAL_FILE]);
    const contextReport = path.join(contexts, `${DEFAULT_CONTEXT_POLICY}-${DEFAULT_CONTEXT_LIMIT}.json`);
    await check("context-expanded-successes", "npx", ["tsx", "scripts/llm/context-frames/verify.ts", "--report", contextReport, "--approved", EXPANDED_CONTEXT_APPROVAL_FILE]);
    const stress = path.join(output, "context-stress");
    await check("context-stress", "npx", ["tsx", "scripts/llm/context-frames/evaluate.ts", "--bank", "stress", "--split", "all", "--configs", `${DEFAULT_CONTEXT_POLICY}:${DEFAULT_CONTEXT_LIMIT}`, "--out", stress]);
    await check("context-stress-successes", "npx", ["tsx", "scripts/llm/context-frames/verify.ts", "--report", path.join(stress, `${DEFAULT_CONTEXT_POLICY}-${DEFAULT_CONTEXT_LIMIT}.json`), "--approved", STRESS_APPROVAL_FILE]);
  }
  if (profile === "infrastructure" || profile === "quality") {
    await check("generation-recovery", "python3", ["-m", "unittest", "discover", "-s", "scripts/llm/quality", "-p", "test_*.py"]);
    await check("tuning-infrastructure", "uv", ["run", "--python", "3.13", "--with", "numpy", "--with", "onnx", "--with", "onnxruntime", "--with", "torch", "--with", "transformers", "--with", "peft",
      "python", "-m", "unittest", "discover", "-s", "scripts/llm/tuning", "-p", "test_*.py"]);
    await check("remote-infrastructure", "python3", ["-m", "unittest", "discover", "-s", "scripts/llm/remote-evals", "-p", "test_*.py"]);
  }
  if (profile === "ui") {
    await check("ui-build", "npx", ["vite", "build", "--mode", "local-preview"]);
    await check("advisor-ui", "npx", ["playwright", "test", "--config", "scripts/llm/quality/playwright.config.ts", "e2e/advisor-", "--workers", "2", "--output", path.join(output, "e2e-results")]);
  }
  if (profile === "regression" || profile === "quality") {
    for (const mode of ["none", "offline"] as const) await runDialogue({ stories: pendingStories(mode), mode, deps: evaluationDeps(), record });
    await runBenchmarks({ stories: bank.filter(isBench), record });
  }
  if (profile === "model" || profile === "quality") {
    const model = await openModel({ graph: values.graph, headless: values.headless, cacheDirectory: path.join(ROOT, "research/.cache/quality"),
      signal: interrupted.signal, onCloseReady: close => { closeModel = close; } });
    closeModel = model.close;
    try {
      const runtime = values["base-weights"] ? { ...model.runtime, generate: (system: string, prompt: string, max: number, purpose?: "grounded-summary" | "grounded-numeric") =>
        model.runtime.generate(system, prompt, max, purpose === "grounded-numeric" ? "grounded-summary" : purpose) } : model.runtime;
      const modelRecord = (row: QualityRow) => {
        if (model.errors.length) throw new Error("Actual model worker failed; see logs/worker-errors.json");
        record(row);
      };
      await runDialogue({ stories: pendingStories("model"), mode: "model", deps: lang => evaluationDeps(runtime, lang), record: modelRecord });
      await runBenchmarks({ stories: bank.filter(story => isBench(story) && !benchmarkModes(story, true).every(mode => rows.has(`${mode}:${story.id}:0`))), runtime, record: modelRecord });
      fs.writeFileSync(path.join(output, "worker-calls.json"), JSON.stringify(await model.calls(), null, 2));
      report.checks.push({ name: "real-worker-no-fallback", pass: !model.errors.length, log: "logs/worker-errors.json" });
      fs.writeFileSync(path.join(output, "logs/worker-errors.json"), JSON.stringify(model.errors));
    } finally { fs.writeFileSync(path.join(output, "logs/worker-errors.json"), JSON.stringify(model.errors)); await model.close(); closeModel = undefined; }
  }
  let comparison;
  report.checks.push({ name: "source-unchanged", pass: report.sourceHash === digest(sourceFiles.map(file => [file, fileHash(file)])), log: "provenance.json" });
  report.checks.push({ name: "data-unchanged", pass: report.dataHash === digest(dataFiles.map(file => [file, fileHash(file)])), log: "provenance.json" });
  if (report.graphHash) report.checks.push({ name: "graph-unchanged", pass: report.graphHash === fileHash(values.graph ?? `public/${ADVISOR_MODEL.graph}`), log: "provenance.json" });
  const modes = profile === "regression" ? ["none", "offline"] : profile === "model" ? ["model"] : profile === "quality" ? ["none", "offline", "model"] : [];
  const expectedKeys = modes.flatMap(mode => bank.filter(story => !isBench(story)).flatMap(story => story.turns.map((_, turn) => `${mode}:${story.id}:${turn}`)))
    .concat(modes.filter(mode => mode !== "none").flatMap(mode => bank.filter(isBench).flatMap(story => benchmarkModes(story, mode === "model").map(name => `${name}:${story.id}:0`))));
  const missingKeys = expectedKeys.filter(key => !rows.has(key));
  report.checks.push({ name: "complete-coverage", pass: !missingKeys.length && rows.size === new Set(expectedKeys).size, log: "logs/coverage.json" });
  fs.writeFileSync(path.join(output, "logs/coverage.json"), JSON.stringify({ expected: expectedKeys.length, measured: rows.size, missingKeys }));
  if (values.baseline) comparison = compareReports(report, JSON.parse(fs.readFileSync(path.resolve(ROOT, values.baseline), "utf8")) as QualityReport);
  if (values["pipeline-baseline"]) {
    const baselineFile = path.resolve(ROOT, values["pipeline-baseline"]);
    comparison = comparePipelineReports(report, JSON.parse(fs.readFileSync(baselineFile, "utf8")) as QualityReport, {
      current: JSON.parse(fs.readFileSync(path.join(output, "provenance.json"), "utf8")) as DataProvenance,
      baseline: JSON.parse(fs.readFileSync(path.join(path.dirname(baselineFile), "provenance.json"), "utf8")) as DataProvenance,
    });
    fs.writeFileSync(path.join(output, "comparison.json"), JSON.stringify(comparison, null, 2) + "\n");
  }
  const reviewErrors = values.review ? verifyReview(report, JSON.parse(fs.readFileSync(path.resolve(ROOT, values.review), "utf8")) as ReturnType<typeof reviewPacket>)
    : reviewPacket(report).rows.length ? ["Semantic review pending; see review-packet.json"] : [];
  const summary = saveReport(output, report, comparison, reviewErrors);
  console.log(JSON.stringify({ ...summary, output: path.relative(ROOT, output) }));
  if (!summary.infrastructurePassed || summary.unsafeNumeric || comparison?.regressions.length || values.review && reviewErrors.length) process.exitCode = 1;
} catch (error) {
  report.checks.push({ name: "runner-completion", pass: false, log: "logs/runner-error.txt" });
  fs.writeFileSync(path.join(output, "logs/runner-error.txt"), String(error));
  saveReport(output, report);
  throw error;
} finally { restoredFetch(); process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop); }
