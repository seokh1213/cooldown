import assert from "node:assert/strict";
import { test } from "node:test";
import { loadData } from "../../scripts/llm/kev-agent/lib";
import { translations } from "../../src/i18n/translations";
import { planAnswer, type PlanContext } from "../../src/lib/advisor/plan";
import { planDialogue } from "../../src/lib/advisor/dialoguePlanner";
import { conditionOwner } from "../../src/lib/advisor/dialogueRequest";
import { emptyDialogue } from "../../src/lib/advisor/dialogueState";
import { resolveQuestion } from "../../src/lib/advisor/resolvedQuestion";
import { docAnswer } from "../../src/lib/advisor/questionDocs";

for (const [lang, question, champion, slot, value] of [
  ["ko_KR", "제드 궁 사거리", "Zed", "R", "625"],
  ["en_US", "ahri q range", "Ahri", "Q", "970"],
  ["zh_CN", "阿狸 Q 射程", "Ahri", "Q", "970"],
] as const) test(`${lang} 명시적 수치 조회는 판정과 검색을 생략한다`, async () => {
  const ctx: PlanContext = { data: loadData(lang), lang, copy: translations[lang].advisor, turns: [], championIds: [], consented: true, canUseModel: true, retrieval: true, judge: "model" };
  const deps = { judge: async () => { assert.fail("판정 불필요"); }, search: async () => { assert.fail("검색 불필요"); } };
  const plan = await planAnswer(question, ctx, deps);
  if (plan.type !== "card" || plan.answer.kind !== "spell") assert.fail("스킬 카드");
  assert.equal(plan.answer.championId, champion);
  assert.equal(plan.answer.spell.slot, slot);
  assert.equal(plan.answer.headline?.value, value);
});

const lang = "ko_KR";
const ctx: PlanContext = { data: loadData(lang), lang, copy: translations[lang].advisor, turns: [], championIds: [], consented: true, canUseModel: true, retrieval: true, judge: "model" };
test("실제 대화 경로에서도 바론의 미검수 공격력은 생성 시간으로 답하지 않는다", async () => {
  const question = "바론 공격력 얼마야?";
  const deps = { judge: async () => { assert.fail("판정 불필요"); }, search: async () => { assert.fail("검색 불필요"); } };
  const dialogue = await planDialogue(question, { ...ctx, judge: "none", canUseModel: false }, deps, "combined");
  const plan = dialogue.parts[0].plan;
  if (plan.type !== "code" || typeof plan.answer !== "string") assert.fail("자료 미확인 안내");
  assert.match(plan.answer, /검수된 자료가 없어/);
  assert.doesNotMatch(plan.answer, /20분/);
  assert.match(docAnswer(ctx.data!, lang, "meta:baron", question) as string, /검수된 자료가 없어/);
});

test("감전 쿨타임은 벡터 검색과 갈래 판정을 건너뛴다", async () => {
  const deps = { judge: async () => { assert.fail("판정 불필요"); }, search: async () => { assert.fail("검색 불필요"); } };
  const dialogue = await planDialogue("감전 쿨타임", ctx, deps, "combined");
  const plan = dialogue.parts[0].plan;
  if (plan.type !== "card" || plan.answer.kind !== "rule") assert.fail("룬 카드");
  assert.match(plan.answer.highlighted.join(" "), /20/);
});
test("쿨타임 낱말이 포함된 교전 조언은 명시 조회로 강제하지 않는다", async () => {
  let judged = 0;
  const deps = { judge: async () => { judged++; throw new Error("테스트 판정 실패"); }, search: async () => [] };
  await planAnswer("피오라 W 쿨타임 빠졌으면 들어가도 돼?", ctx, deps);
  assert.ok(judged > 0);
});
test("Rumble의 R과 영어 소문자 슬롯을 구별해 조건 주인을 찾는다", () => {
  const memory = { ...emptyDialogue(ctx.data!.patch), matchup: { mine: "Rumble", enemy: "MonkeyKing" } };
  assert.equal(conditionOwner(resolveQuestion("Rumble e 빠졌어", ctx.data!), memory, ctx), "mine");
});
