/**
 * 판정기 브라우저 측정 — 앱의 워커와 헤드를 그대로 쓴다
 *
 * 파이썬에서 학습·채점한 헤드가 브라우저(WebGPU, 끊어 넣기)에서도 같은 답을 내는지 본다.
 * 문항은 kev 요청 꼴 JSONL(질문마다 label). 개발 서버를 띄운 탭의 콘솔에서:
 *
 *   const m = await import("/scripts/llm/eval-judge-browser.ts");
 *   await m.run("/research/llm-evals/kev/route-test.jsonl", "route-v2");
 */
import { FALLBACK_MODEL } from "../../src/lib/advisor/config";
import { readJudgeHead, scoreJudge, type JudgeHeadMeta, type JudgeQuestion } from "../../src/lib/advisor/judge";
import type { AdvisorRequest, AdvisorResponse } from "../../src/lib/advisor/protocol";

interface KevRecord {
  state: string;
  lang?: string;
  questions: Record<string, { instructions: string; criteria: Record<string, string | null>; label: string | null }>;
}

export async function run(file: string, headName: string) {
  const meta = (await (await fetch(`/models/judge/${headName}.json`)).json()) as JudgeHeadMeta;
  const head = readJudgeHead(meta, await (await fetch(`/models/judge/${headName}.bin`)).arrayBuffer());
  const records = (await (await fetch(file)).text()).trim().split("\n").map((line) => JSON.parse(line) as KevRecord);
  const worker = new Worker(new URL("../../src/workers/advisor.worker.ts", import.meta.url), { type: "module" });
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
      worker.postMessage({ type: "judge", id, model: FALLBACK_MODEL, state, questions, subset: head.subset } satisfies AdvisorRequest);
    });

  let right = 0;
  let total = 0;
  let seconds = 0;
  const byQuestion: Record<string, [number, number]> = {};
  const misses: string[] = [];
  for (const record of records) {
    const entries = Object.entries(record.questions).filter(([, q]) => q.label !== null);
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
    if (entries[0][0] === "kind") {
      // eval-route 와 같은 잣대: 갈래가 맞고, 정답이 matchup 이면 내 챔피언도 맞아야 한다
      const kindOk = picks[0] === entries[0][1].label;
      const mineOk = entries[0][1].label !== "matchup" || entries.length < 2 || picks[1] === entries[1][1].label;
      total += 1;
      if (kindOk && mineOk) right += 1;
      else misses.push(`${record.state.split("\n")[0]} → ${picks.join("/")} (정답 ${entries.map(([, q]) => q.label).join("/")})`);
    } else {
      // 그 밖의 헤드는 질문마다 센다
      for (const [i, [qid, q]] of entries.entries()) {
        const key = `${record.lang ?? ""}:${qid}`;
        const tally = (byQuestion[key] ??= [0, 0]);
        tally[1] += 1;
        total += 1;
        if (picks[i] === q.label) {
          tally[0] += 1;
          right += 1;
        } else misses.push(`${record.state.split("\n")[0]} [${qid}] → ${picks[i]} (정답 ${q.label})`);
      }
    }
  }
  worker.terminate();
  const summary = `${right}/${total} · 문항당 ${(seconds / records.length).toFixed(2)}초`;
  console.log(summary, byQuestion, misses);
  return { summary, byQuestion, misses };
}
