/** 운영 프롬프트 하나로 브라우저 시험 입력을 만든다. */
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { loadData } from "../kev-agent/lib";
import { resolveQuestion } from "../../../src/lib/advisor/resolvedQuestion";
import { normalizeMessage } from "../../../src/lib/advisor/offlineJudge";
import { requestClassifier } from "../../../src/lib/advisor/requestIntent";
import prompt from "../../../src/lib/advisor/requestScopePrompt.json";
import type { Language } from "../../../src/i18n";

const directory = "research/llm-evals/request-classifier/comparison/hybrid";
const flows = JSON.parse(await fs.readFile(`${directory}/flows-standalone.json`, "utf8"));
const base = requestClassifier(async file => {
  const bytes = await fs.readFile(`public/${file}`);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
});
async function entry(row: { question: string; language: Language; expected: string }) {
  const resolved = resolveQuestion(row.question, loadData(row.language));
  const names = resolved.mentions.map(mention => resolved.text.slice(mention.index, mention.index + mention.length));
  return { ...row, text: normalizeMessage(row.question, names), fastIntent: await base(resolved) };
}
const cases = await Promise.all(flows.rows.filter((row: { mode: string; usedLlm: boolean }) => row.mode === "hybrid" && row.usedLlm)
  .map((row: { question: string; lang: Language; expected: string }) => entry({ ...row, language: row.lang })));
const comparison = JSON.parse(await fs.readFile(`${directory}/balanced-all-examples.json`, "utf8"));
const classification = comparison.result.rows.filter((row: { confidence: number; margin: number }) => row.confidence < 0.6 || row.margin < 0.2);
const holdout = await Promise.all(JSON.parse(await fs.readFile("scripts/llm/offline-classifier/request-scope-holdout.json", "utf8")).map(entry));
const files = ["scripts/llm/offline-classifier/prepare-request-browser.ts", "scripts/llm/offline-classifier/request-scope-holdout.json",
  "src/lib/advisor/requestScopePrompt.json", "src/lib/advisor/requestScopeModel.ts", "public/models/offline/request-v1.bin",
  "src/workers/advisor/generate.ts", "src/workers/advisor/lora.ts"];
const sources = Object.fromEntries(await Promise.all(files.map(async file => [file, createHash("sha256").update(await fs.readFile(file)).digest("hex")])));
await fs.writeFile(`${directory}/browser-pack-final.json`, `${JSON.stringify({ ...prompt, cases, classification, holdout, sources }, null, 2)}\n`);
console.log(JSON.stringify({ flowCalls: cases.length, classificationCalls: classification.length, holdout: holdout.length }));
