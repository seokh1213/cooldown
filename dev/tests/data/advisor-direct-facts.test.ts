import assert from "node:assert/strict";
import { test } from "node:test";
import { loadData } from "../../scripts/advisor/kev-agent/lib";
import { translations } from "../../../src/shared/i18n/translations";
import { planAnswer, type PlanContext } from "../../../src/features/advisor/application/plan";
import { planDialogue } from "../../../src/features/advisor/conversation/dialoguePlanner";
import { conditionOwner } from "../../../src/features/advisor/conversation/dialogueRequest";
import { emptyDialogue } from "../../../src/features/advisor/conversation/dialogueState";
import { resolveQuestion } from "../../../src/features/advisor/understanding/resolvedQuestion";
import { docAnswer } from "../../../src/features/advisor/retrieval/questionDocs";

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
test("실제 대화와 검색 경로에서 바론의 검수된 레벨별 공격력으로 답한다", async () => {
  const question = "바론 공격력 얼마야?";
  const deps = { judge: async () => { assert.fail("판정 불필요"); }, search: async () => { assert.fail("검색 불필요"); } };
  const dialogue = await planDialogue(question, { ...ctx, judge: "none", canUseModel: false }, deps, "combined");
  const plan = dialogue.parts[0].plan;
  if (plan.type !== "code" || typeof plan.answer !== "string") assert.fail("몬스터 수치 답변");
  assert.match(plan.answer, /350\.5–515/);
  assert.doesNotMatch(plan.answer, /20분/);
  assert.match(docAnswer(ctx.data!, lang, "meta:baron", question) as string, /350\.5–515/);
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
