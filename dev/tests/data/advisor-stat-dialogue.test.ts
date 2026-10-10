import assert from "node:assert/strict";
import { test } from "node:test";
import { loadData } from "../../scripts/advisor/kev-agent/lib";
import { translations } from "../../../src/shared/i18n/translations";
import { answerDialogue } from "../../../src/features/advisor/conversation/dialogueFlow";
import type { Language } from "../../../src/shared/i18n";
import type { PlanContext, PlanTurn } from "../../../src/features/advisor/contracts/planTypes";
import { resolveQuestion } from "../../../src/features/advisor/understanding/resolvedQuestion";
import { resolveStatQuery } from "../../../src/features/advisor/conversation/dialogueStats";
import { emptyDialogue } from "../../../src/features/advisor/conversation/dialogueState";
import type { StatName } from "../../../src/domain/knowledge/facts";
import { dehydrateTurn, reviveTurn } from "../../../src/features/advisor/storage/history";

function chat(lang: Language = "ko_KR") {
  const data = loadData(lang);
  const turns: PlanTurn[] = [];
  const ctx: PlanContext = { data, turns, lang, judge: "none", copy: translations[lang].advisor, championIds: [],
    consented: false, canUseModel: false, retrieval: false };
  const deps = { judge: async () => { throw new Error("판정기 미사용"); }, search: async () => [] };
  return { data, ctx, async ask(question: string) {
    const { reply } = await answerDialogue(question, ctx, deps);
    turns.push({ role: "user", content: question }, { role: "assistant", content: reply.text, answer: reply.answer, memory: reply.memory });
    return reply;
  } };
}

test("체력→회복량 정정에서 두 대상과 조회 항목을 유지한다", async () => {
  const c = chat();
  assert.match((await c.ask("오공랑 문도 박사 중 1레벨 체력 누가 더 높아?")).text, /640.*610/);
  const reply = await c.ask("아니아니 회복량");
  assert.deepEqual(reply.memory.stat, { kind: "championStat", champions: ["MonkeyKing", "DrMundo"], field: "healthRegen", level: 1 });
  assert.match(reply.text, /5초당.*문도 박사 7.*오공 3\.5/);
  assert.doesNotMatch(reply.text, /640|610|바위 피부/);
});

const fields: Array<[StatName, string]> = [["healthRegen", "체력 회복량"], ["attackSpeed", "공속"]];
for (const [field, word] of fields) test(`${word} 조회는 항목만 바꾸고 대상과 18레벨을 유지한다`, async () => {
  const c = chat();
  await c.ask("오공 문도 박사 18레벨 체력 비교");
  const reply = await c.ask(`그럼 ${word}은 둘 다?`);
  assert.equal(reply.memory.stat?.field, field);
  assert.equal(reply.memory.stat?.level, 18);
  assert.deepEqual(reply.memory.stat?.champions, ["MonkeyKing", "DrMundo"]);
  for (const id of ["MonkeyKing", "DrMundo"]) assert.ok(reply.text.includes(String(c.data.cardById.get(id)!.stats[field]!.lv18)));
});

for (const [lang, first, next] of [
  ["en_US", "Wukong and Dr. Mundo health at level 11", "what about health regeneration for both?"],
  ["zh_CN", "孙悟空 蒙多医生 11级生命值比较", "两个的生命回复是多少？"],
] as const) test(`${lang}에서도 대상·레벨을 유지하며 체력 재생으로 전환한다`, async () => {
  const c = chat(lang);
  await c.ask(first);
  const reply = await c.ask(next);
  assert.equal(reply.memory.stat?.field, "healthRegen");
  assert.equal(reply.memory.stat?.level, 11);
  assert.deepEqual(reply.memory.stat?.champions, ["MonkeyKing", "DrMundo"]);
});

test("스킬 회복·마나·아이템·상대법을 기본 체력 재생으로 강제 변환하지 않는다", () => {
  const c = chat();
  const memory = { ...emptyDialogue(c.data.patch), active: "stat" as const,
    stat: { kind: "championStat" as const, champions: ["MonkeyKing", "DrMundo"], field: "healthRegen" as const, level: 18 as const } };
  for (const q of ["문도 R 체력 회복량", "회복 물약 체력 회복량", "마나 회복량은?", "체력 많은 문도 어떻게 싸워?"]) {
    assert.equal(resolveStatQuery(resolveQuestion(q, c.data), memory, c.ctx), undefined, q);
  }
});

test("저장한 단일 스탯 카드를 복원해도 항목과 레벨을 유지한다", async () => {
  const c = chat();
  const first = await c.ask("문도 박사 18레벨 체력 재생");
  const saved = dehydrateTurn({ id: 1, role: "assistant", content: first.text, answer: first.answer, memory: first.memory });
  const restored = reviveTurn(JSON.parse(JSON.stringify(saved)), c.data)!;
  if (restored.answer?.kind !== "champion" || first.answer?.kind !== "champion") assert.fail("챔피언 카드 필요");
  assert.deepEqual(restored.answer.statQuery, first.answer.statQuery);
  assert.deepEqual(restored.answer.headline, first.answer.headline);
  const next = await answerDialogue("방어력은?", { ...c.ctx, turns: [restored] }, { judge: async () => { throw Error("호출 불필요"); }, search: async () => [] });
  assert.match(next.reply.text, /문도 박사.*방어력.*18레벨.*108\.5/);
});

test("이전 버전의 체력 비교 기억에서도 회복량 정정을 이어받는다", async () => {
  const c = chat();
  const first = await c.ask("오공 문도 박사 6레벨 체력 비교");
  if (first.answer?.kind !== "compare") assert.fail("비교 카드 필요");
  const { statQuery: _stat, ...legacyAnswer } = first.answer;
  const next = await answerDialogue("아니 회복량", { ...c.ctx, turns: [{ role: "assistant", answer: legacyAnswer,
    memory: { ...emptyDialogue(c.data.patch), active: "compare", compared: ["MonkeyKing", "DrMundo"] } }] },
  { judge: async () => { throw Error("호출 불필요"); }, search: async () => [] });
  assert.equal(next.reply.memory.stat?.field, "healthRegen");
  assert.equal(next.reply.memory.stat?.level, 6);
  assert.match(next.reply.text, /8\.98.*6\.07/);
});

test("능력치 비교에서 스킬 쿨타임으로 전환해도 두 대상을 유지한다", async () => {
  const c = chat();
  await c.ask("오공 문도 박사 체력 비교");
  const reply = await c.ask("Q 쿨타임은?");
  assert.equal(reply.answer?.kind, "compare");
  assert.match(reply.text, /오공.*문도 박사/);
  assert.equal(reply.memory.active, "spell");
});

test("챔피언을 새로 소개한 뒤 스탯을 물으면 옛 비교 대상이 끼지 않는다", async () => {
  const c = chat();
  await c.ask("오공 문도 박사 18레벨 체력 비교");
  await c.ask("럭스 스킬 설명해줘");
  const reply = await c.ask("방어력은?");
  assert.deepEqual(reply.memory.stat?.champions, ["Lux"]);
  assert.equal(reply.memory.stat?.level, 1);
});

test("새로 명시한 비교 대상은 이전 대상을 대신하고 열 명도 유지한다", async () => {
  const c = chat();
  await c.ask("가렌 다리우스 방어력 비교");
  const newPair = await c.ask("오공 문도 박사 체력 비교");
  assert.deepEqual(newPair.memory.stat?.champions, ["MonkeyKing", "DrMundo"]);
  const ten = await c.ask("오공 문도 박사 아리 제드 럭스 가렌 다리우스 조이 벡스 제이스 체력 회복량 모두 비교");
  assert.equal(ten.memory.stat?.champions.length, 10);
  assert.equal(ten.answer?.kind, "compare");
  if (ten.answer?.kind !== "compare") assert.fail("비교 카드 필요");
  assert.equal(ten.answer.rows.find(row => row.hit)?.values.length, 10);
});
