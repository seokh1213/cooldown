import assert from "node:assert/strict";
import test from "node:test";
import { loadData } from "../../../scripts/advisor/kev-agent/lib";
import { translations } from "../../../../src/shared/i18n/translations";
import { answerDialogue } from "../../../../src/features/advisor/conversation/dialogueFlow";
import { answerProse } from "../../../../src/features/advisor/answers/presentation/prose";
import { buildSpellAnswer } from "../../../../src/features/advisor/answers/builders/spellAnswer";
import { emptyDialogue } from "../../../../src/features/advisor/conversation/memory/dialogueState";
import { effectSourcesPlan } from "../../../../src/features/advisor/mechanics/effectSources";
import { resolveQuestion } from "../../../../src/features/advisor/understanding/resolvedQuestion";
import type { PlanContext } from "../../../../src/features/advisor/contracts/planTypes";
import { groupReferenceAnswers } from "../../../../src/features/advisor/answers/references/referenceGroups";

function context(): PlanContext {
  return { data: loadData("ko_KR"), lang: "ko_KR", copy: translations.ko_KR.advisor, turns: [], championIds: [],
    judge: "none", consented: false, canUseModel: false, retrieval: false };
}
const deps = { judge: async () => { throw new Error("모델을 부르면 안 됩니다"); }, search: async () => [] };

test("챔피언의 회복·보호막 질문은 소환사 주문 대신 해당 효과가 있는 스킬을 찾는다", async () => {
  for (const [question, titles] of [
    ["유미 스킬에 회복이 있어?", ["유미 P 야옹이 친구", "유미 W 너랑 유미랑!", "유미 R 대단원"]],
    ["유미 스킬 중에 힐하는 게 뭐야?", ["유미 P 야옹이 친구", "유미 W 너랑 유미랑!", "유미 R 대단원"]],
    ["럭스 스킬에 보호막이 있어?", ["럭스 W 프리즘 보호막"]],
  ] as const) {
    const { reply } = await answerDialogue(question, context(), deps);
    for (const title of titles) assert.ok(reply.text.includes(`### ${title}`), `${question}: ${reply.text}`);
    assert.doesNotMatch(reply.text, /반경 200|최근 35초/);
    const groups = groupReferenceAnswers(reply.answers ?? []);
    assert.equal(groups.length, 1, question);
    assert.deepEqual(groups[0].answers.map(answer => answer.kind === "spell" && `${answer.championName} ${answer.spell.slot} ${answer.spell.name}`), titles);
  }
});

test("소환사 주문으로 잘못 답한 과거 대화에서도 스킬 범위 정정은 원래 회복 질문을 잇는다", async () => {
  for (const question of ["아니 유미 스킬중에", "아니 스킬 중에"]) {
    const ctx = context();
    ctx.turns = [{ role: "user", content: "유미 스킬에 회복이 있어?" },
      { role: "assistant", content: "회복은 반경 200 안에서 아군을 찾습니다.",
        memory: { ...emptyDialogue(ctx.data!.patch), active: "rule", rule: { title: "회복", text: "소환사 주문" } } }];
    const { reply } = await answerDialogue(question, ctx, deps);
    for (const title of ["유미 P 야옹이 친구", "유미 W 너랑 유미랑!", "유미 R 대단원"]) assert.ok(reply.text.includes(`### ${title}`), reply.text);
    assert.doesNotMatch(reply.text, /반경 200|최근 35초|### 유미 Q|### 유미 E/);
  }
});

test("효과 조회를 이어도 명시한 새 질문과 소환사 주문 조회는 유지한다", async () => {
  const ctx = context();
  const question = "유미 스킬에 회복이 있어?";
  const { reply } = await answerDialogue(question, ctx, deps);
  ctx.turns = [{ role: "user", content: question }, { role: "assistant", content: reply.text, memory: reply.memory }];
  assert.match((await answerDialogue("그럼 보호막은?", ctx, deps)).reply.text, /### 유미 E 슈우우웅/);
  assert.match((await answerDialogue("아니 유미 Q 쿨타임은?", ctx, deps)).reply.text, /유미 Q 사르르탄.*재사용 대기시간/s);
  assert.equal(effectSourcesPlan(resolveQuestion("아니 유미 스킬 전체 설명해줘", ctx.data!), ctx, reply.memory), undefined);
  assert.equal(effectSourcesPlan(resolveQuestion("유미 소환사 주문 회복은?", ctx.data!), ctx, reply.memory), undefined);
  const missing = (await answerDialogue("이즈리얼 스킬에 회복이 있어?", context(), deps)).reply;
  assert.match(missing.text, /이즈리얼.*회복.*확인하지 못/);
  assert.doesNotMatch(missing.text, /반경 200|최근 35초/);
  assert.equal(missing.answers?.length, 1);
  assert.ok(missing.answers?.[0].kind === "champion" && missing.answers[0].card.id === "Ezreal");
});

test("새 챔피언의 효과를 이어 물으면 오래된 다른 챔피언 스킬로 돌아가지 않는다", async () => {
  const ctx = context();
  for (const question of ["럭스 Q 속박은?", "유미 스킬에 회복이 있어?"]) {
    const { reply } = await answerDialogue(question, ctx, deps);
    ctx.turns = [...ctx.turns, { role: "user", content: question }, { role: "assistant", content: reply.text, memory: reply.memory }];
  }
  const { reply } = await answerDialogue("그럼 보호막은?", ctx, deps);
  assert.match(reply.text, /### 유미 E 슈우우웅/);
  assert.doesNotMatch(reply.text, /럭스/);
});

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
  assert.match(reply.text, /회복량: \*\*20~110\*\*/);
  assert.match(reply.text, /재사용 대기시간: \*\*20~8초\*\*/);
  assert.equal(reply.text.split("\n").filter(line => line.startsWith("- ")).length, 2);
  assert.doesNotMatch(reply.text, /\n계수 \(주문력\):/);
  assert.doesNotMatch(reply.text, /반경 200|최근 35초|파동마다/);
  assert.deepEqual(reply.memory.spell, { champion: "Yuumi", slot: "Q" });
  assert.deepEqual(reply.answers?.map(answer => answer.kind === "spell" && answer.spell.slot), ["P"]);
});

test("궁에만 회복이 있는지 물으면 각 효과의 소속을 함께 보여준다", async () => {
  const { reply } = await answerDialogue("유미 Q 맞춰도 힐 안되나? 유미는 궁에만 힐이 있나?", context(), deps);
  for (const title of ["유미 P 야옹이 친구", "유미 W 너랑 유미랑!", "유미 R 대단원"]) assert.ok(reply.text.includes(`### ${title}`));
  assert.match(reply.text, /단짝은 적중 시 체력을 회복/);
  assert.match(reply.text, /아군 챔피언은 파동마다 체력을 회복/);
  assert.match(reply.text, /초과 회복량은 보호막/);
  assert.match(reply.text, /회복량: \*\*3\/4\/5\/6\/7\*\*/);
  assert.match(reply.text, /회복량: \*\*30\/50\/70\*\*/);
  assert.doesNotMatch(reply.text, /파동 회복의 초과분은 대신 보호막/);
  assert.doesNotMatch(reply.text, /반경 200|최근 35초/);
  assert.deepEqual(reply.answers?.map(answer => answer.kind === "spell" && answer.spell.slot), ["P", "W", "R"]);
  assert.equal(groupReferenceAnswers(reply.answers ?? []).length, 1);
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
