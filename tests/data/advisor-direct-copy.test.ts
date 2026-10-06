import assert from "node:assert/strict";
import { test } from "node:test";
import type { Language } from "../../src/i18n";
import { translations } from "../../src/i18n/translations";
import { loadData } from "../../scripts/llm/kev-agent/lib";
import { planAnswer } from "../../src/lib/advisor/plan";
import { answerDialogue } from "../../src/lib/advisor/dialogueFlow";
import { buildMechanicsAnswer, buildTagAnswer } from "../../src/lib/advisor/context";
import { conditionMatchupText } from "../../src/lib/advisor/conditionedMatchup";
import { resolveDialogueRule } from "../../src/lib/advisor/dialogueRules";
import { scenarioConditions } from "../../src/lib/advisor/dialogueState";
import type { AnswerPlan, PlanContext } from "../../src/lib/advisor/planTypes";

const boilerplate = /말씀하신 조건|이 조언에서 말하는|앞서 말한 .*기준입니다|화면의 .*기준입니다|이해했습니다|그대로 옮|항목은 알아봤|계산하지 않습니다|근거 자료에서|조언에 쓰는 규칙|Your stated conditions|Crowd control referred to here|Using .* from (?:earlier in this chat|the current page)|Read as|Quoted as|你提供的条件|这里提到的控制技能|已按 .* 理解|以(?:刚才提到的|当前页面的).*为准/;
const deps = { judge: async () => { throw Error("판정기 미사용"); }, search: async () => [] };
const context = (lang: Language = "ko_KR"): PlanContext => ({ data: loadData(lang), lang, copy: translations[lang].advisor,
  turns: [], championIds: [], judge: "none", consented: false, canUseModel: false, retrieval: false });

for (const lang of ["ko_KR", "en_US", "zh_CN"] as const) {
  test(`${lang} 자료 없는 항목은 짧게 알리고 항목명은 보존한다`, async () => {
    const { reply } = await answerDialogue("AP", context(lang), deps);
    const label = lang === "ko_KR" ? "주문력" : lang === "en_US" ? "ability power" : "法术强度";
    assert.ok(reply.text.includes(label));
    assert.doesNotMatch(reply.text, boilerplate);
    assert.equal(reply.text.split(/\n/).length, 1);
  });
}

test("군중 제어 스킬은 별도 판정 안내 대신 대응 문장에 넣고 원문의 조건을 보존한다", () => {
  const ctx = context();
  const request = { mine: ctx.data!.cardById.get("Ahri")!, enemy: ctx.data!.cardById.get("Zed")!,
    question: "상대 궁에 어떻게 대응해?", conditions: scenarioConditions("내 R은 없고 E는 돌아왔어", [], 1) };
  const result = conditionMatchupText(ctx.data!, "ko_KR", request, "아리 R 혼령 질주로 접근해 E 매혹을 맞힙니다.");
  assert.match(result.text, /표식이 붙어 있는 동안 제드에게 아리 E 매혹을 걸어 콤보를 끊으면/);
  assert.doesNotMatch(result.text, boilerplate);
  assert.doesNotMatch(result.text, /혼령 질주로 접근/);
  assert.equal(result.abstained, false);
});

test("원리·스킬 효과 답변은 내용과 패치만 표시한다", () => {
  const { data } = context();
  const answers = [buildMechanicsAnswer(data!, "스가"),
    buildTagAnswer(data!, data!.cardById.get("Malphite")!, "말파이트 R 에어본 있어?")];
  for (const answer of answers) {
    assert.ok(answer);
    assert.doesNotMatch(answer, boilerplate);
    assert.ok(answer.includes(data!.patch));
  }
  assert.match(answers[0]!, /100 \+ 가속/);
  assert.match(answers[1]!, /R 멈출 수 없는 힘/);
});

test("외부에서 필요한 안내를 제공한 경우에는 보존한다", async () => {
  const notice = "연결이 복구되었습니다.";
  const plan: AnswerPlan = await planAnswer("가렌 E 쿨타임", { ...context(), notice }, deps);
  assert.equal("notice" in plan ? plan.notice : undefined, notice);
});

for (const [question, topic] of [["치감은 보호막에도 적용돼?", "치유 감소가 보호막에 적용되는지"],
  ["프리징 어떻게 풀어?", "프리징을 푸는 방법"]]) {
  test(`${question} 답을 확인하지 못했을 때 내부 자료 설명을 늘어놓지 않는다`, () => {
    const plan = resolveDialogueRule(question, context());
    if (plan?.type !== "code" || typeof plan.answer !== "string") assert.fail("규칙 답변 필요");
    assert.ok(plan.answer.includes(topic));
    assert.match(plan.answer, /아직 확인할 수 없어요/);
    assert.doesNotMatch(plan.answer, /규칙 자료|정리되어|저장된|상호작용을 단정/);
    if (question.includes("프리징")) assert.match(plan.answer, /내 챔피언과 상대 챔피언을 알려주면 라인전 조언/);
  });
}
