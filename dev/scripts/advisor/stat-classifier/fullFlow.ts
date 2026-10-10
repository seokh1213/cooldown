/** 고정 질문을 실제 answerDialogue와 저장 복원 경로로 비교한다. */
import fs from "node:fs";
import { appChat } from "./appChat";
import { appStatClassifier } from "./appClassifier";
import { directory, models } from "./adapter";
import { conversations } from "./conversations";
import { appScenarios } from "./appScenarios";
import type { Example } from "./contracts";
import type { Lang } from "../kev-agent/lib";

const originalFetch = globalThis.fetch;
// 미리 만든 노트도 브라우저와 같은 개발 서버에서 읽는다.
const appBase = process.env.STAT_APP_BASE ?? "http://127.0.0.1:5193";
globalThis.fetch = (input, init) => originalFetch(typeof input === "string" && input.startsWith("/") ? new URL(input, appBase) : input, init);

const modes = ["current", "hybridContext"] as const;
const examples: Example[] = fs.readFileSync(`${directory}/questions.jsonl`, "utf8").trim().split("\n").map(line => JSON.parse(line));
const inferStatQuery = appStatClassifier(async () => models.context);
const score = (rows: Array<{ exact: boolean }>) => ({ correct: rows.filter(row => row.exact).length, total: rows.length });
type AppRow = Awaited<ReturnType<ReturnType<typeof appChat>["ask"]>>;
const results = [];
for (const mode of modes) {
  const options = { inferStatQuery: mode === "hybridContext" ? inferStatQuery : undefined };
  const single = [];
  for (const row of examples.filter(row => row.split === "test")) {
    single.push({ id: row.id, ...await appChat({ ...options, memory: row.memory }).ask(row.question, row.expected) });
  }
  const multiple: Array<AppRow & { conversation: string }> = [];
  for (const conversation of conversations) {
    const lang: Lang = conversation.id === "english" ? "en_US" : conversation.id === "chinese" ? "zh_CN" : "ko_KR";
    const chat = appChat({ ...options, lang });
    for (const turn of conversation.turns) multiple.push({ conversation: conversation.id, ...await chat.ask(turn.question, turn.expected) });
  }
  const boundaries = [];
  for (const scenario of appScenarios) {
    const chat = appChat(options);
    for (const turn of scenario.turns) {
      const row = await chat.ask(turn.question, turn.expected);
      boundaries.push({ conversation: scenario.id, ...row,
        exact: row.exact && (!turn.textIncludes || row.text.includes(turn.textIncludes)) && (!turn.answerKind || row.answerKind === turn.answerKind) });
    }
  }
  const negative = single.filter(row => row.expected === null);
  results.push({ mode, single: score(single), multiple: score(multiple), boundaries: score(boundaries),
    multipleIgnoringColumnOrder: score(multiple.map(row => ({ exact: row.semanticCorrect }))),
    falseQuery: negative.filter(row => row.query !== null).length, negativeCount: negative.length,
    valuesCorrectOnExact: [...single, ...multiple].filter(row => row.semanticCorrect && row.expected !== null).every(row => row.valuesCorrect && row.regenUnitCorrect),
    savedMemoryRetained: [...single, ...multiple, ...boundaries].every(row => JSON.stringify(row.memory) === JSON.stringify(row.serializedMemory)),
    conversations: Object.fromEntries(conversations.map(c => [c.id, score(multiple.filter(row => row.conversation === c.id))])),
    detail: { single, multiple, boundaries } });
}
const current = results[0].detail.single;
const hybrid = results[1].detail.single;
const negativeUnchanged = current.filter((row, i) => row.expected === null && row.text === hybrid[i].text).length;
const report = { entryPoint: "answerDialogue", judge: "offlineFileJudge", persistence: "dehydrateTurn → JSON → reviveTurn", model: "frozen context.json",
  negativeTextUnchanged: { correct: negativeUnchanged, total: current.filter(row => row.expected === null).length }, results };
fs.writeFileSync(`${directory}/full-flow.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, results: results.map(({ detail: _detail, ...summary }) => summary) }, null, 2));
