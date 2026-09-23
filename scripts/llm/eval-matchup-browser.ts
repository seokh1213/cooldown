/**
 * 상성 해설 측정 — 브라우저 판
 *
 * 앱의 워커를 그대로 띄워 같은 ONNX 파일을 WebGPU 로 돌린다. 화면에서 무한 반복을
 * 낸 것은 이 조합이고 Ollama 판본으로는 재현되지 않았다.
 *
 * 개발 서버를 띄운 탭의 콘솔(또는 DevTools 자동화)에서:
 *
 *   const m = await import("/scripts/llm/eval-matchup-browser.ts");
 *   await m.run({ mode: "single", only: "오공" });
 *
 * 결과는 `window.__matchupEval` 에도 남는다.
 */
import type { ChampionCard } from "./lib/facts";
import type { Playbook } from "./lib/playbookCore";
import type { AdvisorData } from "../../src/lib/advisor/context";
import { FALLBACK_MODEL, ADVISOR_MODEL } from "../../src/lib/advisor/config";
import type { AdvisorRequest, AdvisorResponse } from "../../src/lib/advisor/protocol";
import { PAIRS, formatRow, runPair, summarize, type Generate, type Mode, type Row } from "./lib/matchupEval";

let worker: Worker | null = null;
let nextId = 1;

function ensureWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("../../src/workers/advisor.worker.ts", import.meta.url), { type: "module" });
  }
  return worker;
}

function makeGenerate(model: { id: string; dtype: string }): Generate {
  return (system, user, maxTokens) =>
    new Promise((resolve, reject) => {
      const w = ensureWorker();
      const id = nextId++;
      // 워커는 끊으면 걷어 낸 글을 돌려준다. 끊기 전 원문은 흘려 받은 조각에서 모은다.
      let streamed = "";
      const onMessage = (event: MessageEvent<AdvisorResponse>) => {
        const message = event.data;
        if (message.type === "chunk" && message.id === id) streamed += message.text;
        if (message.type === "done" && message.id === id) {
          w.removeEventListener("message", onMessage);
          resolve({
            text: message.text,
            tokens: message.tokens,
            seconds: message.seconds,
            looped: message.looped,
            untrimmed: streamed,
          });
        } else if (message.type === "error" && (message.id === id || message.id === undefined)) {
          w.removeEventListener("message", onMessage);
          reject(new Error(message.message));
        }
      };
      w.addEventListener("message", onMessage);
      const request: AdvisorRequest = {
        type: "generate",
        id,
        model,
        system,
        messages: [{ role: "user", content: user }],
        maxTokens,
      };
      w.postMessage(request);
    });
}

async function loadData(): Promise<{ data: AdvisorData; patch: string }> {
  const version = (await (await fetch("/data/version.json")).json()) as { patchVersion?: string; version?: string };
  const patch = version.patchVersion ?? version.version ?? "26.18";
  const cards = ((await (await fetch(`/data/${patch}/llm/champion-cards-ko_KR.json`)).json()) as { cards: ChampionCard[] }).cards;
  const knowledge = (await (await fetch(`/data/${patch}/llm/advisor-knowledge.json`)).json()) as {
    playbooks: Record<string, Playbook>;
  };
  const data = {
    cards,
    cardById: new Map(cards.map((card) => [card.id, card])),
    playbooks: new Map(Object.entries(knowledge.playbooks)),
  } as unknown as AdvisorData;
  return { data, patch };
}

export async function run(options: { mode?: Mode; only?: string; model?: "lite" | "default" } = {}) {
  const mode = options.mode ?? "single";
  const model = options.model === "default" ? ADVISOR_MODEL : FALLBACK_MODEL;
  const { data, patch } = await loadData();
  const generate = makeGenerate(model);
  const rows: Row[] = [];
  const log: string[] = [];
  for (const [meId, enemyId, question] of PAIRS) {
    if (options.only && !question.includes(options.only)) continue;
    const row = await runPair(generate, data, data.cardById.get(meId)!, data.cardById.get(enemyId)!, question, patch, mode);
    rows.push(row);
    const line = formatRow(row);
    log.push(line);
    console.log(line);
  }
  const summary = summarize(rows);
  console.log(summary);
  const result = { model: model.id, patch, mode, rows, summary, log };
  (window as unknown as { __matchupEval: unknown }).__matchupEval = result;
  return result;
}
