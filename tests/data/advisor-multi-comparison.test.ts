import assert from "node:assert/strict";
import { test } from "node:test";
import { loadData } from "../../scripts/llm/kev-agent/lib";
import { translations } from "../../src/i18n/translations";
import { answerDialogue } from "../../src/lib/advisor/dialogueFlow";
import { detectChampions } from "../../src/lib/advisor/intent";
import { dehydrateTurn, reviveTurn } from "../../src/lib/advisor/history";
import { emptyDialogue, type DialogueMemory } from "../../src/lib/advisor/dialogueState";
import type { PlanContext, PlanDeps } from "../../src/lib/advisor/planTypes";

const data = loadData("ko_KR");
const ids = ["MonkeyKing", "Zoe", "Vex", "Jayce", "Garen", "Darius", "Jax", "Fiora", "Lux", "Ahri"];
const names = (selected: string[]) => selected.map(id => data.cardById.get(id)!.name).join(" ");
const deps: PlanDeps = { judge: async () => { throw new Error("모델을 쓰지 않는 시험"); }, search: async () => [] };
function context(memory?: DialogueMemory): PlanContext {
  return {
    data, lang: "ko_KR", copy: translations.ko_KR.advisor, championIds: [],
    turns: memory ? [{ role: "assistant", memory }] : [],
    consented: false, canUseModel: false, retrieval: false, judge: "none",
  };
}

test("챔피언 인식은 10명을 넘겨도 언급 순서대로 모두 보존한다", () => {
  const selected = [...ids, "Zed", "Rumble", "Annie", "Teemo", "Nasus"];
  assert.deepEqual(detectChampions(data, names(selected)).map(c => c.id), selected);
});

test("별명과 영어 이름을 섞어도 네 번째 챔피언을 빠뜨리지 않는다", () => {
  assert.deepEqual(detectChampions(data, "오공 Zoe 벡스 Jayce 스킬 쿨타임").map(c => c.id), ids.slice(0, 4));
});

for (const count of [4, 10]) {
  test(`${count}명의 스킬 쿨타임 요청은 모든 대상을 표와 본문에 담는다`, async () => {
    const selected = [...ids, "Zed", "Rumble", "Annie", "Teemo", "Nasus"].slice(0, count);
    const { reply } = await answerDialogue(`${names(selected)} 스킬 쿨타임 알려줘`, context(), deps);
    assert.equal(reply.respond, undefined);
    if (reply.answer?.kind !== "compare") assert.fail("비교 표여야 한다");
    assert.deepEqual(reply.answer.cards.map(c => c.id), selected);
    assert.equal(reply.answer.rows.length, 4);
    assert.ok(reply.answer.rows.every(row => row.values.length === count));
    assert.ok(selected.every(id => reply.text.includes(data.cardById.get(id)!.name)));
  });
}

test("15명 비교는 일부만 잘라 내지 않고 10명까지 줄이도록 안내한다", async () => {
  const selected = [...ids, "Zed", "Rumble", "Annie", "Teemo", "Nasus"];
  const { reply } = await answerDialogue(`${names(selected)} 스킬 쿨타임 알려줘`, context(), deps);
  assert.equal(reply.answer, undefined);
  assert.match(reply.text, /수치 비교는 챔피언 10명까지/);
});

test("명시적으로 10명의 Q를 물으면 대상 확인 없이 모두 비교한다", async () => {
  const { reply } = await answerDialogue(`${names(ids)} Q 쿨타임 알려줘`, context(), deps);
  if (reply.answer?.kind !== "compare") assert.fail("이름을 이미 지정한 비교를 되묻지 않아야 한다");
  assert.equal(reply.answer.slot, "Q");
  assert.deepEqual(reply.answer.cards.map(c => c.id), ids);
});

for (const judge of ["model", "offline"] as const) {
  test(`${judge} 판정기가 있어도 명시한 10명 쿨타임 비교를 상성으로 바꾸지 않는다`, async () => {
    const noInference = { judge: async () => assert.fail("대상이 확정된 조회는 판정하지 않는다"), search: async () => assert.fail("비교 값을 검색하지 않는다") };
    const { reply } = await answerDialogue(`${names(ids)} 스킬 쿨타임 알려줘`, { ...context(), judge, consented: true, canUseModel: true, retrieval: true }, noInference);
    if (reply.answer?.kind !== "compare") assert.fail("전체 비교 표여야 한다");
    assert.equal(reply.answer.matchup, undefined);
    assert.deepEqual(reply.answer.cards.map(c => c.id), ids);
  });
}

test("10명 비교 뒤 R과 Q를 이어 물어도 대상과 쿨타임 초점을 유지한다", async () => {
  let { reply } = await answerDialogue(`${names(ids)} 스킬 쿨타임 알려줘`, context(), deps);
  for (const slot of ["R", "Q"]) {
    ({ reply } = await answerDialogue(`그럼 ${slot}은?`, context(reply.memory), deps));
    if (reply.answer?.kind !== "compare") assert.fail("전체 비교를 이어가야 한다");
    assert.deepEqual(reply.answer.cards.map(c => c.id), ids);
    assert.equal(reply.answer.slot, slot);
    assert.equal(reply.answer.focus, "cooldown");
  }
});

test("저장 복원한 10명 비교는 예전 상성 대신 현재 비교 대상을 따른다", async () => {
  const memory = { ...emptyDialogue(data.patch), active: "matchup" as const, matchup: { mine: "Jax", enemy: "Fiora" } };
  const first = await answerDialogue(`${names(ids)} 스킬 쿨타임 알려줘`, context(memory), deps);
  const stored = dehydrateTurn({ id: 1, role: "assistant", content: first.reply.text, answer: first.reply.answer, memory: first.reply.memory });
  const restored = reviveTurn(JSON.parse(JSON.stringify(stored)), data)!;
  const { reply } = await answerDialogue("W 쿨타임은?", { ...context(), turns: [restored] }, deps);
  if (reply.answer?.kind !== "compare") assert.fail("저장한 전체 비교를 이어가야 한다");
  assert.deepEqual(reply.answer.cards.map(c => c.id), ids);
});

test("전체 비교 뒤 단일 챔피언을 지정하면 이후 조회도 그 챔피언만 따른다", async () => {
  const first = await answerDialogue(`${names(ids)} 스킬 쿨타임 알려줘`, context(), deps);
  const second = await answerDialogue("잭스 E 쿨타임은?", context(first.reply.memory), deps);
  const { reply } = await answerDialogue("그럼 R은?", context(second.reply.memory), deps);
  if (reply.answer?.kind !== "spell") assert.fail("명시한 단일 챔피언의 조회여야 한다");
  assert.equal(reply.answer.championId, "Jax");
  assert.equal(reply.memory.compared, undefined);
});

test("슬롯 비교 뒤 스킬 전체 쿨타임을 물어도 10명을 유지한다", async () => {
  const first = await answerDialogue(`${names(ids)} Q 쿨타임 알려줘`, context(), deps);
  const stored = dehydrateTurn({ id: 1, role: "assistant", content: first.reply.text, answer: first.reply.answer, memory: first.reply.memory });
  const restored = reviveTurn(JSON.parse(JSON.stringify(stored)), data)!;
  const { reply } = await answerDialogue("스킬 쿨타임 전체 알려줘", { ...context(), turns: [restored] }, deps);
  if (reply.answer?.kind !== "compare") assert.fail("전체 비교 표여야 한다");
  assert.deepEqual(reply.answer.cards.map(c => c.id), ids);
  assert.equal(reply.answer.rows.length, 4);
});

test("네 명의 R 조회 뒤 새 10명의 스킬 쿨타임 요청은 QWER 전체를 보여준다", async () => {
  const first = await answerDialogue(`${names(ids.slice(0, 4))} R 쿨타임 알려줘`, context(), deps);
  const { reply } = await answerDialogue(`${names(ids)} 스킬 쿨타임 알려줘`, context(first.reply.memory), deps);
  if (reply.answer?.kind !== "compare") assert.fail("새 대상 전체 비교 표여야 한다");
  assert.deepEqual(reply.answer.cards.map(c => c.id), ids);
  assert.equal(reply.answer.slot, undefined);
  assert.deepEqual(reply.answer.rows.map(row => row.label[0]), ["Q", "W", "E", "R"]);
});
