import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { loadData } from "../../scripts/llm/kev-agent/lib";
import { translations } from "../../src/i18n/translations";
import { answerDialogue } from "../../src/lib/advisor/dialogueFlow";
import { dehydrateTurn, reviveTurn } from "../../src/lib/advisor/history";
import type { PlanContext, PlanDeps } from "../../src/lib/advisor/planTypes";

const data = loadData("ko_KR");
const deps: PlanDeps = { judge: async () => { assert.fail("검증된 CC/판정 조회는 모델을 부르지 않는다"); }, search: async () => [] };
const context = (): PlanContext => ({ data, lang: "ko_KR", copy: translations.ko_KR.advisor, turns: [], championIds: [], consented: false, canUseModel: false, retrieval: false, judge: "none" });
interface Story { id: string; turns: Array<{ q: string; contains?: string[]; avoid?: string[] }> }
const corpus: Story[] = JSON.parse(fs.readFileSync("research/llm-evals/crowd-control/questions.json", "utf8"));
const representatives = [
  "ga-smite", "stun-smite", "suppression-smite", "stasis-smite", "cc-none", "cc-multi", "qss-stasis",
  "root-attack", "silence-attack", "ground-walk", "drowsy-slow", "sleep-dot", "blind-vs-nearsight",
  "gw-stack", "gw-shield", "gw-regen", "untargetable-ignite", "champion-skills-regression", "cc-followup",
  "smite-borrowed", "leesin-cleanse-1", "leesin-cleanse-3", "leesin-cleanse-4", "leesin-cleanse-5", "leesin-reverse-sequence",
];
const stories = representatives.map(id => {
  const story = corpus.find(entry => entry.id === id);
  assert.ok(story, `누락된 대표 CC 사례: ${id}`);
  return story;
});
for (const story of stories) test(`실제 대화 흐름: ${story.id}`, async () => {
  const ctx = context();
  for (const [index, turn] of story.turns.entries()) {
    const { reply } = await answerDialogue(turn.q, ctx, deps);
    assert.equal(reply.respond, undefined, turn.q);
    for (const text of turn.contains ?? []) assert.ok(reply.text.includes(text), `${turn.q}: ${text}\n${reply.text}`);
    for (const text of turn.avoid ?? []) assert.ok(!reply.text.includes(text), `${turn.q}: ${text}\n${reply.text}`);
    const restored = reviveTurn(JSON.parse(JSON.stringify(dehydrateTurn({ id: index * 2 + 1, role: "assistant", content: reply.text, answer: reply.answer, answers: reply.answers, memory: reply.memory }))), data)!;
    ctx.turns = [...ctx.turns, { id: index * 2, role: "user", content: turn.q }, restored];
  }
});
for (const [lang, q, expected] of [["en_US", "Can I smite while stunned?", "Suppression and stasis"], ["zh_CN", "被眩晕时能用惩戒吗？", "压制和凝滞"]] as const) {
  test(`판정 노트는 화면 언어로 답한다: ${lang}`, async () => {
    const { reply } = await answerDialogue(q, { ...context(), data: loadData(lang), lang, copy: translations[lang].advisor }, deps);
    assert.ok(reply.text.includes(expected), reply.text);
    assert.doesNotMatch(reply.text, /[가-힣]/);
  });
}
