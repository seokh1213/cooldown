/** Snowflake의 공식 query 접두사를 적용한 검색 감사와 원래 질문·반례 재검증. */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { rankDocs, type SpellDoc } from "./evidence";
import type { RagCase } from "./cases";
interface Row { item: RagCase; state: { champion: string }; query: string; rankings: Array<{ id: string }>; prompts: Record<string, string> }
interface Pack { system: string; docs?: SpellDoc[]; chunks?: SpellDoc[]; cases: Row[] }
const output = path.join(import.meta.dirname, "../../../research/llm-evals/passive-rag");
const ids = ["a01", "p01", "p02", "a06", "p06", "p08", "d02-3", "a07"];
const packed: Array<Record<string, unknown>> = [];
const rows: Array<Record<string, unknown>> = [];
const audits: Array<Record<string, unknown>> = [];
async function post(endpoint: string, body: Record<string, unknown>) {
  const response = await fetch(`http://127.0.0.1:11434/api/${endpoint}`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Ollama ${response.status}`);
  return await response.json();
}
for (const [file, mode] of [["pack.json", "korean-rag"], ["refined-pack.json", "english-atoms"]] as const) {
  const pack = JSON.parse(readFileSync(path.join(output, file), "utf8")) as Pack;
  const docs = pack.docs ?? pack.chunks!;
  const value = await post("embed", { model: "snowflake-arctic-embed2:latest", input: [...docs.map(doc => doc.text), ...pack.cases.map(row => `query: ${row.query}`)], truncate: false }) as { embeddings: number[][] };
  for (const [i, row] of pack.cases.entries()) {
    const indices = docs.flatMap((doc, index) => doc.champion === row.state.champion ? [index] : []);
    const ranked = rankDocs(indices.map(index => docs[index]), indices.map(index => value.embeddings[index]), value.embeddings[docs.length + i]);
    const selected = ranked.slice(0, 2).map(hit => hit.doc);
    const old = pack.cases[i].rankings.slice(0, 2).map(hit => hit.id);
    audits.push({ mode, id: row.item.id, before: old, after: selected.map(doc => doc.id), pTop2: selected.some(doc => doc.slot === "P") });
    if (!ids.includes(row.item.id)) continue;
    const key = mode === "korean-rag" ? "rag" : "english-atoms";
    const original = row.prompts[key];
    const prompt = mode === "korean-rag"
      ? original.slice(0, original.indexOf("근거:\n") + "근거:\n".length) + selected.map(doc => `[${doc.id}]\n${doc.text}`).join("\n\n")
      : original.slice(0, original.indexOf("Reference:\n") + "Reference:\n".length) + selected.map(doc => doc.text).join("\n")
        + original.slice(original.indexOf("\nQuestion:"));
    packed.push({ id: row.item.id, question: row.item.question, mode, system: pack.system, prompt, samePrompt: prompt === original, selected: selected.map(doc => doc.id) });
    const started = performance.now();
    const generated = await post("chat", { model: "qwen3.5:0.8b", stream: false, think: false,
      options: { temperature: 0, num_ctx: 2048, num_predict: 160, repeat_penalty: 1, presence_penalty: 0 },
      messages: [{ role: "system", content: pack.system }, { role: "user", content: prompt }] }) as { message: { content: string }; done_reason: string };
    rows.push({ ...row.item, mode, text: generated.message.content, seconds: (performance.now() - started) / 1000,
      doneReason: generated.done_reason, samePrompt: prompt === original });
  }
}
writeFileSync(path.join(output, "prefix-pack.json"), JSON.stringify({ queryPrefix: "query: ", audits, rows: packed }, null, 2) + "\n");
writeFileSync(path.join(output, "prefix-results.json"), JSON.stringify({ backend: "Ollama Q8_0", rows }, null, 2) + "\n");
