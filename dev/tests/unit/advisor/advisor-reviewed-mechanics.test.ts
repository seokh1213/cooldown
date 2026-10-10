import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadData } from "../../../scripts/advisor/kev-agent/lib";
import { answerDialogue } from "../../../../src/features/advisor/conversation/dialogueFlow";
import { dehydrateTurn, reviveTurn } from "../../../../src/features/advisor/storage/history";
import { translations } from "../../../../src/shared/i18n/translations";
import type { PlanContext } from "../../../../src/features/advisor/contracts/planTypes";
import { abilityIndex, validMechanicMemory } from "../../../../src/features/advisor/mechanics/types";
import { conversionAmount, questionState } from "../../../../src/features/advisor/mechanics/question";
import { reviewedAbilities } from "../../../scripts/advisor/champion-mechanics/retrieval";

const deps = { judge: async () => { throw new Error("모델을 부르면 안 됩니다"); }, search: async () => [] };
function context(): PlanContext {
  return { data: loadData("ko_KR"), lang: "ko_KR", copy: translations.ko_KR.advisor, turns: [], championIds: [],
    judge: "none", consented: false, canUseModel: false, retrieval: false };
}
async function ask(ctx: PlanContext, question: string) {
  const result = await answerDialogue(question, ctx, deps);
  const turns = [{ id: ctx.turns.length, role: "user" as const, content: question },
    { id: ctx.turns.length + 1, role: "assistant" as const, content: result.reply.text, answer: result.reply.answer, memory: result.reply.memory }];
  ctx.turns = [...ctx.turns, ...turns.flatMap(turn => {
    const restored = reviveTurn(JSON.parse(JSON.stringify(dehydrateTurn(turn))), ctx.data!);
    return restored ? [restored] : [];
  })];
  return result.reply;
}
test("현재 원문과 승인이 유효한 규칙을 빠짐없이 적재하고 다른 패치는 사용하지 않는다", async () => {
  const data = loadData("ko_KR");
  const approved = await reviewedAbilities();
  assert.deepEqual([...data.abilityRules!.keys()].sort(), [...approved.keys()].sort());
  for (const [id, entry] of approved) {
    assert.equal(data.abilityRules!.get(id)?.job.sourceHash, entry.job.sourceHash);
    assert.deepEqual(data.abilityRules!.get(id)?.draft, entry.draft);
  }
  assert.equal(new Set([...data.abilityRules!.values()].map(a => a.job.champion)).size, 173);
  assert.equal(abilityIndex({ schemaVersion: 2, patch: "old", abilities: [...data.abilityRules!.values()] }, data.patch).size, 0);
});
test("쉼표·한글 수치·수치 정정을 계산하고 잘못된 쉼표는 추정하지 않는다", () => {
  assert.equal(conversionAmount("추가 체력 1,400이면?"), 1400);
  assert.equal(conversionAmount("체력 천사백이면?"), 1400);
  assert.equal(conversionAmount("체력 70 아니 210이면?"), 210);
  assert.equal(conversionAmount("기본 체력 670 말고 템으로 체력 70이면?"), 70);
  assert.equal(conversionAmount("체력 1,40이면?"), undefined);
});
test("두 번째 공격의 부정과 쿨 종료의 부정을 뒤집지 않는다", () => {
  assert.equal(questionState("두 번째 안 쏘면?").followupStatus, "cancelled");
  assert.equal(questionState("두 번째까지 쏘면?").followupStatus, "fired");
  assert.equal(questionState("두 발 전부 쏠게. 이속 생겨?").followupStatus, "fired");
  assert.equal(questionState("쿨 끝난 게 아니라면?").shieldReady, "down");
});
test("실제 대화에서 템 개수·정정 수치를 복원하고 챔피언이 바뀌면 수치를 지운다", async () => {
  const ctx = context();
  assert.match((await ask(ctx, "파이크 체력 70짜리 템 두 개면?")).text, /추가 공격력 10/);
  assert.match((await ask(ctx, "아 42로 바꿔줘")).text, /추가 공격력 3/);
  assert.match((await ask(ctx, "그럼 3개면?")).text, /추가 공격력 9/);
  assert.match((await ask(ctx, "블라디미르 패시브 체력 300이면?")).text, /주문력 10/);
  assert.match((await ask(ctx, "그럼 주문력 100이면?")).text, /최대 체력 160/);
  assert.match((await ask(ctx, "파이크 체력 템은?")).text, /추가 체력 14당 추가 공격력 1/);
  assert.doesNotMatch(ctx.turns[ctx.turns.length - 1].content!, /최대 체력 160|추가 공격력 21\.429/);
});
test("확실하지 않은 수치 질문은 잘못된 계산 대신 확인을 요청한다", async () => {
  const reply = await ask(context(), "파이크 체력 70과 체력 210이면 공격력 얼마야?");
  assert.match(reply.text, /수치를 하나로 알려/);
  assert.doesNotMatch(reply.text, /공격력 5|공격력 15/);
});

test("부활의 선행 조건과 지속형 스킬의 마나·피해를 함께 복원한다", async () => {
  const ctx = context();
  const revive = await ask(ctx, "질리언 R은 걸면 바로 부활해?");
  assert.match(revive.text, /치명.*죽을/);
  assert.match(revive.text, /경직.*끝난.*부활/);
  const aura = await ask(ctx, "카서스 E를 켜고 계속 있으면 어떻게 돼?");
  assert.match(aura.text, /초당/);
  assert.match(aura.text, /마법 피해/);
  assert.match(aura.text, /마나.*소모/);
  assert.equal(aura.memory.mechanic?.topic, "activation");
});

test("대상별 피해 차이와 평타 적중의 쿨 반환을 수치 표로 축소하지 않는다", async () => {
  const ctx = context();
  assert.match((await ask(ctx, "이즈리얼 R은 미니언에게도 피해가 같아?")).text, /미니언.*감소/);
  assert.match((await ask(ctx, "우디르 P 각성 쿨은 공격하면 언제 돌려받아?")).text, /적중.*각성.*돌려받/);
});
test("아크샨 발사·취소·대상·쿨 조건은 실제 스킬 카드와 함께 답한다", async () => {
  const ctx = context();
  const cancel = await ask(ctx, "아크샨 평타 한 방 치고 두 번째 안 쏘면?");
  assert.match(cancel.text, /이동 속도/);
  assert.doesNotMatch(cancel.text, /취소 조건에 해당하지/);
  assert.equal(cancel.answer?.kind, "spell");
  if (cancel.answer?.kind === "spell") assert.equal(cancel.answer.championId, "Akshan");
  assert.match((await ask(ctx, "그럼 두 번째까지 쏘면?")).text, /취소 조건에 해당하지/);
  assert.match((await ask(ctx, "두 번째 공격 취소하면 그 공격의 물리 피해는?")).text, /적중 효과는 발생하지/);
  assert.match((await ask(ctx, "그럼 몬스터 세 대 치면 보호막 생겨?")).text, /몬스터는.*챔피언 대상 조건에 해당하지/);
  assert.match((await ask(ctx, "미니언 말고 챔피언 세 대면 보호막?")).text, /보호막/);
  assert.match((await ask(ctx, "쿨 끝난 게 아니라면?")).text, /대기시간이 남아.*해당하지/);
});
test("루시안은 아군 보호막을 받은 조건, 베이가는 처치 관여 5중첩을 누락하지 않는다", async () => {
  const ctx = context();
  assert.match((await ask(ctx, "루시안 패시브 아군한테 보호막 받으면?")).text, /마법 피해/);
  assert.match((await ask(ctx, "루시안 P 아군한테 힐 받으면 평타 어떻게 바뀌어?")).text, /마법 피해/);
  assert.match((await ask(ctx, "베이가 패시브 처치 관여하면 스택 몇 개?")).text, /5/);
});
test("오로라 정령 생성은 챔피언 대상과 3회 적중 조건을 구분하고 복원 뒤에도 유지한다", async () => {
  const ctx = context();
  const minion = await ask(ctx, "오로라 패시브 정령은 미니언 때려도 나오나?");
  assert.equal(minion.answer?.kind, "spell");
  if (minion.answer?.kind === "spell") assert.equal(minion.answer.championId, "Aurora");
  assert.match(minion.text, /정령/);
  assert.match(minion.text, /미니언은.*챔피언 대상 조건에 해당하지/);
  assert.match(minion.text, /3회 이상 적중/);
  assert.doesNotMatch(minion.text, /회복 · 최대 체력 비례 피해|추가 마법 피해를 입힙니다/);
  assert.equal(minion.memory.mechanic?.topic, "summon");
  const champion = await ask(ctx, "그럼 챔피언 세 대 때리면?");
  assert.match(champion.text, /3회 이상 적중.*챔피언/);
  assert.match(champion.text, /영혼이 오로라를 따라다닙니다/);
  assert.match(champion.text, /4초/);
  assert.doesNotMatch(champion.text, /미니언|조건에 해당하지/);
  assert.match((await ask(ctx, "그럼 몬스터 세 대 때리면?")).text, /몬스터는.*챔피언 대상 조건에 해당하지/);
  const first = await ask(ctx, "챔피언 한 대만 때리면?");
  assert.match(first.text, /1회 적중.*3회 적중 조건에 해당하지/);
  assert.doesNotMatch(first.text, /영혼이 오로라를 따라다닙니다/);
});
test("분수 개수와 계산식은 템 한 개로 추정하지 않는다", async () => {
  for (const question of ["파이크 체력 70짜리 템 1.5개면?", "파이크 체력 50+90이면?"]) {
    assert.match((await ask(context(), question)).text, /수치를 하나로/);
  }
});
test("승인 출처가 바뀐 기억은 유효하지 않다", async () => {
  const ctx = context();
  const reply = await ask(ctx, "파이크 체력 70짜리 템이면?");
  assert.ok(reply.memory.mechanic);
  assert.equal(validMechanicMemory({ ...reply.memory.mechanic, sourceHash: "changed" }, ctx.data!.abilityRules), false);
});
test("일반 스탯 조회와 CC 해제 질문은 기존 전문 경로를 유지한다", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => typeof input === "string" && input.startsWith("/data/")
    ? new Response(await readFile(path.join(process.cwd(), "public", input.slice(1)))) : originalFetch(input, init);
  try {
    const ctx = context();
    const stats = await ask(ctx, "오공 1레벨 체력 얼마야?");
    assert.match(stats.text, /610/);
    assert.equal(stats.memory.mechanic, undefined);
    const control = await ask(ctx, "리신 궁은 수은으로 풀려?");
    assert.equal(control.memory.mechanic, undefined);
  } finally { globalThis.fetch = originalFetch; }
});
test("CC 면역 시 체력 비용과 챔피언 부활은 일반 CC·소환사 주문으로 바꾸지 않는다", async () => {
  const ctx = context();
  const health = await ask(ctx, "문도 박사 패시브 CC 막을 때 체력 뭘 잃어?");
  assert.match(health.text, /현재 체력/);
  assert.match(health.text, /4%/);
  assert.match((await ask(ctx, "애니 P는 부활하면 스택이 어떻게 돼?")).text, /준비/);
});
