/**
 * 상성 해설 측정 — Ollama 판
 *
 * 재료·채점은 `lib/matchupEval.ts` 가 하고 여기는 생성만 맡는다.
 *
 * 브라우저의 Qwen3.5 0.8B(ONNX q4)는 Node 에서 못 돈다. onnxruntime-node 에
 * `CausalConvWithState` 연산이 없다. Ollama 판본은 양자화가 달라(1.0GB) 같은 질문에
 * 다른 글을 쓴다 — 화면에서 무한 반복을 낸 오공·럼블 질문이 여기서는 멀쩡했다.
 * 그래서 이것은 빠른 참고용이고, 판정은 `eval-matchup-browser.ts` 로 한다.
 *
 * 사용:
 *   npm run llm:eval-matchup
 *   npm run llm:eval-matchup -- --mode rewrite --only 오공 --out research/llm-evals/x.json
 */
import * as fs from "fs";
import * as path from "path";
import type { ChampionCard } from "./lib/facts";
import type { Playbook } from "./lib/playbookCore";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";
import type { AdvisorData } from "../../src/lib/advisor/context";
import { createLoopGuard, trimLoop } from "../../src/lib/advisor/loopGuard";
import { FOCUSED, PAIRS, formatRow, runPair, summarize, type Generate, type Mode, type Row } from "./lib/matchupEval";

const HOST = process.env.OLLAMA_HOST?.startsWith("http") ? process.env.OLLAMA_HOST : "http://127.0.0.1:11434";

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const MODEL = arg("model") ?? "qwen3.5:0.8b";
const OUT = arg("out");
const ONLY = arg("only");
const MODE = (arg("mode") ?? "single") as Mode;

const patch = resolvePatchVersion();
const llmDir = path.join(PUBLIC_DATA_ROOT, patch, "llm");
const cards = (
  JSON.parse(fs.readFileSync(path.join(llmDir, "champion-cards-ko_KR.json"), "utf8")) as { cards: ChampionCard[] }
).cards;
const knowledge = JSON.parse(fs.readFileSync(path.join(llmDir, "advisor-knowledge.json"), "utf8")) as {
  playbooks: Record<string, Playbook>;
};
// matchupNotes 가 보는 것은 카드와 플레이북뿐이다.
// 상성 요약의 초반 저항 아이템 문장이 아이템 이름을 쓴다(앱과 같게)
const items = (JSON.parse(fs.readFileSync(path.join(PUBLIC_DATA_ROOT, patch, "items-normalized-ko_KR.json"), "utf8")) as { items: unknown[] }).items;
const data = {
  cards,
  items,
  cardById: new Map(cards.map((card) => [card.id, card])),
  playbooks: new Map(Object.entries(knowledge.playbooks)),
} as unknown as AdvisorData;

/** 워커처럼 조각마다 반복 차단에 넣고, 걸리면 요청을 끊는다. */
const generate: Generate = async (system, user, maxTokens, options) => {
  const started = Date.now();
  const controller = new AbortController();
  const res = await fetch(`${HOST}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: controller.signal,
    body: JSON.stringify({
      model: MODEL,
      stream: true,
      think: false,
      options: {
        temperature: 0,
        repeat_penalty: 1.1,
        // transformers.js 의 repetition_penalty 는 프롬프트를 포함한 전체 문맥에 걸린다.
        repeat_last_n: 8192,
        num_ctx: 8192,
        num_predict: maxTokens,
      },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok || !res.body) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const guard = createLoopGuard();
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let tokens = 0;
  let looped = false;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let index = buffer.indexOf("\n");
      while (index >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        index = buffer.indexOf("\n");
        if (!line.trim()) continue;
        const chunk = JSON.parse(line) as { message?: { content?: string }; eval_count?: number; done?: boolean };
        const piece = chunk.message?.content ?? "";
        if (piece) {
          text += piece;
          tokens += 1;
          if (options?.guard !== false && guard.feed(piece)) {
            looped = true;
            controller.abort();
            throw new Error("cut");
          }
        }
        if (chunk.done && chunk.eval_count) tokens = chunk.eval_count;
      }
    }
  } catch (error) {
    if ((error as Error).message !== "cut" && (error as Error).name !== "AbortError") throw error;
  }
  return { text: looped ? trimLoop(text) : text, untrimmed: text, tokens, seconds: (Date.now() - started) / 1000, looped };
};

async function main(): Promise<void> {
  console.log(`모델 ${MODEL} · 패치 ${patch} · ${MODE}\n`);
  const rows: Row[] = [];
  // --set focused 면 한 갈래를 콕 집은 질문 여덟을 잰다
  const cases: Array<[string, string, string, string?]> =
    arg("set") === "focused" ? FOCUSED.map(([a, b, focus, q]) => [a, b, q, focus]) : PAIRS.map(([a, b, q]) => [a, b, q]);
  for (const [meId, enemyId, question, focus] of cases) {
    if (ONLY && !question.includes(ONLY)) continue;
    const row = await runPair(generate, data, data.cardById.get(meId)!, data.cardById.get(enemyId)!, question, patch, MODE, focus);
    rows.push(row);
    console.log(formatRow(row));
  }
  console.log(`── 요약\n${summarize(rows)}`);
  if (OUT) {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify({ model: MODEL, patch, mode: MODE, rows }, null, 2));
    console.log(`\n기록: ${OUT}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
