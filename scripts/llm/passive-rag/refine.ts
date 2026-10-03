/** 자료의 번역 모순과 프롬프트 과부하를 분리하는 두 번째 고정 비교. */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { loadData, ROOT } from "../kev-agent/lib";
import { splitSentences } from "../../../src/lib/advisor/answerText";
import { rankDocs, type RagState, type SpellDoc } from "./evidence";
import type { RagCase } from "./cases";

interface Packed { item: RagCase; state: RagState; query: string }
const output = path.join(ROOT, "research/llm-evals/passive-rag");
const pack = JSON.parse(readFileSync(path.join(output, "pack.json"), "utf8")) as { cases: Packed[] };
const system = "Answer in Korean in at most two sentences, using only the reference. Keep necessary conditions and distinguish base from bonus stats. If the reference does not answer the question, say you cannot confirm it. Do not repeat the question or list skills.";
const data = loadData("en_US");
const owners = [...new Set(pack.cases.map(row => row.state.champion!))];
const fullDocs = owners.flatMap(owner => data.cardById.get(owner)!.spells.map(spell => ({ id: `${owner}:${spell.slot}`, champion: owner, slot: spell.slot,
  text: `${data.cardById.get(owner)!.name} ${spell.slot} ${spell.name}\n${spell.summary ?? ""}\n${spell.text}` })));
// 두 문장씩 묶는다. 질문이나 챔피언 이름에 따른 분기 없이 원문 순서를 보존한다.
const chunks = owners.flatMap(owner => data.cardById.get(owner)!.spells.flatMap(spell => {
  const sentences = splitSentences(spell.text);
  return sentences.flatMap((_, i) => i % 2 ? [] : [{ id: `${owner}:${spell.slot}:${i}`, champion: owner, slot: spell.slot,
    text: `${data.cardById.get(owner)!.name} ${spell.slot} ${spell.name}: ${sentences.slice(i, i + 2).join(" ")}` }]);
}));

async function post(endpoint: string, body: Record<string, unknown>) {
  const response = await fetch(`http://127.0.0.1:11434/api/${endpoint}`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Ollama ${response.status}: ${await response.text()}`);
  return await response.json();
}

const start = performance.now();
const vectors = (await post("embed", { model: "snowflake-arctic-embed2:latest", input: [...chunks.map(doc => doc.text), ...pack.cases.map(row => row.query)], truncate: false })) as { embeddings: number[][] };
const indexSeconds = (performance.now() - start) / 1000;
function makePrompt(row: Packed, docs: SpellDoc[]) {
  return `Champion: ${data.cardById.get(row.state.champion!)!.name}\nPrevious questions: ${row.state.questions.slice(0, -1).join(" / ") || "none"}\nReference:\n${docs.map(doc => doc.text).join("\n")}\nQuestion: ${row.item.question}\nAnswer in Korean:`;
}
const prepared = pack.cases.map((row, i) => {
  const indices = chunks.flatMap((doc, index) => doc.champion === row.state.champion ? [index] : []);
  const ranking = rankDocs(indices.map(index => chunks[index]), indices.map(index => vectors.embeddings[index]), vectors.embeddings[chunks.length + i]);
  const full = fullDocs.filter(doc => doc.champion === row.state.champion && doc.slot === "P");
  const atom = ranking.slice(0, 2).map(hit => hit.doc);
  return { ...row, rankings: ranking.map(hit => ({ id: hit.doc.id, score: hit.score })),
    prompts: { "english-full": makePrompt(row, full), "english-atoms": makePrompt(row, atom) } };
});
writeFileSync(path.join(output, "refined-pack.json"), JSON.stringify({ system, indexSeconds, chunks, cases: prepared }, null, 2) + "\n");
const rows: Array<Record<string, unknown>> = [];
for (const row of prepared) {
  const generated: Record<string, unknown> = {};
  for (const mode of ["english-full", "english-atoms"] as const) {
    const started = performance.now();
    try {
      const value = await post("chat", { model: "qwen3.5:0.8b", stream: false, think: false, keep_alive: "10m",
        options: { temperature: 0, num_ctx: 2048, num_predict: 160, repeat_penalty: 1, presence_penalty: 0 },
        messages: [{ role: "system", content: system }, { role: "user", content: row.prompts[mode] }] }) as {
          message: { content: string }; eval_count: number; prompt_eval_count: number; done_reason: string;
        };
      generated[mode] = { text: value.message.content, seconds: (performance.now() - started) / 1000,
        promptTokens: value.prompt_eval_count, outputTokens: value.eval_count, doneReason: value.done_reason };
    } catch (error) { generated[mode] = { error: String(error) }; }
  }
  rows.push({ ...row.item, retrieval: row.rankings, ...generated });
  writeFileSync(path.join(output, "refined-results.json"), JSON.stringify({ model: "qwen3.5:0.8b", backend: "Ollama Q8_0; not app q4",
    scope: "same 30 turns; short English instruction; existing English source; oracle P vs top-two sentence chunks", indexSeconds, rows }, null, 2) + "\n");
  console.log(`${row.item.id}: refined ${rows.length}/${prepared.length}`);
}
