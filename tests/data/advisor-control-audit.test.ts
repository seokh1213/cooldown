import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { loadData } from "../../scripts/llm/kev-agent/lib";
import { translations } from "../../src/i18n/translations";
import { answerDialogue } from "../../src/lib/advisor/dialogueFlow";
import { dehydrateTurn, reviveTurn } from "../../src/lib/advisor/history";
import type { PlanContext, PlanDeps } from "../../src/lib/advisor/planTypes";
import type { Language } from "../../src/i18n";

const deps: PlanDeps = { judge: async () => { assert.fail("확인된 판정과 자료 부족 안내는 모델을 부르지 않는다"); }, search: async () => [] };
const context = (lang: Language = "ko_KR"): PlanContext => ({ data: loadData(lang), lang, copy: translations[lang].advisor,
  turns: [], championIds: [], consented: false, canUseModel: false, retrieval: false, judge: "none" });

async function ask(ctx: PlanContext, q: string) {
  const { reply } = await answerDialogue(q, ctx, deps);
  assert.equal(reply.respond, undefined, q);
  const restored = reviveTurn(JSON.parse(JSON.stringify(dehydrateTurn({ id: ctx.turns.length + 1, role: "assistant",
    content: reply.text, answer: reply.answer, answers: reply.answers, memory: reply.memory }))), ctx.data!)!;
  ctx.turns = [...ctx.turns, { id: ctx.turns.length, role: "user", content: q }, restored];
  return reply;
}

interface Story { id: string; turns: Array<{ q: string; contains?: string[]; avoid?: string[] }> }
const corpus: Story[] = JSON.parse(fs.readFileSync("research/llm-evals/control-audit/questions.json", "utf8"));
const representatives = [
  "nami-followups", "zoe-followups", "malzahar-followups", "morgana-followups", "leesin-sequence-memory",
  "조이-sleep-sequence", "노틸러스-unknown-order", "모데카이저-수은", "나미-numeric-switch",
  "new-topic-no-stale", "two-champions-ambiguous", "duration-question", "multi-techniques", "borrowed-no-guarantee",
  "self-cc", "no-cc", "advice-kept", "룰루-cc-cooldown", "nami-q-vs-r", "malz-e-no-r-leak", "leesin-e-no-r-leak",
  "graves-area-remains", "nocturne-only-self", "removal-method-missing", "numeric-after-property",
  "generic-control-followup", "generic-root-followup", "same-champion-whole-kit",
  "new-guardian-angel-topic", "new-suppression-topic", "new-ignite-topic",
];
const stories = representatives.map(id => {
  const story = corpus.find(entry => entry.id === id);
  assert.ok(story, `누락된 대표 CC 대화: ${id}`);
  return story;
});
for (const story of stories) test(`CC 전반 점검: ${story.id}`, async () => {
  const ctx = context();
  for (const turn of story.turns) {
    const reply = await ask(ctx, turn.q);
    for (const text of turn.contains ?? []) assert.ok(reply.text.includes(text), `${turn.q}: ${text}\n${reply.text}`);
    for (const text of turn.avoid ?? []) assert.ok(!reply.text.includes(text), `${turn.q}: ${text}\n${reply.text}`);
  }
});

test("모든 스킬의 CC 조회 뒤 해제 질문은 같은 챔피언·슬롯을 유지한다", async () => {
  const base = context();
  const failures: string[] = [];
  for (const card of base.data!.cards) for (const spell of card.spells) {
    const ctx = { ...base, turns: [] };
    const slot = spell.slot === "P" ? "패시브" : spell.slot;
    await ask(ctx, `${card.name} ${slot} CC 종류 알려줘`);
    const reply = await ask(ctx, "그럼 정화는?");
    if (!reply.text.includes(card.name) || reply.memory?.control?.champions[0] !== card.id
      || reply.memory.control.slot !== spell.slot) failures.push(`${card.id}:${spell.slot} — ${reply.text.slice(0,100)}`);
    if (spell.crowdControl?.status !== "known" && /해제할 수 있습니다/.test(reply.text)) failures.push(`${card.id}:${spell.slot}: 미확인 판정 단정`);
  }
  assert.deepEqual(failures, []);
});

for (const [lang, questions, expected] of [
  ["en_US", ["Nami Q crowd control?", "Can QSS remove it?", "What about tenacity?"], ["Nami", "QSS", "Tenacity"]],
  ["zh_CN", ["娜美Q是什么控制？", "那水银能解除吗？", "韧性呢？"], ["唤潮鲛姬", "水银", "韧性"]],
] as const) test(`다른 언어에서도 판정 후속 질문의 대상 유지: ${lang}`, async () => {
  const ctx = context(lang);
  for (const [index, q] of questions.entries()) {
    const reply = await ask(ctx, q);
    assert.ok(reply.text.includes(expected[index]), reply.text);
    assert.doesNotMatch(reply.text, /[가-힣]/);
    assert.equal(reply.memory?.control?.champions[0], "Nami");
    assert.equal(reply.memory.control.slot, "Q");
  }
});
