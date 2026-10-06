import assert from "node:assert/strict";
import { test } from "node:test";
import { loadData } from "../../scripts/llm/kev-agent/lib";
import { translations } from "../../src/i18n/translations";
import { answerDialogue } from "../../src/lib/advisor/dialogueFlow";
import { passiveMechanicPlan } from "../../src/lib/advisor/passiveMechanicPlan";
import { resolveQuestion } from "../../src/lib/advisor/resolvedQuestion";
import { emptyDialogue, type DialogueMemory } from "../../src/lib/advisor/dialogueState";
import type { PlanContext, PlanDeps } from "../../src/lib/advisor/planTypes";
import type { Language } from "../../src/i18n";

const loaded = new Map<Language, ReturnType<typeof loadData>>();
const deps: PlanDeps = { judge: async () => { assert.fail("전환 근거가 있으므로 모델 불필요"); }, search: async () => [] };
function context(lang: Language = "ko_KR", memory?: DialogueMemory): PlanContext {
  if (!loaded.has(lang)) loaded.set(lang, loadData(lang));
  return { data: loaded.get(lang)!, lang, copy: translations[lang].advisor, turns: memory ? [{ role: "assistant", memory }] : [],
    championIds: [], consented: true, canUseModel: true, retrieval: true, judge: "model" };
}

for (const question of [
  "파이크는 체력 템 가면 어떻게되지?",
]) test(question, async () => {
  const { reply } = await answerDialogue(question, context(), deps);
  if (reply.answer?.kind !== "spell") assert.fail("전환 근거가 있는 패시브 카드");
  assert.equal(reply.answer.championId, "Pyke");
  assert.equal(reply.answer.spell.slot, "P");
  assert.match(reply.text, /추가 최대 체력.*추가 공격력.*전환/);
  assert.match(reply.text, /체력 14당 (?:추가 )?공격력 1/);
  assert.doesNotMatch(reply.text, /800%|회복|비축|상대.*알려/);
  assert.deepEqual(reply.answer.facts, []);
});

test("앞선 평타 주제에서 파이크로 바꾸면 전환 근거와 스킬 주인도 바뀐다", async () => {
  const first = await answerDialogue("아크샨 평타 한대만 치면?", context(), deps);
  const pyke = await answerDialogue("파이크는 체력 템 가면 어떻게되지?", context("ko_KR", first.reply.memory), deps);
  assert.equal(pyke.reply.memory.spell?.champion, "Pyke");
  const next = await answerDialogue("그럼 체력템 사면?", context("ko_KR", pyke.reply.memory), deps);
  assert.match(next.reply.text, /체력 14당 (?:추가 )?공격력 1/);
  assert.doesNotMatch(next.reply.text, /아크샨|두 번째 공격/);
});

test("기본 체력은 공격력으로 전환된다고 답하지 않고 원래 스탯을 조회한다", async () => {
  const { reply } = await answerDialogue("파이크 1레벨 체력 얼마야?", context(), deps);
  assert.equal(reply.memory.active, "stat");
  assert.doesNotMatch(reply.text, /전환/);
});

test("블라디미르도 체력 구매와 주문력의 관계를 자기 패시브로 답한다", async () => {
  const { reply } = await answerDialogue("블라디미르 체력템 사면?", context(), deps);
  assert.match(reply.text, /추가 체력 30당 (?:1의 주문력|주문력 1)/);
  assert.match(reply.text, /서로(?: 다시)? 중첩되지/);
  assert.doesNotMatch(reply.text, /전환 비율은 체력 14/);
});

for (const [lang, question, expected] of [
  ["en_US", "What happens if Pyke buys health items?", /cannot gain extra Maximum Health.*Bonus AD/i],
  ["zh_CN", "派克出生命值装备会怎么样？", /无法.*额外最大生命值.*攻击力/],
] as const) test(`${lang} 전환 근거도 현지어로 답한다`, async () => {
  const { reply } = await answerDialogue(question, context(lang), deps);
  if (reply.answer?.kind !== "spell") assert.fail("패시브 카드");
  assert.match(reply.text, expected);
});

for (const question of ["아리 체력템 사면?", "파이크 체력템 뭐가 좋아?", "파이크 Q 쿨타임"]) {
  test(`전환 근거가 없거나 다른 요청이면 강제로 패시브를 보여주지 않는다: ${question}`, () => {
    const ctx = context();
    assert.equal(passiveMechanicPlan(resolveQuestion(question, ctx.data!), ctx), undefined);
  });
}

test("옛 파이크 기억은 다른 주제 뒤에 사용하지 않는다", () => {
  const memory = { ...emptyDialogue(context().data!.patch), active: "rule" as const, champion: "Pyke" };
  const ctx = context("ko_KR", memory);
  assert.equal(passiveMechanicPlan(resolveQuestion("체력템 사면?", ctx.data!), ctx), undefined);
});
