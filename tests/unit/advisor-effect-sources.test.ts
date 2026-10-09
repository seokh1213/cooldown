import assert from "node:assert/strict";
import test from "node:test";
import { loadData } from "../../scripts/llm/kev-agent/lib";
import { translations } from "../../src/i18n/translations";
import { answerDialogue } from "../../src/lib/advisor/dialogueFlow";
import { answerProse } from "../../src/lib/advisor/prose";
import { buildSpellAnswer } from "../../src/lib/advisor/spellAnswer";
import { emptyDialogue } from "../../src/lib/advisor/dialogueState";
import { effectSourcesPlan } from "../../src/lib/advisor/mechanics/effectSources";
import { resolveQuestion } from "../../src/lib/advisor/resolvedQuestion";
import type { PlanContext } from "../../src/lib/advisor/planTypes";

function context(): PlanContext {
  return { data: loadData("ko_KR"), lang: "ko_KR", copy: translations.ko_KR.advisor, turns: [], championIds: [],
    judge: "none", consented: false, canUseModel: false, retrieval: false };
}
const deps = { judge: async () => { throw new Error("모델을 부르면 안 됩니다"); }, search: async () => [] };

test("스킬 답문은 세 언어에서 챔피언·슬롯·스킬명을 항상 밝힌다", () => {
  for (const lang of ["ko_KR", "en_US", "zh_CN"] as const) {
    const data = loadData(lang);
    for (const id of ["Yuumi", "Lux", "JarvanIV"]) {
      const card = data.cardById.get(id)!;
      for (const spell of card.spells) {
        for (const question of [`${card.name} ${spell.slot}`, `${card.name} ${spell.slot} ${lang === "ko_KR" ? "회복" : lang === "en_US" ? "heal" : "治疗"}`]) {
          const answer = buildSpellAnswer(card, spell, question, lang);
          if (answer.kind !== "spell") continue;
          assert.ok(answerProse(answer, lang).includes(`${card.name} ${spell.slot} ${spell.name}`), `${lang} ${id} ${spell.slot}`);
        }
      }
    }
  }
});

test("Q 적중 회복은 소환사 주문 대신 발동하는 패시브와 조건을 설명한다", async () => {
  const ctx = context();
  const { reply } = await answerDialogue("유미 Q 맞춰도 힐 안되나?", ctx, deps);
  assert.match(reply.text, /Q 사르르탄.*P 야옹이 친구/);
  assert.match(reply.text, /### 유미 P 야옹이 친구/);
  assert.match(reply.text, /챔피언.*재사용 대기시간이 준비됨/);
  assert.match(reply.text, /4초/);
  assert.doesNotMatch(reply.text, /반경 200|최근 35초|파동마다/);
  assert.deepEqual(reply.memory.spell, { champion: "Yuumi", slot: "Q" });
});

test("궁에만 회복이 있는지 물으면 각 효과의 소속을 함께 보여준다", async () => {
  const { reply } = await answerDialogue("유미 Q 맞춰도 힐 안되나? 유미는 궁에만 힐이 있나?", context(), deps);
  for (const title of ["유미 P 야옹이 친구", "유미 W 너랑 유미랑!", "유미 R 대단원"]) assert.ok(reply.text.includes(`### ${title}`));
  assert.match(reply.text, /단짝은 적중 시 체력을 회복/);
  assert.match(reply.text, /아군 챔피언은 파동마다 체력을 회복/);
  assert.match(reply.text, /초과 회복량은 보호막/);
  assert.doesNotMatch(reply.text, /반경 200|최근 35초/);
});

test("회복 외 효과의 스킬 범위도 자료에서 찾으며 소환사 주문 질문을 가로채지 않는다", () => {
  const ctx = context();
  const plan = effectSourcesPlan(resolveQuestion("럭스는 궁에만 보호막이 있어?", ctx.data!), ctx, emptyDialogue(""));
  assert.ok(plan?.type === "code" && typeof plan.answer === "string");
  assert.match(plan.answer, /### 럭스 W 프리즘 보호막/);
  assert.doesNotMatch(plan.answer, /### 럭스 R/);
  for (const question of ["유미 Q랑 소환사 주문 회복은?", "유미 Q 맞추면 콩콩이 힐이 돼?", "유미 Q 맞추면 회복 감소가 적용돼?"]) {
    assert.equal(effectSourcesPlan(resolveQuestion(question, ctx.data!), ctx, emptyDialogue("")), undefined);
  }
});

test("특정 챔피언 이름 없이 연결된 패시브를 찾으며 기본 공격 전용 효과를 스킬 효과로 바꾸지 않는다", () => {
  const ctx = context();
  const original = ctx.data!.cardById.get("Yuumi")!;
  const card = { ...original, id: "Fixture", name: "시험 챔피언" };
  const rules = new Map([...ctx.data!.abilityRules!].filter(([id]) => id.startsWith("Yuumi.")).map(([id, ability]) => {
    const copy = structuredClone(ability);
    copy.job.id = id.replace("Yuumi", card.id);
    copy.job.champion = card.id;
    return [copy.job.id, copy] as const;
  }));
  ctx.data = { ...ctx.data!, cards: [card], cardById: new Map([[card.id, card]]), abilityRules: rules };
  const input = { ...resolveQuestion("유미 Q 맞추면 힐이 돼?", loadData("ko_KR")), champions: [card] };
  const plan = effectSourcesPlan(input, ctx, emptyDialogue(""));
  assert.ok(plan?.type === "code" && typeof plan.answer === "string" && plan.answer.includes("### 시험 챔피언 P"));
  rules.get("Fixture.P")!.draft.rules.forEach(rule => { rule.trigger.event = "attack"; });
  assert.equal(effectSourcesPlan(input, ctx, emptyDialogue("")), undefined);
});
