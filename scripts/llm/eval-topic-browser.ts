/**
 * 상성 질문의 주제 판정 — 브라우저 판
 *
 * 앱과 같은 워커·헤드(topic-v1)로 상성 문항 세트의 주제를 가르고, 문항에 적어 둔 갈래와
 * 견준다. 스크립트 측정(`render-digest-detail.ts`)은 갈래를 정해 두고 쟀다. 앱에서는 판정기가
 * 가르므로 여기서 틀리면 조립 답이 엉뚱한 칸을 앞에 둔다.
 *
 *   const m = await import("/scripts/llm/eval-topic-browser.ts");
 *   await m.run();
 */
import { SWAPPABLE_FOR_TEST } from "../../src/lib/advisor/config";

/** 원본 그래프 위 헤드(topic-v1)를 재는 도구다. 앱 기본(kev)이 아니라 예전 판정 모델을 쓴다. */
const FALLBACK_MODEL = SWAPPABLE_FOR_TEST["qwen35-heads"];
import { readJudgeHead, scoreJudge, type JudgeHeadMeta, type JudgeQuestion } from "../../src/lib/advisor/judge";
import type { AdvisorRequest, AdvisorResponse } from "../../src/lib/advisor/protocol";
import { judgeRouteState } from "../../src/lib/advisor/routeAsk";
import { topicFromJudge, topicQuestions } from "../../src/lib/advisor/topicJudge";
import { FOCUSED, FOCUSED_HOLDOUT, FOCUSED_HOLDOUT2 } from "./lib/matchupEval";
import { TOPIC_TEST } from "./lib/topicCases";

export async function run(headName = "topic-v1") {
  const meta = (await (await fetch(`/models/judge/${headName}.json`)).json()) as JudgeHeadMeta;
  const head = readJudgeHead(meta, await (await fetch(`/models/judge/${headName}.bin`)).arrayBuffer());
  const cards = (await (await fetch("/data/26.18/llm/champion-cards-ko_KR.json")).json()).cards as Array<{ id: string; name: string }>;
  const nameOf = new Map(cards.map((card) => [card.id, card.name]));
  const worker = new Worker(new URL("../../src/workers/advisor.worker.ts", import.meta.url), { type: "module" });
  let nextId = 1;
  const ask = (state: string, questions: JudgeQuestion[]) =>
    new Promise<Float32Array[]>((resolve, reject) => {
      const id = nextId++;
      const onMessage = (event: MessageEvent<AdvisorResponse>) => {
        const m = event.data;
        if (m.type === "judged" && m.id === id) {
          worker.removeEventListener("message", onMessage);
          resolve(m.features);
        } else if (m.type === "error") {
          worker.removeEventListener("message", onMessage);
          reject(new Error(m.message));
        }
      };
      worker.addEventListener("message", onMessage);
      worker.postMessage({ type: "judge", id, model: FALLBACK_MODEL, state, questions, subset: head.subset } satisfies AdvisorRequest);
    });
  const rows: Array<{ question: string; want: string; got: string; set: string; p: number[] }> = [];
  const items = [
    ...[...FOCUSED, ...FOCUSED_HOLDOUT, ...FOCUSED_HOLDOUT2].map(([me, enemy, want, question]) => ({ set: "matchup", ids: [me, enemy], want, question })),
    ...TOPIC_TEST.map((c) => ({ set: `topic-${c.lang}`, ids: c.champions, want: c.topic as string, question: c.question })),
  ];
  for (const { set, ids, want, question } of items) {
    const questions = topicQuestions(ids.length);
    const flat = (await ask(judgeRouteState(question, ids.map((id) => nameOf.get(id) ?? id)), questions))[0];
    const k = questions[0].options.length + 1;
    const probs = scoreJudge(head, Array.from({ length: k }, (_, j) => flat.subarray(j * head.dim, (j + 1) * head.dim)));
    rows.push({ question, want, got: topicFromJudge(probs).topic, set, p: probs.map((x) => Math.round(x * 1000) / 1000) });
  }
  worker.terminate();
  const right = rows.filter((row) => row.want === row.got).length;
  const result = { right, total: rows.length, rows };
  (window as unknown as { __topicEval: unknown }).__topicEval = result;
  return result;
}
