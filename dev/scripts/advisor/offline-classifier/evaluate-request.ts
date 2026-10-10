/** 모델에 사용하지 않은 문장과 실제 대화에서 기존 앱과 학습된 요청 판정을 비교한다. */
import fs from "node:fs/promises";
import { loadData, offlineFileJudge } from "../kev-agent/lib";
import { resolveQuestion } from "../../../../src/features/advisor/understanding/resolvedQuestion";
import { requestClassifier, type RequestScope } from "../../../../src/features/advisor/understanding/requests/requestIntent";
import { readOfflineModel, answerOffline, type OfflineJudgeMeta } from "../../../../src/features/advisor/model/offlineJudge";
import { REQUEST_SCOPES, REQUEST_SCOPE_INSTRUCTION } from "../../../../src/features/advisor/understanding/requests/requestIntent";
import { judgeRouteState } from "../../../../src/features/advisor/application/routeAsk";
import { answerDialogue } from "../../../../src/features/advisor/conversation/dialogueFlow";
import { statFields } from "../../../../src/features/advisor/understanding/stats/statQuery";
import { translations } from "../../../../src/shared/i18n/translations";
import type { PlanContext, PlanTurn } from "../../../../src/features/advisor/contracts/planTypes";
import type { Language } from "../../../../src/shared/i18n";

async function read(file: string) {
  const buffer = await fs.readFile(`public/${file}`);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}
const classifyRequest = requestClassifier(read);
const heldout = JSON.parse(await fs.readFile("dev/scripts/advisor/offline-classifier/request-test.json", "utf8")) as Record<RequestScope, string[]>;
const training = JSON.parse(await fs.readFile("dev/scripts/advisor/offline-classifier/request-training.json", "utf8")) as Record<RequestScope, string[]>;
const used = new Set(Object.values(training).flat());
if (Object.values(heldout).flat().some(text => used.has(text))) throw new Error("학습·시험 문장 중복");
const model = readOfflineModel(JSON.parse(new TextDecoder().decode(await read("models/offline/request-v1.json"))) as OfflineJudgeMeta,
  await read("models/offline/request-v1.bin"));
const cases = [];
for (const [expected, texts] of Object.entries(heldout)) for (const template of texts) {
  const lang: Language = /[가-힣]/.test(template) ? "ko_KR" : /[一-鿿]/.test(template) ? "zh_CN" : "en_US";
  const data = loadData(lang);
  const question = template.replace("◇", data.cardById.get("MonkeyKing")!.name).replace("◇", data.cardById.get("DrMundo")!.name);
  const resolved = resolveQuestion(question, data);
  const state = judgeRouteState(question, resolved.mentions.map(m => question.slice(m.index, m.index + m.length)));
  const [probabilities] = answerOffline(model, state, [{ instructions: REQUEST_SCOPE_INSTRUCTION, options: REQUEST_SCOPES.map(name => ({ name })) }]);
  const prediction = REQUEST_SCOPES[probabilities.indexOf(Math.max(...probabilities))];
  const selected = await classifyRequest(resolved);
  cases.push({ question, expected, prediction, accepted: selected?.scope, confidence: Number(Math.max(...probabilities).toFixed(3)) });
}

const conversations = [
  { id: "reported", turns: [
    ["오공 설명해줘", "overview"], ["오공 기본정보도 알려줘.", "overview"],
    ["아니 스킬말고 스탯들. 체력이나이런정보들", "statsAll"],
    ["아니 체력말고 전부다알려줘야지. 오공이라는 챔피언에 대해서", "overview"],
  ] },
  { id: "switch", turns: [["오공 체력", "stats"], ["체력 하나만 말고 전체 능력치", "statsAll"],
    ["오공 스킬 설명해줘", "skills"], ["오공 기본정보도 알려줘", "overview"]] },
  { id: "other-intents", turns: [["오공 콤보 알려주라", "combo"], ["피오라 W 쓰게 만드는 방법", "counterplay"],
    ["오공 전체 스탯", "statsAll"], ["오공 소개 좀", "overview"]] },
];
function matches(reply: Awaited<ReturnType<typeof answerDialogue>>["reply"], expected: string) {
  const answer = reply.answer;
  if (expected === "overview" || expected === "skills") return answer?.kind === "champion" && answer.view === expected;
  if (expected === "statsAll") return answer?.kind === "compare" && answer.statQuery && statFields(answer.statQuery).length === 7;
  if (expected === "stats") return Boolean(answer && "statQuery" in answer && answer.statQuery);
  if (expected === "combo") return answer?.kind === "champion" && answer.notes?.topic === "combo";
  return answer?.kind === "champion" && answer.notes?.perspective === "against";
}
const flows: Array<{ mode: "before" | "after"; conversation: string; question: string; correct: boolean; text: string }> = [];
for (const mode of ["before", "after"] as const) for (const conversation of conversations) {
  let turns: PlanTurn[] = [];
  const ctx: PlanContext = { data: loadData("ko_KR"), lang: "ko_KR", copy: translations.ko_KR.advisor,
    turns, championIds: [], consented: false, canUseModel: false, retrieval: false, judge: "offline" };
  for (const [question, expected] of conversation.turns) {
    ctx.turns = turns;
    const { reply } = await answerDialogue(question, ctx, { judge: offlineFileJudge(), search: async () => [],
      classifyRequest: mode === "after" ? classifyRequest : undefined });
    flows.push({ mode, conversation: conversation.id, question, correct: Boolean(matches(reply, expected)), text: reply.text });
    turns = [...turns, { role: "user", content: question }, { role: "assistant", answer: reply.answer, memory: reply.memory, content: reply.text }];
  }
}
const report = { scope: { total: cases.length, correct: cases.filter(c => c.prediction === c.expected).length,
  accepted: cases.filter(c => c.accepted).length, acceptedCorrect: cases.filter(c => c.accepted === c.expected).length },
  conversations: Object.fromEntries(["before", "after"].map(mode => [mode, {
    correct: flows.filter(flow => flow.mode === mode && flow.correct).length, total: flows.filter(flow => flow.mode === mode).length }])),
  cases, flows };
await fs.mkdir("dev/research/llm-evals/request-classifier", { recursive: true });
await fs.writeFile("dev/research/llm-evals/request-classifier/app-report.json", `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ scope: report.scope, conversations: report.conversations,
  errors: cases.filter(c => c.accepted && c.accepted !== c.expected) }, null, 2));
