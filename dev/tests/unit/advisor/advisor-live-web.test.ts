import assert from "node:assert/strict";
import test from "node:test";
import { loadData } from "../../../scripts/advisor/kev-agent/lib";
import { answerDialogue } from "../../../../src/features/advisor/conversation/dialogueFlow";
import { translations } from "../../../../src/shared/i18n/translations";
import type { PlanContext } from "../../../../src/features/advisor/contracts/planTypes";
import { penetrationCalculation } from "../../../../src/features/advisor/conversation/planning/dialogueRules";
import { spellSummary } from "../../../../src/features/advisor/answers/answer";
import { correctNames } from "../../../../src/features/advisor/understanding/champions/championNames";

const data = loadData("ko_KR");
const deps = { judge: async () => { throw Error("Unexpected model call"); }, search: async () => [] };
function context(): PlanContext {
  return { data, lang: "ko_KR", copy: translations.ko_KR.advisor, turns: [], championIds: ["MonkeyKing"],
    judge: "none", consented: false, canUseModel: false, retrieval: false };
}
async function ask(ctx: PlanContext, question: string) {
  const { reply } = await answerDialogue(question, ctx, deps);
  ctx.turns = [...ctx.turns, { role: "user", content: question },
    { role: "assistant", content: reply.text, answer: reply.answer, memory: reply.memory }];
  return reply;
}

test("발사·취소 조건 뒤의 새 적중 횟수는 이전 발사 상태를 상속하지 않는다", async () => {
  const overviewContext = context();
  const overview = await ask(overviewContext, "아크샨은 평타 한대 치면 어떻게되지?");
  assert.match(overview.text, /추가 공격.*취소하면.*이동 속도/);
  await ask(overviewContext, "도란의 검 가격은?");
  assert.match((await ask(overviewContext, "평타 한대 치면 어떻게 돼?")).text, /추가 공격.*취소하면.*이동 속도/);
  for (const count of ["세", "3"]) {
    const ctx = context();
    await ask(ctx, "아크샨 평타 한 방 치고 두 번째 안 쏘면?");
    assert.match((await ask(ctx, "그럼 두 발 전부 쏠게. 이속 생겨?")).text, /취소 조건에 해당하지/);
    const reply = await ask(ctx, `그럼 평타 ${count}대 맞추면?`);
    assert.match(reply.text, /마법 피해/);
    assert.match(reply.text, /보호막/);
    assert.doesNotMatch(reply.text, /취소 조건에 해당하지/);
    const firstHit = await ask(ctx, "그럼 평타 한 대만 맞추면?");
    assert.match(firstHit.text, /1회 적중.*3회 적중 조건에 해당하지/);
    assert.doesNotMatch(firstHit.text, /이동 속도를 얻|마법 피해를 준다/);
  }
});

test("자연어 수치 정정은 전환 계산을 이어 가되 명시한 새 룬은 보존한다", async () => {
  for (const [champion, amount, expected] of [["파이크", 42, /추가 공격력 3/], ["파이크", 98, /추가 공격력 7/],
    ["블라디미르", 90, /주문력 3/]] as const) {
    const ctx = context();
    const first = await ask(ctx, `${champion} 체력 300이면 공격력이나 주문력 얼마나 늘어?`);
    assert.ok(first.memory.mechanic);
    assert.match((await ask(ctx, `아 아니 추가 체력 ${amount}로 정정할게`)).text, expected);
    const rune = await ask(ctx, "아 아니 비스킷 배달 룬 효과 알려줘");
    assert.match(rune.text, /비스킷/);
    assert.doesNotMatch(rune.text, /추가 공격력 7|주문력 3/);
  }
});

test("방관 약어와 비율 앞뒤 표현은 같은 공식으로 계산한다", () => {
  const ctx = context();
  for (const [q, value] of [
    ["방어력 100 상대로 방관 30%에 고정 방관 10이면 최종 방어력?", 60],
    ["방어력 200에 관통 25%와 고정 관통 15면?", 135],
    ["방어력이 80이면 20% 방관과 고정 방관 5 계산해줘", 59],
  ] as const) {
    const plan = penetrationCalculation(q, ctx);
    assert.equal(plan?.type, "code");
    if (plan?.type === "code") assert.match(String(plan.answer), new RegExp(`= ${value}입니다`));
  }
  for (const q of ["방어력 100에 방관 30% 20%와 고정 방관 10", "방어력 100에 방관 120%와 고정 방관 10",
    "방어력 -100에 방관 30%와 고정 방관 10", "방어력 100에 방관 30%와 고정 방관 -10",
    "방어력 100과 방어력 200에 방관 30%와 고정 방관 10", "방어력 100에 방관 30%와 고정 방관 10%"])
    assert.equal(penetrationCalculation(q, ctx), undefined, q);
});

test("명시한 영어 라인전 질문은 이전 능력치 조회를 종료한다", async () => {
  const ctx = context();
  await ask(ctx, "아리 6레벨 방어력과 마법 저항력 알려줘");
  const reply = await ask(ctx, "How should I lane as Ahri against Fizz?");
  assert.doesNotMatch(reply.text, /방어력 \(6레벨\)|마법 저항력 \(6레벨\)/);
  assert.equal(reply.memory.active, "matchup");
  if (reply.answer?.kind === "compare") assert.equal(reply.answer.statQuery, undefined);
  const stat = await ask(ctx, "아리와 피즈 6레벨 방어력 비교해줘");
  assert.equal(stat.answer?.kind, "compare");
});

test("한국어 수식 표시는 번역하고 참고 요약은 상세 툴팁을 우선할 수 있다", async () => {
  const reply = await ask(context(), "아크샨 평타 한 방 치고 두 번째 안 쏘면?");
  assert.match(reply.text, /100% 추가 공격 속도/);
  assert.doesNotMatch(reply.text, /Move Speed|Attack Speed/);
  const spell = data.cardById.get("Akshan")!.spells.find(spell => spell.slot === "P")!;
  assert.match(spellSummary(spell, true), /두 번째 공격/);
  assert.doesNotMatch(spellSummary(spell, true), /세 번.*물리 피해/);
  assert.match(spell.text, /세 번째.*마법 피해/);
});

test("능력치·레벨 앞 이름 오타는 화면 챔피언으로 몰래 대체하지 않는다", async () => {
  for (const q of ["아니 체력도 같이", "파이크 체력템 가면 체력이랑 공격력 둘 다 늘어?", "부활 직후 이동 속도 버프는 몇 퍼센트야?"])
    assert.equal(correctNames(q, data).text, q);
  for (const q of ["가랜 6렙 방어력이랑 마저 좀", "가랜 방어력 알려줘", "럭쓰 11레벨 체력 알려줘"]) {
    const reply = await ask(context(), q);
    assert.doesNotMatch(reply.text, /오공/);
    assert.ok(reply.answer?.kind === "suggestion" || /가렌|럭스/.test(reply.text), reply.text);
  }
  for (const q of ["그럼 6렙 방어력은?", "기본 방어력 알려줘", "지금 6렙 체력은?"]) {
    const reply = await ask(context(), q);
    assert.notEqual(reply.answer?.kind, "suggestion");
  }
  const ctx = context();
  await ask(ctx, "오공 문도 체력 비교");
  await ask(ctx, "체력회복량은 둘다 어떻게되지?");
  const corrected = await ask(ctx, "아니 체력도 같이");
  assert.equal(corrected.answer?.kind, "compare");
  if (corrected.answer?.kind === "compare") {
    assert.deepEqual(corrected.answer.statQuery?.champions, ["MonkeyKing", "DrMundo"]);
    assert.deepEqual(corrected.answer.statQuery?.fields, ["healthRegen", "health"]);
  }
});
