import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { audit } from "./audit";
import { buildBank, digest, ROOT } from "./bank";
import { fileHash, filesUnder } from "./archive";
import { numericChecks, numericGold, numericRequest } from "./numeric";
import { generationTasks, validateArtifact, type GenerationArtifact } from "./tasks";
import { compareReports, saveReport, reviewPacket } from "./report";
import { openOllama } from "./ollama";
import type { QualityReport } from "./types";

const { values } = parseArgs({ options: { backend: { type: "string", default: "ollama" }, model: { type: "string", default: "qwen3.5:0.8b" },
  out: { type: "string" }, export: { type: "string" }, import: { type: "string" }, baseline: { type: "string" },
  limit: { type: "string" }, resume: { type: "boolean", default: false } } });
audit();
let stories = buildBank().filter(story => story.suites.includes("numeric-qa") && !numericGold(story).conflictingSource);
if (values.limit) {
  const limit = Number(values.limit);
  if (!Number.isInteger(limit) || limit < 1) throw new Error("Limit must be a positive integer");
  stories = stories.slice(0, limit);
}
const packet = generationTasks(stories);
if (values.export) {
  const target = path.resolve(ROOT, values.export);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(packet, null, 2));
  console.log(`Exported ${packet.tasks.length} tasks without reference answers`);
} else {
  if (!values.import && values.backend !== "ollama") throw new Error("Use Ollama, or import a Colab generation artifact");
  const output = path.resolve(ROOT, values.out ?? "dev/research/.cache/quality/generation");
  fs.mkdirSync(output, { recursive: true });
  const controller = new AbortController(), stop = () => controller.abort();
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  let provider: Awaited<ReturnType<typeof openOllama>> | undefined;
  let report: QualityReport | undefined;
  try {
    let artifact: GenerationArtifact;
    if (values.import) artifact = JSON.parse(fs.readFileSync(path.resolve(ROOT, values.import), "utf8"));
    else {
      provider = await openOllama(values.model!, controller.signal);
      artifact = { schema: 1, taskHash: packet.taskHash, model: { backend: "ollama", name: values.model!, revision: provider.revision }, rows: [] };
      const partial = path.join(output, "generation-artifact.json");
      if (values.resume && fs.existsSync(partial)) {
        const previous: GenerationArtifact = JSON.parse(fs.readFileSync(partial, "utf8"));
        if (previous.taskHash !== packet.taskHash || digest(previous.model) !== digest(artifact.model)) throw new Error("Resume tasks or model changed");
        if (new Set(previous.rows.map(row => row.id)).size !== previous.rows.length || previous.rows.some(row => !packet.tasks.some(task => task.id === row.id))) throw new Error("Invalid partial artifact");
        artifact.rows = previous.rows;
      }
      for (const task of packet.tasks.filter(task => !artifact.rows.some(row => row.id === task.id))) {
        const started = performance.now();
        const text = await provider.generate(task.system, task.prompt, task.maxTokens);
        artifact.rows.push({ id: task.id, text, seconds: (performance.now() - started) / 1000 });
        const temporary = `${partial}.pending`;
        fs.writeFileSync(temporary, JSON.stringify(artifact, null, 2)); fs.renameSync(temporary, partial);
        if (artifact.rows.length % 25 === 0) console.log(`${artifact.rows.length} generations saved`);
      }
    }
    validateArtifact(packet, artifact);
    report = { schema: 1, profile: "generation", backend: artifact.model.backend, model: artifact.model.name,
      graphHash: digest(artifact.model), caseHash: digest(stories), dataHash: packet.taskHash,
      sourceHash: digest(filesUnder("dev/scripts/advisor/quality").map(file => [file, fileHash(file)])),
      scorerHash: fileHash("dev/scripts/advisor/quality/numeric.ts"), created: new Date().toISOString(), checks: [{ name: "complete-task-coverage", pass: true, log: "generation-artifact.json" }], rows: [] };
    for (const [index, story] of stories.entries()) {
      const row = artifact.rows.find(row => row.id === packet.tasks[index].id)!;
      const checks = numericChecks(row.text, numericGold(story));
      report.rows.push({ id: row.id, suite: story.suites, mode: "frozen-numeric", question: story.turns[0].q,
        text: row.text.trim(), seconds: row.seconds, checks, pass: checks.every(check => check.pass), evidence: numericRequest(story.turns[0].q, numericGold(story).context).evidence });
    }
    fs.writeFileSync(path.join(output, "generation-artifact.json"), JSON.stringify(artifact, null, 2));
    const comparison = values.baseline ? compareReports(report, JSON.parse(fs.readFileSync(path.resolve(ROOT, values.baseline), "utf8"))) : undefined;
    const reviewErrors = reviewPacket(report).rows.length ? ["Review failed contracts in review-packet.json"] : [];
    const summary = saveReport(output, report, comparison, reviewErrors);
    console.log(JSON.stringify({ model: report.model, backend: report.backend, correct: report.rows.filter(row => row.pass).length, total: report.rows.length, promotion: summary.promotion }));
    if (comparison?.regressions.length) process.exitCode = 1;
  } finally {
    await provider?.close();
    process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop);
  }
}
