import assert from "node:assert/strict";
import { test } from "node:test";
import { loadData } from "../../scripts/llm/kev-agent/lib";
import { translations } from "../../src/i18n/translations";
import { planDialogue, splitDialogueQuestions } from "../../src/lib/advisor/dialoguePlanner";
import { dialogueMemoryOf, emptyDialogue, scenarioConditions, numericConditions, type DialogueMemory, type DialogueHistoryTurn } from "../../src/lib/advisor/dialogueState";
import { precomputedFocus } from "../../src/lib/advisor/precomputed";
import { acceptedSurface } from "../../src/lib/advisor/dialogueSurface";
import type { PlanContext, PlanDeps } from "../../src/lib/advisor/plan";
import { dehydrateTurn, reviveTurn } from "../../src/lib/advisor/history";

const data = loadData("ko_KR");
const deps: PlanDeps = { judge: async () => { throw new Error("시험에서는 모델을 부르지 않는다"); }, search: async () => [] };
function context(memory?: DialogueMemory): PlanContext {
  const turns: DialogueHistoryTurn[] = memory ? [{ role: "assistant", memory }] : [];
  return { data, lang: "ko_KR", copy: translations.ko_KR.advisor, turns, championIds: [], consented: false, canUseModel: false, retrieval: false, judge: "none" };
}
const remembered = (values: Partial<DialogueMemory>): DialogueMemory => ({ ...emptyDialogue(data.patch), ...values });

test("상성 옆에서 조회한 스킬의 다음 슬롯은 최근 조회 대상을 따른다", async () => {
  const memory = remembered({ active: "spell", matchup: { mine: "Jax", enemy: "Fiora" }, spell: { champion: "Jax", slot: "Q", focus: "cooldown" } });
  const result = await planDialogue("그럼 E는 몇 초야?", context(memory), deps);
  const plan = result.parts[0].plan;
  assert.equal(plan.type, "card");
  if (plan.type !== "card" || plan.answer.kind !== "spell") assert.fail("스킬 카드여야 한다");
  assert.equal(plan.answer.championId, "Jax");
  assert.equal(plan.answer.spell.slot, "E");
});

test("별도 챔피언 조회 뒤에도 명시적으로 돌아오면 이전 상성 관점을 보존한다", async () => {
  const memory = remembered({ active: "spell", matchup: { mine: "Jax", enemy: "Fiora", focus: "laning" }, spell: { champion: "Lux", slot: "R", focus: "cooldown" } });
  const result = await planDialogue("아까 상성에서 한타는 어떻게 해?", context(memory), deps);
  const plan = result.parts[0].plan;
  assert.equal(plan.type, "matchup");
  if (plan.type !== "matchup") assert.fail("상성 계획이어야 한다");
  assert.equal(plan.mine.id, "Jax");
  assert.equal(plan.enemy.id, "Fiora");
  assert.equal(plan.focus, "teamfight");
});

test("조건 정정은 옛 스킬 부재를 지우고 사용 가능과 새 부재를 따로 저장한다", () => {
  const prior = scenarioConditions("상대 E가 빠졌으면?", [], 1);
  const corrected = scenarioConditions("정정할게. 상대 E는 있고 Q가 빠진 거야", prior, 3);
  assert.deepEqual(corrected.map(({ slot, status }) => [slot, status]), [["E", "ready"], ["Q", "down"]]);
  assert.ok(corrected.every(c => c.turn === 3));
});

test("스킬 주인이 없는 부재 진술은 상대 상태로 만들어 저장하지 않는다", () => {
  assert.deepEqual(scenarioConditions("Q 빠졌어", [], 1), []);
});

test("상성에서 이름만 말한 스킬의 상태와 빠지면 조건을 기억한다", async () => {
  const memory = remembered({ active: "matchup", matchup: { mine: "Aatrox", enemy: "Fiora" } });
  const result = await planDialogue("응수가 빠지면 무엇부터 해?", context(memory), deps);
  assert.equal(result.parts[0].plan.type, "matchup");
  assert.deepEqual(result.memory.conditions.map(c => [c.owner, c.slot, c.status]), [["enemy", "W", "down"]]);
});

test("스킬 이름과 슬롯 문자가 섞인 문장에서도 두 조건을 보관한다", async () => {
  const memory = remembered({ active: "matchup", matchup: { mine: "Jax", enemy: "Fiora" } });
  const result = await planDialogue("응수가 빠졌고 상대 Q는 있어. 어떻게 교환해?", context(memory), deps);
  assert.deepEqual(result.memory.conditions.map(c => [c.owner, c.slot, c.status]), [["enemy", "W", "down"], ["enemy", "Q", "ready"]]);
});

test("두 스킬의 상태가 한 문장에 섞여도 각자 주인과 상태를 보관한다", async () => {
  const memory = remembered({ active: "matchup", matchup: { mine: "Aatrox", enemy: "Fiora" } });
  const first = await planDialogue("아트록스로 피오라 상대할 때 W 있고 내 Q는 빠졌어. 어떻게 해?", context(memory), deps);
  assert.deepEqual(first.memory.conditions.map(c => [c.owner, c.slot, c.status]), [["enemy", "W", "ready"], ["mine", "Q", "down"]]);
  const next = await planDialogue("내 Q는 돌아왔고 상대 W는 아직 있어. 어떻게 유도해?", context(first.memory), deps);
  assert.deepEqual(next.memory.conditions.map(c => [c.owner, c.slot, c.status]), [["enemy", "W", "ready"], ["mine", "Q", "ready"]]);
});

test("내 Q가 없다는 표현을 상대 W 부재와 분리한다", async () => {
  const result = await planDialogue("잭스로 피오라 상대할 때 W는 빠졌지만 내 Q가 없는데 어떻게 해?", context(), deps);
  assert.deepEqual(result.memory.conditions.map(c => [c.owner, c.slot, c.status]), [["enemy", "W", "down"], ["mine", "Q", "down"]]);
});

test("상대를 바꾸면 이전 쌍의 스킬 조건을 비운다", async () => {
  const memory = remembered({ active: "matchup", matchup: { mine: "Jax", enemy: "Fiora" }, conditions: scenarioConditions("상대 W가 빠졌으면?", [], 1) });
  const result = await planDialogue("상대가 레넥톤이면?", context(memory), deps);
  assert.equal(result.memory.matchup?.enemy, "Renekton");
  assert.deepEqual(result.memory.conditions, []);
});

test("모호한 슬롯은 확인하고 사용자 답에서 대상과 쿨타임 의도를 합친다", async () => {
  const memory = remembered({ active: "matchup", matchup: { mine: "Jax", enemy: "Fiora" } });
  const pending = await planDialogue("W 쿨은?", context(memory), deps, "clarify");
  assert.match(pending.clarification!, /잭스.*피오라/);
  const result = await planDialogue("내 W 말한 거야", context(pending.memory), deps, "clarify");
  const plan = result.parts[0].plan;
  if (plan.type !== "card" || plan.answer.kind !== "spell") assert.fail("스킬 카드여야 한다");
  assert.equal(plan.answer.championId, "Jax");
  assert.equal(plan.answer.focus, "cooldown");
});

test("숫자 정정은 챔피언 레벨을 만들어내지 않고 최근 가속 값을 바꾼다", () => {
  assert.deepEqual(numericConditions("아니 75로 정정", { rank: 2, haste: 30 }), { rank: 2, haste: 75 });
  assert.equal(numericConditions("챔피언 6레벨이야", undefined), undefined);
});

test("궁 랭크와 가속으로 현재 카드의 기본 쿨을 계산한다", async () => {
  const memory = remembered({ active: "spell", spell: { champion: "Malphite", slot: "R", focus: "cooldown" }, numeric: { rank: 1 } });
  const result = await planDialogue("스킬 가속 100이면 몇 초야?", context(memory), deps);
  const plan = result.parts[0].plan;
  if (plan.type !== "card" || plan.answer.kind !== "spell") assert.fail("스킬 카드여야 한다");
  assert.equal(plan.answer.headline?.value, "65초");
  assert.match(plan.answer.headline!.label, /1랭크.*가속 100/);
});

test("충전 스킬은 연속 시전 간격 대신 재충전 값을 계산한다", async () => {
  const result = await planDialogue("럼블 E에 가속 50이면 몇 초야?", context(), deps);
  const plan = result.parts[0].plan;
  if (plan.type !== "card" || plan.answer.kind !== "spell") assert.fail("스킬 카드여야 한다");
  assert.equal(plan.answer.headline?.value, "4초");
  assert.match(plan.answer.headline!.label, /재충전/);
});

test("쿨타임 계산의 '초'를 초가스 이름으로 오인하지 않는다", async () => {
  const result = await planDialogue("기본 쿨타임 18초에 가속 50이면 몇 초야?", context(), deps);
  const plan = result.parts[0].plan;
  assert.equal(plan.type, "code");
  if (plan.type !== "code" || typeof plan.answer === "string" || plan.answer.kind !== "text") assert.fail("계산 답이어야 한다");
  assert.match(plan.answer.text, /12초/);
});

test("아이템 전체 이름을 덤불 게임 규칙보다 먼저 조회한다", async () => {
  const result = await planDialogue("덤불 조끼 가격은?", context(), deps);
  const plan = result.parts[0].plan;
  if (plan.type !== "card" || plan.answer.kind !== "item") assert.fail("아이템 카드여야 한다");
  assert.equal(plan.answer.itemId, "3076");
});

test("명시적으로 섞인 두 질문을 각각 답하되 스킬 전체 소개는 분해하지 않는다", async () => {
  const result = await planDialogue("잭스 E 쿨타임 알려주고, 점멸 쿨타임도 알려줘", context(), deps, "decompose");
  assert.equal(result.parts.length, 2);
  assert.deepEqual(splitDialogueQuestions("럼블 패시브와 네 가지 스킬을 알려줘"), ["럼블 패시브와 네 가지 스킬을 알려줘"]);
});

test("단일 주제 문단과 이유 문단은 관련 없는 아이템을 덧붙이지 않는다", () => {
  const cards = [data.cardById.get("Jax")!, data.cardById.get("Fiora")!];
  const pair = { watch: "응수를 조심합니다.", escape: "반격이 빠진 뒤에 들어갑니다.", build: "방어력을 삽니다.", laning: "막타를 챙깁니다." };
  const answer = precomputedFocus(pair, { focus: "escape-window", reason: true }, cards)!;
  assert.match(answer, /반격이 빠진/);
  assert.match(answer, /응수를 조심/);
  assert.doesNotMatch(answer, /방어력|막타/);
});

test("새 대화와 패치가 다른 기억은 이전 숫자 조건을 되살리지 않는다", () => {
  assert.equal(dialogueMemoryOf([], data).numeric, undefined);
  const memory = remembered({ patch: "old", numeric: { haste: 75 } });
  assert.equal(dialogueMemoryOf([{ role: "assistant", memory }], data).numeric, undefined);
});

test("짧은 생성이 호응 뒤에 사실을 붙이거나 메타 설명을 하면 모두 버린다", () => {
  assert.equal(acceptedSurface("이어서 볼게요."), "이어서 볼게요.");
  assert.equal(acceptedSurface("좋아요. 궁은 20초예요."), undefined);
  assert.equal(acceptedSurface("'좋아요.'라고 답합니다."), undefined);
});

test("조사가 붙은 궁 지칭에도 최근 관통 규칙을 스킬 피해 유형과 연결한다", async () => {
  const memory = remembered({ active: "rule", rule: { title: "관통과 감소", text: "" } });
  const result = await planDialogue("다리우스 궁에도 적용돼?", context(memory), deps);
  const plan = result.parts[0].plan;
  if (plan.type !== "card" || plan.answer.kind !== "spell") assert.fail("스킬 관계 답이어야 한다");
  assert.equal(plan.answer.spell.slot, "R");
  assert.match(plan.answer.highlighted.join(" "), /고정 피해.*늘어나지/);
});

test("치유 감소 중첩으로 주제를 바꾸면 최근 아이템이나 소생 룬을 답하지 않는다", async () => {
  const memory = remembered({ active: "item", item: "3076" });
  const result = await planDialogue("치감은 여러 명이 걸어도 중첩돼?", context(memory), deps);
  const plan = result.parts[0].plan;
  if (plan.type !== "code" || typeof plan.answer !== "string") assert.fail("규칙 자료 범위를 알려야 한다");
  assert.match(plan.answer, /치유 감소율은 여러 개를 적용해도 합산되지 않습니다/);
  assert.equal(result.memory.active, "rule");
});

test("현재 문서의 관통 순서로 요청 수치를 계산한다", async () => {
  const result = await planDialogue("방어력 200에 20% 관통과 고정 관통 15면?", context(), deps);
  const plan = result.parts[0].plan;
  if (plan.type !== "code" || typeof plan.answer !== "string") assert.fail("계산 답이어야 한다");
  assert.match(plan.answer, /= 145/);
});

test("포탑 아래 생존 질문은 일반 한타 분류보다 라인전 맥락을 우선한다", async () => {
  const result = await planDialogue("잭스로 레넥톤한테 지는데 포탑 밑에서 어떻게 버텨?", context(), deps);
  const plan = result.parts[0].plan;
  if (plan.type !== "matchup") assert.fail("상성 답이어야 한다");
  assert.equal(plan.focus, "laning");
  assert.equal(plan.mine.id, "Jax");
});

test("정정으로 상대 핵심 스킬이 준비되어 있으면 주의 근거를 먼저 보여준다", () => {
  const cards = [data.cardById.get("Jax")!, data.cardById.get("Fiora")!];
  const answer = precomputedFocus({ watch: "응수가 살아 있으면 강한 공격을 아낍니다.", escape: "스킬이 빠지면 들어갑니다." }, { focus: "escape-window", conditions: scenarioConditions("상대 W는 있고 Q가 빠진 거야", [], 1) }, cards)!;
  assert.doesNotMatch(answer, /말씀하신 조건:/);
  assert.match(answer, /응수가 살아/);
  assert.doesNotMatch(answer, /스킬이 빠지면 들어/);
});

test("대화 기록 복원은 별도 상성과 조회·가속 조건을 함께 보존한다", () => {
  const memory = remembered({ active: "spell", matchup: { mine: "Jax", enemy: "Fiora" }, spell: { champion: "Lux", slot: "R", focus: "cooldown" }, numeric: { haste: 75, rank: 2 } });
  const stored = dehydrateTurn({ id: 2, role: "assistant", content: "답", memory, byCode: true });
  const revived = reviveTurn(JSON.parse(JSON.stringify(stored)), data)!;
  assert.deepEqual(dialogueMemoryOf([revived], data), { ...memory, lastReply: { question: "", text: "답", focus: undefined } });
  stored.memory!.numeric!.haste = 100;
  assert.equal(revived.memory!.numeric!.haste, 75);
});

test("자료에서 사라진 대상의 저장 기억은 복원하지 않는다", () => {
  const memory = remembered({ active: "spell", spell: { champion: "missing", slot: "R" }, numeric: { haste: 75 } });
  assert.equal(dialogueMemoryOf([{ role: "assistant", memory }], data).numeric, undefined);
});

test("별도 궁 조회 후 새 챔피언과 비교하면 이전 상성 쌍을 끌어오지 않는다", async () => {
  const memory = remembered({ active: "spell", matchup: { mine: "Jax", enemy: "Fiora" }, spell: { champion: "Lux", slot: "R", focus: "cooldown" }, numeric: { haste: 50, rank: 2 } });
  const result = await planDialogue("그럼 애니 궁도 같은 조건으로 비교해줘", context(memory), deps);
  const plan = result.parts[0].plan;
  if (plan.type !== "card" || plan.answer.kind !== "compare") assert.fail("최근 궁과 새 궁의 비교여야 한다");
  assert.deepEqual(plan.answer.cards.map(c => c.id), ["Lux", "Annie"]);
  assert.equal(result.memory.matchup?.mine, "Jax");
});

test("새 단일 스킬 조회는 예전 수치 비교 대상을 비운다", async () => {
  const memory = remembered({ active: "spell", compared: ["Lux", "Annie"], spell: { champion: "Lux", slot: "R", focus: "cooldown" } });
  const result = await planDialogue("잭스 E 쿨타임은?", context(memory), deps);
  assert.equal(result.memory.compared, undefined);
  assert.equal(result.memory.spell?.champion, "Jax");
});

test("정정했던 조건을 언급하며 이유를 물어도 저장 조건을 취소하지 않는다", async () => {
  const conditions = scenarioConditions("상대 W는 있고 Q가 빠진 거야", [], 1);
  const memory = remembered({ active: "matchup", matchup: { mine: "Jax", enemy: "Fiora", focus: "escape-window" }, conditions });
  const result = await planDialogue("지금 정정한 조건에서 왜 조심해야 해?", context(memory), deps);
  assert.deepEqual(result.memory.conditions, conditions);
  const plan = result.parts[0].plan;
  if (plan.type !== "matchup") assert.fail("직전 상성의 이유를 답해야 한다");
  assert.equal(plan.more, true);
  assert.equal(plan.focus, "escape-window");
});

test("사용자가 조건을 명시적으로 취소하면 비운다", () => {
  const previous = scenarioConditions("상대 W는 있고 Q가 빠진 거야", [], 1);
  assert.deepEqual(scenarioConditions("아까 조건은 취소할게", previous, 2), []);
});

test("내 챔피언을 바꿨다고 말하며 상대 스킬을 물으면 두 이름의 새 관점을 적용한다", async () => {
  const memory = remembered({ active: "matchup", matchup: { mine: "Aatrox", enemy: "Fiora" } });
  const result = await planDialogue("내 챔피언은 잭스로 바꿨어 피오라 W 응수는 어떻게 빼?", context(memory), deps);
  assert.equal(result.memory.matchup?.mine, "Jax");
  assert.equal(result.memory.matchup?.enemy, "Fiora");
});

test("내 챔피언이라는 명시적 지칭은 새 챔피언을 상대 자리로 넣지 않는다", async () => {
  const memory = remembered({ active: "matchup", matchup: { mine: "Ahri", enemy: "Zed" } });
  const result = await planDialogue("내 챔피언이 럭스면 제드 궁에는 어떻게 대응해?", context(memory), deps);
  assert.equal(result.memory.matchup?.mine, "Lux");
  assert.equal(result.memory.matchup?.enemy, "Zed");
});

test("상대 스킬을 어떻게 상대하는지 물으면 수치 비교 표를 만들지 않는다", async () => {
  const result = await planDialogue("베인으로 잭스 상대할 때 E 반격을 어떻게 상대해?", context(), deps);
  const plan = result.parts[0].plan;
  if (plan.type !== "matchup") assert.fail("스킬 대처를 묻는 상성 질문이어야 한다");
  assert.equal(plan.mine.id, "Vayne");
  assert.equal(plan.enemy.id, "Jax");
});

test("처음부터 두 이름을 말하고 응수를 빼는 법을 물으면 상성으로 계획한다", async () => {
  const result = await planDialogue("잭스로 피오라 W 응수 어떻게 빼?", context(), deps);
  const plan = result.parts[0].plan;
  if (plan.type !== "matchup") assert.fail("피오라 W 대처 상성이어야 한다");
  assert.deepEqual([plan.mine.id, plan.enemy.id], ["Jax", "Fiora"]);
});

test("상대 이름 뒤에 내 챔피언을 말해도 관점과 W 정정을 이어 간다", async () => {
  const first = await planDialogue("피오라 W 응수 빠졌어. 잭스라면 지금 어떻게 싸워?", context(), deps);
  assert.equal(first.memory.matchup?.mine, "Jax");
  assert.equal(first.memory.matchup?.enemy, "Fiora");
  assert.deepEqual(first.memory.conditions.map(c => [c.owner, c.slot, c.status]), [["enemy", "W", "down"]]);
  const second = await planDialogue("사실 W는 아직 있어. E 기절은?", context(first.memory), deps);
  assert.equal(second.parts[0].plan.type, "matchup");
  assert.deepEqual(second.memory.conditions.map(c => [c.owner, c.slot, c.status]), [["enemy", "W", "ready"]]);
});

test("상성 중 응수 상태를 정정하고 이유를 물어도 스킬 카드로 빠지지 않는다", async () => {
  const memory = remembered({ active: "matchup", matchup: { mine: "Jax", enemy: "Fiora", focus: "skill" } });
  const correction = await planDialogue("정정, 상대 W는 있고 Q가 빠진 거야", context(memory), deps);
  assert.equal(correction.parts[0].plan.type, "matchup");
  assert.deepEqual(correction.memory.conditions.map(c => [c.slot, c.status]), [["W", "ready"], ["Q", "down"]]);
  const reason = await planDialogue("왜 E 재발동을 조심해야 해?", context(correction.memory), deps);
  assert.equal(reason.parts[0].plan.type, "matchup");
});
