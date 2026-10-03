/** 브라우저의 실제 앱 워커. 모델을 받은 뒤 원래·개선 프롬프트를 같은 q4로 비교한다. */
import { createRuntime } from "../conversational-advisor/runtime";

interface PackedCase { item: { id: string; question: string }; prompts: Record<string, string> }
interface Pack { system: string; cases: PackedCase[] }
const loadButton = document.querySelector<HTMLButtonElement>("#load")!;
const runButton = document.querySelector<HTMLButtonElement>("#run")!;
const status = document.querySelector<HTMLParagraphElement>("#status")!;
const resultJson = document.querySelector<HTMLPreElement>("#result-json")!;
const output = document.querySelector<HTMLDivElement>("#results")!;
const selected = ["a01", "p01", "p02", "a04", "a06", "p06", "p08", "d02-3"];
const runtime = createRuntime();
const shortMode = new URLSearchParams(location.search).get("mode") === "short";
if (shortMode) runButton.textContent = "짧은 근거로 원래 질문과 반례 4개 비교";

async function loadEntries() {
  if (shortMode) {
    const response = await fetch("/research/llm-evals/passive-rag/short-results.json");
    const pack = await response.json() as { system: string; rows: Array<{ id: string; question: string; prompt: string }> };
    return pack.rows.filter(row => ["a01", "p01", "p06", "p08"].includes(row.id)).map(row => ({ id: row.id, question: row.question,
      variants: [{ mode: "short-reference", system: pack.system, prompt: row.prompt }] }));
  }
  const packs = await Promise.all(["pack.json", "refined-pack.json"].map(async file => {
    const response = await fetch(`/research/llm-evals/passive-rag/${file}`);
    if (!response.ok) throw new Error(`pack ${response.status}`);
    return await response.json() as Pack;
  }));
  return selected.map(id => {
    const original = packs[0].cases.find(row => row.item.id === id)!;
    const refined = packs[1].cases.find(row => row.item.id === id)!;
    return { id, question: original.item.question, variants: [{ mode: "korean-rag", system: packs[0].system, prompt: original.prompts.rag },
      { mode: "english-atoms", system: packs[1].system, prompt: refined.prompts["english-atoms"] }] };
  });
}

loadButton.addEventListener("click", async () => {
  loadButton.disabled = true;
  status.textContent = "앱 q4 모델을 불러오는 중";
  try { await runtime.load(); status.textContent = "앱 q4 모델 준비 완료"; runButton.disabled = false; }
  catch (error) { status.textContent = `모델 적재 실패: ${String(error)}`; }
});

runButton.addEventListener("click", async () => {
  runButton.disabled = true;
  const entries = await loadEntries();
  const rows: Array<Record<string, unknown>> = [];
  const loadStart = performance.now();
  for (const entry of entries) {
    const generated: Record<string, unknown> = {};
    for (const variant of entry.variants) {
      status.textContent = `생성 ${rows.length + 1}/${entries.length}: ${entry.id} ${variant.mode}`;
      try { generated[variant.mode] = await runtime.generate(variant.system, variant.prompt, 160, "grounded-summary"); }
      catch (error) { generated[variant.mode] = { error: String(error) }; }
    }
    rows.push({ id: entry.id, question: entry.question, ...generated });
    const section = document.createElement("section");
    const heading = document.createElement("h2");
    heading.textContent = `${entry.id}: ${entry.question}`;
    const text = document.createElement("pre");
    text.textContent = JSON.stringify(generated, null, 2);
    section.append(heading, text);
    output.append(section);
    resultJson.textContent = JSON.stringify({ backend: "actual app q4 WebGPU worker; LoRA gates off for generation", model: runtime.model,
      retrieval: "same precomputed Snowflake semantic results, not app retrieval branch", seconds: (performance.now() - loadStart) / 1000, rows }, null, 2);
  }
  status.textContent = `실험 완료: ${entries.length}개 질문, ${rows.length * entries[0].variants.length}회 실제 생성`;
  runtime.close();
});
