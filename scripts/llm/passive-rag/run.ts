/** Ollama 선별 실험. 앱의 q4 WebGPU 결과와 혼동하지 않도록 백엔드를 기록한다. */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { loadData, ROOT } from "../kev-agent/lib";
import { cases } from "./cases";
import { nextRagState, spellDocs, searchText, prompt, rankDocs, SYSTEM, type RagState } from "./evidence";
import { answerDialogue } from "../../../src/lib/advisor/dialogueFlow";
import { offlineJudge } from "../../../src/lib/advisor/offlineJudge";
import { translations } from "../../../src/i18n/translations";
import type { PlanTurn } from "../../../src/lib/advisor/planTypes";

const HOST = "http://127.0.0.1:11434";
const model = "qwen3.5:0.8b";
const embeddingModel = "snowflake-arctic-embed2:latest";
const data = loadData("ko_KR");
const output = path.join(ROOT, "research/llm-evals/passive-rag");
mkdirSync(output, { recursive: true });

async function post(endpoint: string, body: Record<string, unknown>) {
  const response = await fetch(`${HOST}/api/${endpoint}`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Ollama ${response.status}: ${await response.text()}`);
  return await response.json();
}

async function embed(input: string[]) {
  const response = await post("embed", { model: embeddingModel, input, truncate: false, keep_alive: "10m" }) as { embeddings: number[][] };
  if (response.embeddings.length !== input.length) throw new Error("embedding count mismatch");
  return response.embeddings;
}

async function generate(content: string) {
  const start = performance.now();
  const value = await post("chat", { model, stream: false, think: false, keep_alive: "10m",
    options: { temperature: 0, num_ctx: 2048, num_predict: 160, repeat_penalty: 1, presence_penalty: 0 },
    messages: [{ role: "system", content: SYSTEM }, { role: "user", content }] }) as {
      message: { content: string }; done_reason: string; total_duration: number; load_duration: number;
      prompt_eval_count: number; eval_count: number; prompt_eval_duration: number; eval_duration: number;
    };
  return { text: value.message.content, seconds: (performance.now() - start) / 1000, doneReason: value.done_reason,
    loadSeconds: value.load_duration / 1e9, promptTokens: value.prompt_eval_count, outputTokens: value.eval_count,
    promptSeconds: value.prompt_eval_duration / 1e9, generationSeconds: value.eval_duration / 1e9 };
}

const owners = [...new Set(cases.map(item => item.expectedOwner))];
const docs = owners.flatMap(owner => spellDocs(data.cardById.get(owner)!));
const indexStart = performance.now();
const vectors = await embed(docs.map(doc => doc.text));
const indexSeconds = (performance.now() - indexStart) / 1000;
const states = new Map<string, RagState>();
const prepared = cases.map(item => {
  const state = nextRagState(data, states.get(item.group) ?? { questions: [] }, item.question);
  states.set(item.group, state);
  if (!state.champion) throw new Error(`subject unresolved: ${item.id}`);
  const card = data.cardById.get(state.champion)!;
  return { item, state, name: card.name, query: searchText(state, card.name) };
});
const queryStart = performance.now();
const queries = await embed(prepared.map(row => row.query));
const queryBatchSeconds = (performance.now() - queryStart) / 1000;
const pack = prepared.map((row, i) => {
  const ownerIndices = docs.flatMap((doc, index) => doc.champion === row.state.champion ? [index] : []);
  const rankings = rankDocs(ownerIndices.map(index => docs[index]), ownerIndices.map(index => vectors[index]), queries[i]);
  const oracle = docs.filter(doc => doc.champion === row.state.champion && doc.slot === "P");
  const retrieved = rankings.slice(0, 2).map(hit => hit.doc);
  return { ...row, rankings: rankings.map(hit => ({ id: hit.doc.id, score: hit.score })), oracle, retrieved,
    prompts: { oracle: prompt(row.state, row.name, oracle), rag: prompt(row.state, row.name, retrieved) } };
});
writeFileSync(path.join(output, "pack.json"), JSON.stringify({ system: SYSTEM, embeddingModel, indexSeconds, queryBatchSeconds, docs, cases: pack }, null, 2) + "\n");

const judge = offlineJudge(async file => {
  const bytes = readFileSync(path.join(ROOT, "public", file));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
});
const turnsByGroup = new Map<string, PlanTurn[]>();
const rows: Array<Record<string, unknown>> = [];
for (const row of pack) {
  const turns = turnsByGroup.get(row.item.group) ?? [];
  const started = performance.now();
  const { reply } = await answerDialogue(row.item.question, { data, lang: "ko_KR", copy: translations.ko_KR.advisor,
    turns, championIds: [], consented: true, canUseModel: false, retrieval: false, judge: "offline" }, { judge, search: async () => [] });
  const baseline = { text: reply.text, seconds: (performance.now() - started) / 1000 };
  turns.push({ role: "user", content: row.item.question }, { role: "assistant", content: reply.text, answer: reply.answer, memory: reply.memory });
  turnsByGroup.set(row.item.group, turns);
  const generated: Record<string, unknown> = {};
  for (const mode of ["oracle", "rag"] as const) {
    try { generated[mode] = await generate(row.prompts[mode]); }
    catch (error) { generated[mode] = { error: error instanceof Error ? error.message : String(error) }; }
  }
  rows.push({ ...row.item, owner: row.state.champion, retrieval: row.rankings, baseline, ...generated });
  writeFileSync(path.join(output, "ollama-results.json"), JSON.stringify({ model, backend: "Ollama 0.34.4 / Q8_0; not app q4", embeddingModel,
    scope: "author-selected 30 turns; 24 main, 4 transfer, 2 unsupported; greedy decoding; no answer templates", indexSeconds, queryBatchSeconds, rows }, null, 2) + "\n");
  console.log(`${row.item.id}: generated ${rows.length}/${pack.length}`);
}
console.log(JSON.stringify({ turns: rows.length, generations: rows.length * 2, indexSeconds, queryBatchSeconds }));
