/**
 * kev LoRA 판정기 브라우저 측정 — 앱의 워커(WebGPU, 그래프 바꿔 끼우기 + LoRA 켜기)와 kev 헤드를 그대로 쓴다.
 * 파이썬 CPU(`b3/verify_onnx.py`)와 같은 답을 내는지 본다. 개발 서버를 띄운 탭의 콘솔에서:
 *
 *   const m = await import("/scripts/llm/kev-agent/eval-kev-browser.ts");
 *   await m.run("/research/llm-evals/kev-agent/kev-act-test.jsonl");
 */
import { SWAPPABLE_FOR_TEST } from "../../../src/lib/advisor/config";
import { readJudgeHead, scoreJudge, type JudgeHeadMeta, type JudgeQuestion } from "../../../src/lib/advisor/judge";
import type { AdvisorRequest, AdvisorResponse } from "../../../src/lib/advisor/protocol";

interface KevRecord {
  state: string;
  questions: Record<string, { instructions: string; criteria: Record<string, string | null>; label: string | null }>;
}

export async function run(file: string, limit = Infinity) {
  const model = SWAPPABLE_FOR_TEST.kev;
  const meta = (await (await fetch(`/models/judge/kev-b3i.json`)).json()) as JudgeHeadMeta;
  const head = readJudgeHead(meta, await (await fetch(`/models/judge/kev-b3i.bin`)).arrayBuffer());
  const records = (await (await fetch(file)).text()).trim().split("\n").map((l) => JSON.parse(l) as KevRecord).slice(0, limit);
  const worker = new Worker(new URL("../../../src/workers/advisor.worker.ts", import.meta.url), { type: "module" });
  let nextId = 1;
  const ask = (state: string, questions: JudgeQuestion[]) =>
    new Promise<{ features: Float32Array[]; seconds: number }>((resolve, reject) => {
      const id = nextId++;
      const onMessage = (event: MessageEvent<AdvisorResponse>) => {
        const m = event.data;
        if (m.type === "judged" && m.id === id) {
          worker.removeEventListener("message", onMessage);
          resolve({ features: m.features, seconds: m.seconds });
        } else if (m.type === "error") {
          worker.removeEventListener("message", onMessage);
          reject(new Error(m.message));
        }
      };
      worker.addEventListener("message", onMessage);
      worker.postMessage({ type: "judge", id, model, state, questions, subset: [], feature: "hidden" } satisfies AdvisorRequest);
    });
  let right = 0;
  let seconds = 0;
  const started = performance.now();
  const misses: string[] = [];
  for (const [n, record] of records.entries()) {
    const entries = Object.entries(record.questions);
    const questions: JudgeQuestion[] = entries.map(([, q]) => ({
      instructions: q.instructions,
      options: Object.entries(q.criteria).map(([name, description]) => ({ name, description })),
    }));
    const result = await ask(record.state, questions);
    seconds += result.seconds;
    const picks = result.features.map((flat, i) => {
      const k = questions[i].options.length + 1;
      const probs = scoreJudge(head, Array.from({ length: k }, (_, j) => flat.subarray(j * head.dim, (j + 1) * head.dim)));
      return questions[i].options[probs.indexOf(Math.max(...probs))].name;
    });
    const got = Object.fromEntries(entries.map(([qid], i) => [qid, picks[i]]));
    const kind = record.questions.kind;
    const ok = kind
      ? got.kind === kind.label && (kind.label !== "matchup" || !record.questions.mine || got.mine === record.questions.mine.label)
      : got.act === record.questions.act.label;
    if (ok) right += 1;
    else misses.push(`${record.state.split("\n").slice(-1)[0].slice(0, 60)} → ${JSON.stringify(got)}`);
    if (n === 0) console.log("첫 문항(예열 포함)", result.seconds.toFixed(2), "초");
  }
  worker.terminate();
  const summary = { right, total: records.length, judgeSeconds: +(seconds / records.length).toFixed(3), wallSeconds: +((performance.now() - started) / 1000).toFixed(1), misses: misses.slice(0, 12) };
  console.log(summary);
  return summary;
}
