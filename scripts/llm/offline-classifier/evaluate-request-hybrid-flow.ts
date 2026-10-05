/** 현재 판정, 낮은 확신의 보완, 0.8B 직접 판정을 실제 대화·저장 복원으로 비교한다. */
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
import { dialogueMemoryOf } from "../../../src/lib/advisor/dialogueState";

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
const holdoutMode = process.argv.includes("--holdout");
const holdoutCases = holdoutMode ? JSON.parse(await fs.readFile("scripts/llm/offline-classifier/request-scope-holdout.json", "utf8")) as {
  language: Language; question: string; expected: string;
}[] : undefined;
const cases = holdoutCases ? holdoutCases.map((row, index) => ({ mode: "current", lang: row.language,
  scenario: `holdout-${index}`, question: row.question, expected: row.expected === "ability" ? "R" : row.expected }))
  : previous.rows.filter(row => row.mode === "current");
const browserFile = process.argv[process.argv.indexOf("--browser-report") + 1];
const browser = process.argv.includes("--browser-report")
  ? JSON.parse(await fs.readFile(browserFile, "utf8")) as { variant: string; rows: { language: string; text: string; scope?: RequestScope }[] }
  : undefined;
const reviewMode = process.argv.includes("--dual-review");
const standalone = reviewMode || process.argv.includes("--llm-only");
const balanced = Boolean(browser) || standalone || process.argv.includes("--balanced-examples");
const allScopes = Boolean(browser) || standalone || process.argv.includes("--all-scopes");
const python = reviewMode ? "evaluate-request-review.py" : standalone ? "evaluate-request-standalone.py" : "evaluate-request-hybrid.py";
const child = browser ? undefined : spawn("uv", ["run", "--python", "3.13", "--with", "numpy==2.5.3", "--with", "scikit-learn==1.9.1",
  "python", `scripts/llm/offline-classifier/${python}`, "--predict-stream", ...(balanced ? ["--balanced-examples"] : []),
  ...(allScopes ? ["--all-scopes"] : [])],
  { stdio: ["pipe", "pipe", "inherit"] });
const responses = child ? createInterface({ input: child.stdout })[Symbol.asyncIterator]() : undefined;

async function requestScope(text: string, candidates: RequestScope[], language: Language): Promise<RequestScope | undefined> {
  if (browser) {
    const row = browser.rows.find(entry => entry.language === language && entry.text === text);
    if (!row) throw new Error("Browser scope result is missing");
    return row.scope && REQUEST_SCOPES.includes(row.scope) ? row.scope : undefined;
  }
  child!.stdin.write(`${JSON.stringify({ text, candidates, language, operation: "initial" })}\n`);
  const response = await responses!.next();
  if (response.done) throw new Error("Local request judge ended early");
  const result = JSON.parse(response.value) as { predicted: RequestScope };
  return (allScopes ? [...REQUEST_SCOPES] : candidates).includes(result.predicted) ? result.predicted : undefined;
}

async function directIntent(resolved: ResolvedQuestion, language: Language): Promise<RequestIntent | undefined> {
  const names = resolved.mentions.map(mention => resolved.text.slice(mention.index, mention.index + mention.length));
  const scope = await requestScope(normalizeMessage(resolved.text, names), [...REQUEST_SCOPES], language);
  // JSON 범위 선택에는 확률이 없다. 이 값은 계획기의 판정 조건에 사용되지 않는다.
  return scope ? { scope, confidence: 0 } : undefined;
}

async function fallback(resolved: ResolvedQuestion, language: Language): Promise<RequestIntent | undefined> {
  const names = resolved.mentions.map(mention => resolved.text.slice(mention.index, mention.index + mention.length));
  const [scores] = await judge("request-v1", judgeRouteState(resolved.text, names), [
    { instructions: REQUEST_SCOPE_INSTRUCTION, options: REQUEST_SCOPES.map(name => ({ name })) },
  ]);
  const candidates = REQUEST_SCOPES.map((scope, index) => ({ scope, score: scores[index] }))
    .sort((a, b) => b.score - a.score).slice(0, 3).map(row => row.scope);
  const scope = await requestScope(normalizeMessage(resolved.text, names), candidates, language);
  if (!scope) return undefined;
  // 이 수치는 원래 분류기의 선택 범위 점수다. LLM이 낸 확률로 해석하지 않는다.
  return { scope, confidence: browser ? 0 : scores[REQUEST_SCOPES.indexOf(scope)] };
}

interface Review { predicted: RequestScope | "clarify"; initialPrediction: RequestScope; abstained: boolean; reviewed: boolean }
async function reviewIntent(resolved: ResolvedQuestion, language: Language): Promise<Review> {
  const names = resolved.mentions.map(mention => resolved.text.slice(mention.index, mention.index + mention.length));
  const text = normalizeMessage(resolved.text, names);
  const [[scores], first] = await Promise.all([
    judge("request-v1", judgeRouteState(resolved.text, names), [
      { instructions: REQUEST_SCOPE_INSTRUCTION, options: REQUEST_SCOPES.map(name => ({ name })) },
    ]),
    requestScope(text, [...REQUEST_SCOPES], language),
  ]);
  const fastPrediction = REQUEST_SCOPES[scores.indexOf(Math.max(...scores))];
  if (!first) return { predicted: "clarify", initialPrediction: fastPrediction, abstained: true, reviewed: false };
  if (first === fastPrediction) return { predicted: first, initialPrediction: first, abstained: false, reviewed: false };
  child!.stdin.write(`${JSON.stringify({ text, fastPrediction, language })}\n`);
  const response = await responses!.next();
  if (response.done) throw new Error("Local request reviewer ended early");
  return JSON.parse(response.value) as Review;
}

function matches(answer: AdvisorAnswer | undefined, expected: string): boolean {
  if (expected === "overview" || expected === "skills") return answer?.kind === "champion" && answer.view === expected;
  if (expected === "statsAll") return Boolean(answer?.kind === "compare" && answer.statQuery && statFields(answer.statQuery).length === 7);
  if (expected === "stats") return Boolean(answer?.kind === "compare" && answer.statQuery && statFields(answer.statQuery).length === 1 && statFields(answer.statQuery)[0] === "attackSpeed");
  if (expected === "combo") return answer?.kind === "champion" && answer.notes?.topic === "combo";
  if (expected === "against") return Boolean(answer?.kind === "champion" && answer.notes?.perspective === "against"
    || answer?.kind === "compare" && answer.matchup && answer.cards[1]?.id === "Fiora");
  return answer?.kind === "spell" && answer.spell.slot === expected;
}

interface Row {
  mode: string; lang: Language; scenario: string; question: string; expected: string;
  correct: boolean; usedLlm: boolean; intent?: RequestIntent; review?: Review; answer?: AdvisorAnswer["kind"]; text: string;
}
const rows: Row[] = [];
const modes = reviewMode ? ["current", "hybrid", "llm-only", "dual-review"] : standalone ? ["current", "hybrid", "llm-only"] : ["current", "hybrid"];
try {
  for (const mode of modes) {
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
      let review: Review | undefined;
      const classifyRequest = async (resolved: ResolvedQuestion) => {
        if (mode === "dual-review") {
          usedLlm = true;
          review = await reviewIntent(resolved, entry.lang);
          intent = review.predicted === "clarify" ? undefined : { scope: review.predicted, confidence: 0 };
          return intent;
        }
        if (mode === "llm-only") {
          usedLlm = true;
          intent = await directIntent(resolved, entry.lang);
          return intent;
        }
        intent = await base(resolved);
        if (!intent && mode === "hybrid") {
          usedLlm = true;
          intent = await fallback(resolved, entry.lang);
        }
        return intent;
      };
      let { reply } = await answerDialogue(entry.question, ctx!, { judge: offlineFileJudge(), search: async () => [], classifyRequest });
      if (review?.abstained) {
        const clarification = { ko_KR: "원하는 답변 범위를 조금 더 구체적으로 알려 주세요.",
          en_US: "Please clarify which information you want.", zh_CN: "请具体说明想了解哪一类信息。" };
        // 실험의 되묻기에서는 추측한 답과 기억을 버리고 이전 맥락을 보존한다.
        reply = { text: clarification[entry.lang], memory: dialogueMemoryOf(ctx!.turns, ctx!.data!) };
      }
      rows.push({ ...entry, mode, correct: !review?.abstained && matches(reply.answer, entry.expected), usedLlm, intent, review,
        answer: reply.answer?.kind, text: reply.text });
      const stored = dehydrateTurn({ id: ctx!.turns.length + 1, role: "assistant", content: reply.text,
        answer: reply.answer, memory: reply.memory, byCode: true });
      ctx!.turns = [...ctx!.turns, { role: "user", content: entry.question }, reviveTurn(JSON.parse(JSON.stringify(stored)), ctx!.data!)!];
    }
  }
} finally {
  child?.stdin.end();
  child?.kill();
}
const summary = Object.fromEntries(modes.map(mode => {
  const selected = rows.filter(row => row.mode === mode);
  return [mode, { correct: selected.filter(row => row.correct).length, total: selected.length,
    llmCalls: selected.filter(row => row.usedLlm).length,
    ...(mode === "dual-review" ? { reviewCalls: selected.filter(row => row.review?.reviewed).length,
      abstained: selected.filter(row => row.review?.abstained).length } : {}) }];
}));
const files = ["scripts/llm/offline-classifier/evaluate-request-hybrid-flow.ts", "scripts/llm/offline-classifier/evaluate-request-hybrid.py",
  "scripts/llm/offline-classifier/evaluate-request-standalone.py", "public/models/offline/request-v1.json", `${directory}/flows.json`,
  ...(standalone ? [`${directory}/hybrid/standalone.json`] : []),
  ...(browser ? [browserFile] : []),
  ...(holdoutMode ? ["scripts/llm/offline-classifier/request-scope-holdout.json"] : []),
  ...(reviewMode ? ["scripts/llm/offline-classifier/evaluate-request-review.py", "scripts/llm/offline-classifier/request-review-examples.json"] : [])];
const sources = Object.fromEntries(await Promise.all(files.map(async file => [file, createHash("sha256").update(await fs.readFile(file)).digest("hex")])));
const filename = browser ? `flows-browser-${browser.variant ?? "original"}${holdoutMode ? "-holdout" : ""}` : reviewMode ? "flows-dual-review" : standalone ? "flows-standalone" : allScopes ? "flows-balanced-all" : balanced ? "flows-balanced-examples" : "flows";
await fs.writeFile(`${directory}/hybrid/${filename}.json`, `${JSON.stringify({ summary, rows, sources,
  policy: { minScore: 0.6, minMargin: 0.2, balancedExamples: balanced, allScopes, standalone, reviewMode },
  limits: `${browser ? "실제 앱 Q4 WebGPU 생성 결과를 주입. 판정 헤드와 UI 연동은 별도 검증 필요." : "0.8B는 로컬 Ollama, 모바일·브라우저 미연결."} 실제 앱의 계획·답변·저장 복원 코드에 주입한 Node 시험. 범위 처리 조건이며 답변 전체 품질 점수가 아님. 단독 모드는 요청 로지스틱을 호출하지 않으며 confidence 0은 확률 없음 표시다. 모델은 현재 질문만 보고 대화 기억은 기존 코드가 처리한다. 재판정 기각은 실험 래퍼가 되묻기로 바꾸고 이전 기억을 보존하며 정답으로 세지 않는다.` }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
