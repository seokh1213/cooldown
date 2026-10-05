/** 수치 기준으로 기각한 요청만 0.8B에 넘겨 실제 대화·저장 복원 결과를 비교한다. */
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
import { loadData, offlineFileJudge } from "../kev-agent/lib";
import { answerDialogue } from "../../../src/lib/advisor/dialogueFlow";
import { dehydrateTurn, reviveTurn } from "../../../src/lib/advisor/history";
import { normalizeMessage, offlineJudge } from "../../../src/lib/advisor/offlineJudge";
import { judgeRouteState } from "../../../src/lib/advisor/routeAsk";
import { requestClassifier, REQUEST_SCOPES, REQUEST_SCOPE_INSTRUCTION, REQUEST_MODEL_FILES, type RequestIntent, type RequestScope } from "../../../src/lib/advisor/requestIntent";
import { statFields } from "../../../src/lib/advisor/statQuery";
import { translations } from "../../../src/i18n/translations";
import type { Language } from "../../../src/i18n";
import type { PlanContext } from "../../../src/lib/advisor/planTypes";
import type { AdvisorAnswer } from "../../../src/lib/advisor/answer";
import type { ResolvedQuestion } from "../../../src/lib/advisor/resolvedQuestion";

const directory = "research/llm-evals/request-classifier/comparison";
const read = async (file: string) => {
  const buffer = await fs.readFile(`public/${file}`);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
};
const base = requestClassifier(read);
const judge = offlineJudge(read, REQUEST_MODEL_FILES);
const previous = JSON.parse(await fs.readFile(`${directory}/flows.json`, "utf8")) as {
  rows: { mode: string; lang: Language; scenario: string; question: string; expected: string }[];
};
const cases = previous.rows.filter(row => row.mode === "current");
const balanced = process.argv.includes("--balanced-examples");
const allScopes = process.argv.includes("--all-scopes");
const child = spawn("uv", ["run", "--python", "3.13", "--with", "numpy==2.5.3", "--with", "scikit-learn==1.9.1",
  "python", "scripts/llm/offline-classifier/evaluate-request-hybrid.py", "--predict-stream", ...(balanced ? ["--balanced-examples"] : []),
  ...(allScopes ? ["--all-scopes"] : [])],
  { stdio: ["pipe", "pipe", "inherit"] });
const responses = createInterface({ input: child.stdout })[Symbol.asyncIterator]();

async function fallback(resolved: ResolvedQuestion, language: Language): Promise<RequestIntent | undefined> {
  const names = resolved.mentions.map(mention => resolved.text.slice(mention.index, mention.index + mention.length));
  const [scores] = await judge("request-v1", judgeRouteState(resolved.text, names), [
    { instructions: REQUEST_SCOPE_INSTRUCTION, options: REQUEST_SCOPES.map(name => ({ name })) },
  ]);
  const candidates = REQUEST_SCOPES.map((scope, index) => ({ scope, score: scores[index] }))
    .sort((a, b) => b.score - a.score).slice(0, 3).map(row => row.scope);
  child.stdin.write(`${JSON.stringify({ text: normalizeMessage(resolved.text, names), candidates, language })}\n`);
  const response = await responses.next();
  if (response.done) throw new Error("Local request judge ended early");
  const result = JSON.parse(response.value) as { predicted: RequestScope };
  if (!(allScopes ? [...REQUEST_SCOPES] : candidates).includes(result.predicted)) return undefined;
  // 이 수치는 원래 분류기의 선택 범위 점수다. LLM이 낸 확률로 해석하지 않는다.
  return { scope: result.predicted, confidence: scores[REQUEST_SCOPES.indexOf(result.predicted)] };
}

function matches(answer: AdvisorAnswer | undefined, expected: string): boolean {
  if (expected === "overview" || expected === "skills") return answer?.kind === "champion" && answer.view === expected;
  if (expected === "statsAll") return Boolean(answer?.kind === "compare" && answer.statQuery && statFields(answer.statQuery).length === 7);
  if (expected === "combo") return answer?.kind === "champion" && answer.notes?.topic === "combo";
  if (expected === "against") return Boolean(answer?.kind === "champion" && answer.notes?.perspective === "against"
    || answer?.kind === "compare" && answer.matchup && answer.cards[1]?.id === "Fiora");
  return answer?.kind === "spell" && answer.spell.slot === expected;
}

interface Row {
  mode: string; lang: Language; scenario: string; question: string; expected: string;
  correct: boolean; usedLlm: boolean; intent?: RequestIntent; answer?: AdvisorAnswer["kind"]; text: string;
}
const rows: Row[] = [];
try {
  for (const mode of ["current", "hybrid"]) {
    let ctx: PlanContext | undefined;
    let group = "";
    for (const entry of cases) {
      if (group !== `${entry.lang}:${entry.scenario}`) {
        group = `${entry.lang}:${entry.scenario}`;
        ctx = { data: loadData(entry.lang), lang: entry.lang, copy: translations[entry.lang].advisor,
          turns: [], championIds: [], consented: true, canUseModel: true, retrieval: false, judge: "offline" };
      }
      let usedLlm = false;
      let intent: RequestIntent | undefined;
      const classifyRequest = async (resolved: ResolvedQuestion) => {
        intent = await base(resolved);
        if (!intent && mode === "hybrid") {
          usedLlm = true;
          intent = await fallback(resolved, entry.lang);
        }
        return intent;
      };
      const { reply } = await answerDialogue(entry.question, ctx!, { judge: offlineFileJudge(), search: async () => [], classifyRequest });
      rows.push({ ...entry, mode, correct: matches(reply.answer, entry.expected), usedLlm, intent, answer: reply.answer?.kind, text: reply.text });
      const stored = dehydrateTurn({ id: ctx!.turns.length + 1, role: "assistant", content: reply.text,
        answer: reply.answer, memory: reply.memory, byCode: true });
      ctx!.turns = [...ctx!.turns, { role: "user", content: entry.question }, reviveTurn(JSON.parse(JSON.stringify(stored)), ctx!.data!)!];
    }
  }
} finally {
  child.stdin.end();
  child.kill();
}
const summary = Object.fromEntries(["current", "hybrid"].map(mode => {
  const selected = rows.filter(row => row.mode === mode);
  return [mode, { correct: selected.filter(row => row.correct).length, total: selected.length,
    llmCalls: selected.filter(row => row.usedLlm).length }];
}));
const files = ["scripts/llm/offline-classifier/evaluate-request-hybrid-flow.ts", "scripts/llm/offline-classifier/evaluate-request-hybrid.py",
  "public/models/offline/request-v1.json", `${directory}/flows.json`];
const sources = Object.fromEntries(await Promise.all(files.map(async file => [file, createHash("sha256").update(await fs.readFile(file)).digest("hex")])));
const filename = allScopes ? "flows-balanced-all" : balanced ? "flows-balanced-examples" : "flows";
await fs.writeFile(`${directory}/hybrid/${filename}.json`, `${JSON.stringify({ summary, rows, sources,
  policy: { minScore: 0.6, minMargin: 0.2, balancedExamples: balanced, allScopes },
  limits: "실제 앱의 계획·답변·저장 복원 코드에 주입한 Node 시험. 0.8B는 로컬 Ollama, 모바일·브라우저 미연결. 범위 처리 조건이며 답변 전체 품질 점수가 아님. confidence는 원래 분류기 점수." }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
