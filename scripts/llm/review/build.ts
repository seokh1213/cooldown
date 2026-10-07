import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { execFileSync } from "node:child_process";
import { buildBank, digest, ROOT } from "../quality/bank";
import { currentDataDirectory, fileHash, filesUnder } from "../quality/archive";
import type { QualityReport } from "../quality/types";
import { localFetch, evaluationDeps, qualityContext } from "../quality/dialogue";
import { answerDialogue } from "../../../src/lib/advisor/dialogueFlow";
import { REQUEST_SCOPES } from "../../../src/lib/advisor/requestIntent";
import { pendingCases } from "./packet";
import { renderReview } from "./render";

const { values } = parseArgs({ options: { baseline: { type: "string", default: "research/llm-evals/workflow/reports/regression/baseline.json" },
  out: { type: "string", default: "research/llm-evals/workflow/reports/review-20261007" }, "render-only": { type: "boolean", default: false } } });
const directory = path.resolve(ROOT, values.out!);
if (values["render-only"]) {
  const packet = JSON.parse(fs.readFileSync(path.join(directory, "packet.json"), "utf8"));
  console.log(JSON.stringify({ output: path.relative(ROOT, directory), packetHash: packet.packetHash,
    ...renderReview(directory, packet) }));
  process.exit(0);
}
const baseline = JSON.parse(fs.readFileSync(values.baseline!, "utf8")) as QualityReport;
const bank = buildBank(), cases = pendingCases(baseline, bank), restore = localFetch();
try {
  for (const entry of cases) for (const mode of ["none", "offline"] as const) {
    const story = bank.find(story => entry.id.startsWith(`${story.id}:`))!;
    const ctx = qualityContext(story.lang, mode);
    const output = await answerDialogue(entry.question, ctx, evaluationDeps(undefined, story.lang));
    const ids = new Set<string>([...(output.reply.memory.matchup ? [output.reply.memory.matchup.mine, output.reply.memory.matchup.enemy] : []),
      ...output.dialogue.parts.flatMap(part => part.plan.type === "matchup" ? [part.plan.mine.id, part.plan.enemy.id] : [])]);
    const evidence = [...ids].map(id => ctx.data!.cardById.get(id)).filter(Boolean)
      .map(card => `${card!.name}\n${card!.spells.map(spell => `${spell.slot}: ${spell.text}`).join("\n")}`).join("\n\n");
    entry.current.push({ mode, text: output.reply.text, evidence, plans: output.dialogue.parts.map(part => part.plan.type) });
    entry.inputHash = digest({ ...entry, inputHash: undefined });
  }
} finally { restore(); }
const packet = { schema: 1, created: new Date().toISOString(), scopes: REQUEST_SCOPES,
  patch: JSON.parse(fs.readFileSync("public/data/version.json", "utf8")).patchVersion,
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  sourceHash: digest([...filesUnder("src/lib/advisor"), ...filesUnder("src/lib/knowledge"), ...filesUnder("scripts/llm/review")].map(file => [file, fileHash(file)])),
  dataHash: digest(filesUnder(currentDataDirectory()).filter(file => file.endsWith(".json")).map(file => [file, fileHash(file)])),
  baselineHash: fileHash(values.baseline!), baselineCaseHash: baseline.caseHash, cases };
const packetHash = digest(packet);
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(path.join(directory, "packet.json"), JSON.stringify({ ...packet, packetHash }, null, 2));
const presentation = renderReview(directory, { ...packet, packetHash });
console.log(JSON.stringify({ output: path.relative(ROOT, directory), scope: cases.filter(row => row.kind === "scope").length,
  matchup: cases.filter(row => row.kind === "matchup").length, measurements: cases.reduce((n, row) => n + row.measurements.length, 0), packetHash,
  ...presentation }));
