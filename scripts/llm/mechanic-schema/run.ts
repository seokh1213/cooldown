import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { loadData } from "../kev-agent/lib";
import { answerDialogue } from "../../../src/lib/advisor/dialogueFlow";
import { offlineJudge } from "../../../src/lib/advisor/offlineJudge";
import { translations } from "../../../src/i18n/translations";
import type { PlanTurn } from "../../../src/lib/advisor/planTypes";
import { answerStructured } from "./adapter";
import { cases, grade } from "./cases";
import { loadReviewedRecords, ROOT } from "./fixtures";
import { MODEL, generate, type Generation } from "./ollama";
import { QUERY_SYSTEM, queryPrompt } from "./query";
import { PAYLOAD_SCHEMA, QUERY_SCHEMA, RECORD_SCHEMA, MEMORY_SCHEMA, parseQuery, auditCandidate } from "./schema";
import type { Memory } from "./types";

const output = path.join(ROOT, "research/llm-evals/mechanic-schema");
const reviewedRecords = loadReviewedRecords();
mkdirSync(output, { recursive: true });
const save = (file: string, value: unknown) => writeFileSync(path.join(output, file), JSON.stringify(value, null, 2) + "\n");
save("rule.schema.json", PAYLOAD_SCHEMA);
save("record.schema.json", RECORD_SCHEMA);
save("query.schema.json", QUERY_SCHEMA);
save("memory.schema.json", MEMORY_SCHEMA);
save("cases.json", cases);
const data = loadData("ko_KR");
const judge = offlineJudge(async file => {
  const bytes = readFileSync(path.join(ROOT, "public", file));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
});
const baselineStates = new Map<string, PlanTurn[]>();
const cueStates = new Map<string, Memory>();
const modelStates = new Map<string, Memory>();
const rows: Array<Record<string, unknown>> = [];
let generations = 0;
for (const item of cases) {
  const turns = baselineStates.get(item.group) ?? [];
  const started = performance.now();
  const { reply } = await answerDialogue(item.question, { data, lang: "ko_KR", copy: translations.ko_KR.advisor,
    turns, championIds: [], consented: true, canUseModel: false, retrieval: false, judge: "offline" }, { judge, search: async () => [] });
  const baseline = { text: reply.text, seconds: (performance.now() - started) / 1000 };
  turns.push({ role: "user", content: item.question }, { role: "assistant", content: reply.text, answer: reply.answer, memory: reply.memory });
  baselineStates.set(item.group, turns);
  const cueStart = performance.now();
  const cue = await answerStructured(item.question, { data, records: reviewedRecords, previous: cueStates.get(item.group) });
  const cueSeconds = (performance.now() - cueStart) / 1000;
  if (cue.memory) cueStates.set(item.group, cue.memory); else cueStates.delete(item.group);
  let raw: Generation | undefined;
  const model = await answerStructured(item.question, { data, records: reviewedRecords, previous: modelStates.get(item.group) }, async (question, previous) => {
    raw = await generate({ system: QUERY_SYSTEM, content: queryPrompt(question, previous), schema: QUERY_SCHEMA });
    generations++;
    return parseQuery(JSON.parse(raw.text));
  });
  if (model.memory) modelStates.set(item.group, model.memory); else modelStates.delete(item.group);
  rows.push({ ...item, baseline, cue: { ...cue, seconds: cueSeconds, grade: grade(cue.result.text, item) },
    model: { ...model, raw, grade: grade(model.result.text, item) } });
  save("query-results.json", { backend: "Ollama Qwen3.5 0.8B Q8_0; not app q4", model: MODEL, generation: "schema constrained, temperature=0, maxTokens=256",
    scope: "26 earlier + 12 newly authored diagnostic turns; no claim of population accuracy; AI is query extraction only", generations, rows });
  console.log(`${item.id}: cue=${grade(cue.result.text, item).pass} model=${grade(model.result.text, item).pass}`);
}

const authorRows: Array<Record<string, unknown>> = [];
const authorSystem = `Extract only mechanics supported by the supplied passive description. Output one rule per supported type, omit unsupported types. Never guess conditions, stats or numbers.
This is a selected-coverage schema: unsupported damage/storage formulas and level curves are omitted. capacityBonusADRatio is the coefficient on bonus AD in the storage limit; 800%=8.
Use the exact permitted field names and enum values. Source metadata, patch, champion and review status are assigned by code, never by the model.
Schema: ${JSON.stringify(PAYLOAD_SCHEMA)}`;
for (const record of reviewedRecords) {
  for (const seed of [11, 22, 33]) {
    const generated = await generate({ system: authorSystem, content: `Passive source:\n${record.source.text}`, schema: PAYLOAD_SCHEMA, seed, maxTokens: 700 });
    generations++;
    let value: unknown;
    let errors: string[];
    try { value = JSON.parse(generated.text); errors = auditCandidate(value, record); }
    catch { errors = ["invalid JSON"]; }
    authorRows.push({ champion: record.champion, seed, generated, value, errors, publishStatus: "candidate" });
    save("author-results.json", { backend: "Ollama Q8_0", schema: "v1; identical schema at all seeds; temperature=.4", system: authorSystem, rows: authorRows });
    console.log(`author ${record.champion}/${seed}: ${errors.length ? "review needed" : "matches reviewed rules"}`);
  }
}
save("run-summary.json", { queries: rows.length, authorCandidates: authorRows.length, generations,
  cuePassed: rows.filter(row => (row.cue as { grade: { pass: boolean } }).grade.pass).length,
  modelPassed: rows.filter(row => (row.model as { grade: { pass: boolean } }).grade.pass).length,
  authorMatched: authorRows.filter(row => !(row.errors as string[]).length).length });
console.log(JSON.stringify({ queries: rows.length, generations }));
