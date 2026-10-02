import assert from "node:assert/strict";
import { test } from "node:test";
import { loadData } from "../../scripts/llm/kev-agent/lib";
import { translations } from "../../src/i18n/translations";
import { answerDialogue } from "../../src/lib/advisor/dialogueFlow";
import { planAnswer } from "../../src/lib/advisor/plan";
import { emptyDialogue, type DialogueMemory } from "../../src/lib/advisor/dialogueState";
import { dehydrateTurn, reviveTurn } from "../../src/lib/advisor/history";
import type { Language } from "../../src/i18n";
import type { PlanContext, PlanDeps } from "../../src/lib/advisor/planTypes";
import { passiveMechanicPlan } from "../../src/lib/advisor/passiveMechanicPlan";
import { resolveQuestion } from "../../src/lib/advisor/resolvedQuestion";

const loaded = new Map<Language, ReturnType<typeof loadData>>();
const deps: PlanDeps = {
  judge: async () => { assert.fail("근거가 있는 평타 판정에는 모델이 필요 없다"); },
  search: async () => { assert.fail("패시브 본문이 있으므로 검색이 필요 없다"); },
};
function context(lang: Language = "ko_KR", memory?: DialogueMemory): PlanContext {
  if (!loaded.has(lang)) loaded.set(lang, loadData(lang));
  return { data: loaded.get(lang)!, lang, copy: translations[lang].advisor,
    turns: memory ? [{ role: "assistant", memory }] : [], championIds: [],
    consented: true, canUseModel: true, retrieval: true, judge: "model" };
}

for (const question of [
  "아크샨은 평타 한대 치면 어떻게되지?",
  "아크샨은 평타 한대 치면 어떻게되지? (내가 할 때)",
  "아크샨 평타 한 대만 치면?",
  "아크샨 평타 1대 치고 움직이면 뭐가 달라져?",
  "아크샨 두 번째 공격 취소하면?",
  "아크샨 평타 한대만 치면 이속 빨라져?",
]) test(question, async () => {
  const { reply } = await answerDialogue(question, context(), deps);
  assert.equal(reply.answer?.kind, "spell");
  if (reply.answer?.kind !== "spell") assert.fail("패시브 카드여야 한다");
  assert.equal(reply.answer.spell.slot, "P");
  assert.match(reply.text, /두 번째 공격.*취소하면 이동 속도/);
  assert.doesNotMatch(reply.text, /플레이할 때|상대할 때|악당|부활|세 번째/);
});

test("직접 계획기와 앱의 대화 계획기는 같은 평타 근거를 쓴다", async () => {
  const plan = await planAnswer("아크샨 평타 한대만 치면?", context(), deps);
  if (plan.type !== "card" || plan.answer.kind !== "spell") assert.fail("패시브 카드");
  assert.match(plan.answer.highlighted.join(" "), /취소하면 이동 속도/);
});

test("세 번째 적중 질문은 이동 속도 대신 추가 피해와 보호막을 답한다", async () => {
  const { reply } = await answerDialogue("아크샨 평타 세대 맞추면 어떻게 돼?", context(), deps);
  assert.match(reply.text, /세 번째.*마법 피해/);
  assert.match(reply.text, /대상이 챔피언.*보호막/);
  assert.doesNotMatch(reply.text, /취소하면 이동 속도|악당/);
});

test("한 대만 때려도 보호막이 생기는지 물으면 세 번째 적중 조건을 보여준다", async () => {
  const { reply } = await answerDialogue("아크샨 평타 한대만 치면 보호막 생겨?", context(), deps);
  assert.match(reply.text, /세 번째.*마법 피해/);
  assert.match(reply.text, /대상이 챔피언.*보호막/);
  assert.doesNotMatch(reply.text, /취소하면 이동 속도/);
});

test("저장 복원 뒤 이름을 생략한 평타 질문도 같은 패시브를 유지한다", async () => {
  const first = await answerDialogue("아크샨 평타 한대만 치면?", context(), deps);
  const saved = dehydrateTurn({ id: 1, role: "assistant", content: first.reply.text,
    answer: first.reply.answer, memory: first.reply.memory });
  const restored = reviveTurn(JSON.parse(JSON.stringify(saved)), context().data!)!;
  const next = await answerDialogue("그럼 평타 세대 맞추면?", { ...context(), turns: [restored] }, deps);
  assert.match(next.reply.text, /세 번째.*마법 피해/);
  assert.match(next.reply.text, /보호막/);
  assert.equal(next.reply.memory.spell?.champion, "Akshan");
});

for (const [lang, question, expected] of [
  ["en_US", "What happens if Akshan auto attacks once?", /cancel.*(?:move|movement) speed/i],
  ["zh_CN", "阿克尚只普攻一下会怎么样？", /取消.*移动速度/],
] as const) test(`${lang} 평타 질문도 해당 언어의 패시브로 답한다`, async () => {
  const { reply } = await answerDialogue(question, context(lang), deps);
  if (reply.answer?.kind !== "spell") assert.fail("패시브 카드");
  assert.equal(reply.answer.spell.slot, "P");
  assert.match(reply.text, expected);
});

for (const [question, champion, expected] of [
  ["세트 평타 한대 치면 어떻게 돼?", "Sett", /왼쪽 주먹.*오른쪽 주먹/],
  ["마스터 이 평타 네대 치면 어떻게 돼?", "MasterYi", /4번째.*2번/],
  ["루시안 스킬 쓰고 평타 한대 치면?", "Lucian", /스킬을 사용한 후.*두 번/],
] as const) test(`다른 챔피언도 자기 패시브의 조건을 보존한다: ${question}`, async () => {
  const { reply } = await answerDialogue(question, context(), deps);
  if (reply.answer?.kind !== "spell") assert.fail("패시브 카드");
  assert.equal(reply.answer.championId, champion);
  assert.match(reply.text, expected);
});

test("명시한 Q 질문을 평타 패시브로 바꾸지 않는다", async () => {
  const { reply } = await answerDialogue("아크샨 Q 이동 속도 효과", { ...context(), judge: "none" }, { ...deps, search: async () => [] });
  if (reply.answer?.kind !== "spell") assert.fail("Q 카드");
  assert.equal(reply.answer.spell.slot, "Q");
});

test("기본 이동 속도 조회는 패시브 효과로 바꾸지 않는다", async () => {
  const { reply } = await answerDialogue("아크샨 1레벨 이속 얼마야?", context(), deps);
  assert.match(reply.text, /330/);
  assert.equal(reply.memory.active, "stat");
});

for (const question of [
  "아크샨 평타 한대 치면 감전 터지나?",
  "아크샨 평타 한대만 치면 몰락한 왕의 검 발동해?",
  "아크샨 평타 한대 치고 들어가도 돼?",
  "아크샨 평타 한대만 치는 게 좋아?",
  "아크샨 평타 한대 사거리 얼마야?",
  "아크샨 평타 한대에 둔화 있어?",
]) test(`패시브를 근거로 다른 질문을 대신 답하지 않는다: ${question}`, () => {
  const ctx = context();
  assert.equal(passiveMechanicPlan(resolveQuestion(question, ctx.data!), ctx), undefined);
});

test("다른 주제 뒤에는 이전 아크샨을 평타 질문에 몰래 붙이지 않는다", async () => {
  const memory = { ...emptyDialogue(context().data!.patch), active: "item" as const, champion: "Akshan", item: "1036" };
  const { reply } = await answerDialogue("평타 한대 치면 어떻게 돼?", { ...context("ko_KR", memory), judge: "none" }, { ...deps, search: async () => [] });
  assert.notEqual(reply.memory.active, "spell");
  assert.doesNotMatch(reply.text, /두 번째 공격.*취소/);
});
