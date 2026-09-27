/**
 * 검색 LoRA 브라우저 측정 — 앱의 워커(WebGPU, 판정·검색 LoRA 를 실은 그래프)로 시험 720문항의 벡터를 뽑아
 * 파이썬 CPU(`dual_graph_check.py`)와 대조하고, 앱의 문서 벡터·문턱으로 채점한다. 개발 서버 탭의 콘솔에서:
 *
 *   const m = await import("/scripts/llm/vector-search/eval-search-browser.ts");
 *   await m.run();            // 결과는 window.__searchEval
 */
import { ADVISOR_MODEL } from "../../../src/lib/advisor/config";
import { loadDocVectors, nearest } from "../../../src/lib/advisor/docVectors";
import type { AdvisorRequest, AdvisorResponse } from "../../../src/lib/advisor/protocol";

export async function run(limit = Infinity) {
  const model = ADVISOR_MODEL;
  const retrieval = model.retrieval!;
  const vectors = await loadDocVectors(`/${retrieval.vectors}`);
  const rows = (await (await fetch("/research/llm-evals/vector-search/queries.jsonl")).text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { lang: string; q: string; gold: string[]; type: string })
    .slice(0, limit);
  const ref = (await (await fetch("/research/llm-evals/vector-search/ref-dual-q.json")).json()) as { test: boolean[] };
  const refQ = new Float32Array(await (await fetch("/research/llm-evals/vector-search/ref-dual-q.f32")).arrayBuffer());
  const worker = new Worker(new URL("../../../src/workers/advisor.worker.ts", import.meta.url), { type: "module" });
  let nextId = 1;
  const embed = (text: string) =>
    new Promise<{ vector: Float32Array; seconds: number }>((resolve, reject) => {
      const id = nextId++;
      const onMessage = (event: MessageEvent<AdvisorResponse>) => {
        const m = event.data;
        if (m.type === "embedded" && m.id === id) {
          worker.removeEventListener("message", onMessage);
          resolve({ vector: m.vector, seconds: m.seconds });
        } else if (m.type === "error") {
          worker.removeEventListener("message", onMessage);
          reject(new Error(m.message));
        }
      };
      worker.addEventListener("message", onMessage);
      worker.postMessage({ type: "embed", id, model, text } satisfies AdvisorRequest);
    });
  const started = performance.now();
  const cosines: number[] = [];
  const seconds: number[] = [];
  let right = 0, wrong = 0, total = 0, para = 0, paraTotal = 0;
  const picks: Array<string | null> = [];
  for (const [i, row] of rows.entries()) {
    const text = (vectors.prompt[row.lang] ?? vectors.prompt.ko_KR).replace("{}", row.q);
    const { vector, seconds: s } = await embed(text);
    if (i > 0) seconds.push(s); // 첫 번째는 적재가 끼어 있다
    let dot = 0;
    for (let k = 0; k < 1024; k += 1) dot += vector[k] * refQ[i * 1024 + k];
    cosines.push(dot);
    const block = vectors.languages[row.lang];
    const best = nearest(vector, block.matrix, block.ids);
    const pick = best.score >= retrieval.threshold ? best.id : null;
    picks.push(pick);
    if (!ref.test[i]) continue;
    total += 1;
    const ok = row.gold.length ? pick !== null && row.gold.includes(pick) : pick === null;
    right += Number(ok);
    wrong += Number(pick !== null && !row.gold.includes(pick));
    if (row.type === "paraphrase") { paraTotal += 1; para += Number(ok); }
    if (i % 100 === 0) console.log(i, `${((performance.now() - started) / 1000).toFixed(0)}초`);
  }
  seconds.sort((a, b) => a - b);
  const result = {
    cosine: { min: Math.min(...cosines), mean: cosines.reduce((a, b) => a + b, 0) / cosines.length },
    test: { right, wrong, total, paraphrase: `${para}/${paraTotal}` },
    seconds: { median: seconds[Math.floor(seconds.length / 2)], p90: seconds[Math.floor(seconds.length * 0.9)], max: seconds[seconds.length - 1] },
    picks,
  };
  console.log(JSON.stringify({ ...result, picks: undefined }));
  (window as unknown as { __searchEval: unknown }).__searchEval = result;
  worker.terminate();
  return result;
}
