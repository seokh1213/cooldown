import assert from "node:assert/strict";
import { test } from "node:test";
import { loadData, offlineFileJudge } from "../../scripts/llm/kev-agent/lib";
import { translations } from "../../src/i18n/translations";
import { planDialogue } from "../../src/lib/advisor/dialoguePlanner";
import { assembleDialogueReply } from "../../src/lib/advisor/dialogueReply";
import { composeMatchupReply } from "../../src/lib/advisor/matchupReply";
import { prepareDialogueRequest } from "../../src/lib/advisor/dialogueRequest";
import { resolveQuestion } from "../../src/lib/advisor/resolvedQuestion";
import { describeRequest, planMismatch } from "../../src/lib/advisor/requestContract";
import { buildCompareAnswer } from "../../src/lib/advisor/answer";
import { emptyDialogue, type DialogueMemory } from "../../src/lib/advisor/dialogueState";
import { dehydrateTurn, reviveTurn } from "../../src/lib/advisor/history";
import { groupedReply } from "../../src/lib/advisor/groupedReply";
import type { PlanContext } from "../../src/lib/advisor/planTypes";

const data = loadData("ko_KR");
const card = (id: string) => data.cardById.get(id)!;
const deps = { judge: offlineFileJudge(), search: async () => [] };
const context = (memory?: DialogueMemory): PlanContext => ({ data, lang: "ko_KR", copy: translations.ko_KR.advisor,
  turns: memory ? [{ role: "assistant", memory }] : [], championIds: [], judge: "none", consented: false, canUseModel: false, retrieval: false });
async function ask(question: string, memory?: DialogueMemory) {
  const dialogue = await planDialogue(question, context(memory), deps, "combined");
  return { dialogue, reply: await assembleDialogueReply(dialogue, data, "ko_KR", {
    matchup: async (source, lang, request) => composeMatchupReply(source, lang, request, undefined),
  }) };
}

test("상성을 나누어도 원문과 챔피언 위치를 유지한다", () => {
  const question = "오공으로 럼블이랑 모데 너무어려운데 방법 없나?";
  const request = prepareDialogueRequest(question, context(), "combined");
  assert.equal(request.questions.length, 2);
  for (const input of request.questions) {
    assert.notEqual(typeof input, "string");
    const resolved = resolveQuestion(input, data);
    assert.equal(resolved.text, question);
    assert.equal(resolved.mentions.length, 3);
    for (const mention of resolved.mentions) assert.ok(question.slice(mention.index, mention.index + mention.length));
  }
});

test("서로 다른 두 1:1은 모두 답하고 세 쌍이면 범위를 안내한다", async () => {
  const question = "오공으로 럼블 상대법 알려주고 아리로 제드 상대법 알려줘";
  const two = await ask(question);
  assert.deepEqual(two.reply.memory.matchups?.map(p => [p.mine, p.enemy]), [["MonkeyKing", "Rumble"], ["Ahri", "Zed"]]);
  const three = await ask(`${question} 그리고 가렌으로 다리우스 상대법 알려줘`, two.reply.memory);
  assert.equal(three.dialogue.parts.length, 0);
  assert.equal(three.reply.answer, undefined);
  assert.equal(three.reply.trace?.rejected, "scope");
  assert.deepEqual(three.reply.memory.matchups, two.reply.memory.matchups);
  assert.match(three.reply.text, /두 쌍까지[\s\S]*예:/);
});

for (const q of ["챔피언 100개 비교해줘", "모든 챔피언 상성 알려줘", "전체 챔프 공속 비교", "200명 스킬 쿨타임 비교"]) {
  test(`${q} 일부 대상만 답하지 않고 범위를 줄이는 예시를 준다`, async () => {
    const { reply, dialogue } = await ask(q);
    assert.equal(dialogue.parts.length, 0);
    assert.equal(reply.answer, undefined);
    assert.match(reply.text, /두 쌍까지[\s\S]*10명까지[\s\S]*예:/);
  });
}

test("가속 100은 인원수 제한으로 거절하지 않는다", async () => {
  const { reply } = await ask("제드 R 쿨타임 가속 100이면?");
  assert.notEqual(reply.trace?.rejected, "scope");
  assert.match(reply.text, /초/);
});

test("상대할 때 방어력 올려도 되냐는 수치 조회로 바꾸지 않는다", async () => {
  const { dialogue, reply } = await ask("오공으로 럼블 상대할 때 방어력 올려도 돼?");
  assert.equal(dialogue.parts[0].plan.type, "matchup");
  assert.equal(dialogue.parts[0].request?.operation, "advice");
  assert.doesNotMatch(reply.text, /방어력 \(1레벨\)|방어력:/);
  assert.match(reply.text, /마법무효화/);
});

test("공속 질문에 다른 능력치나 일부 대상만 주면 답변 검사가 막는다", () => {
  const ctx = context();
  const resolved = resolveQuestion("오공 문도 공속 비교", data);
  const request = describeRequest(resolved, emptyDialogue(data.patch), ctx);
  const wrong = buildCompareAnswer([card("MonkeyKing")], "체력", undefined, { lang: "ko_KR" });
  assert.equal(planMismatch(request, { type: "card", answer: wrong }), "answerMismatch");
});

test("지원하지 않는 조건은 관계없는 공식 대신 근거 부족과 질문 예시를 알린다", async () => {
  const { reply } = await ask("스킬 쿨이 이미 돌고 있는데 스킬 가속 사면 남은 쿨도 바로 줄어?");
  assert.match(reply.text, /조건[\s\S]*확인할 수 없어요[\s\S]*예:/);
  assert.doesNotMatch(reply.text, /최종 쿨타임|100 \+/);
  assert.equal(reply.trace?.rejected, "evidence");
});

test("원문·선택한 주제·거절 이유는 저장 복원 뒤에도 평가 기록에 쓸 수 있다", async () => {
  const { reply } = await ask("오공으로 럼블, 모데 상대법 알려줘");
  assert.ok(reply.trace?.parts.every(p => p.topics?.length));
  const stored = dehydrateTurn({ id: 1, role: "assistant", content: reply.text, answer: reply.answer, answers: reply.answers, memory: reply.memory, trace: reply.trace });
  const revived = reviveTurn(JSON.parse(JSON.stringify(stored)), data)!;
  assert.deepEqual(revived.trace, JSON.parse(JSON.stringify(reply.trace)));
  assert.deepEqual(revived.memory?.matchups, reply.memory.matchups);
  assert.deepEqual(revived.answers?.map(answer => answer.kind === "compare" ? answer.cards.map(card => card.id) : answer.kind),
    [["MonkeyKing", "Rumble"], ["MonkeyKing", "Mordekaiser"]]);
});

test("동일한 근거 문단만 한 번 묶고 조건이나 주제가 다른 문단은 남긴다", () => {
  const common = "**싸우는 법**\n" + "검증된 공통 행동. ".repeat(8);
  const conditional = common + "단, 내 E가 없으면 기다립니다.";
  const result = groupedReply([{ heading: "### A vs B", text: `**상대 B**\nB 대응\n\n${common}` },
    { heading: "### A vs C", text: `**상대 C**\nC 대응\n\n${common}` }], "ko_KR");
  assert.equal(result.split(common).length, 2);
  assert.match(result, /B 대응[\s\S]*C 대응[\s\S]*공통 조언/);
  assert.doesNotMatch(groupedReply([{ text: common }, { text: conditional }], "ko_KR"), /공통 조언/);
});

test("무조건 승리와 롤 밖 질문은 다음에 물을 수 있는 질문을 안내한다", async () => {
  for (const question of ["오공으로 다리우스 무조건 이기게 해줘", "저녁에 김치찌개 만드는 법 알려줘"]) {
    const { reply } = await ask(question);
    assert.ok(!reply.answer || reply.answer.kind === "text");
    assert.match(reply.text, /해결하기 어려워요[\s\S]*예:/);
  }
});

test("현재 아이템 설명으로 치감의 뜻을 답하고 중첩 여부는 추측하지 않는다", async () => {
  const definition = await ask("치감이 정확히 무슨뜻인가요?");
  assert.match(definition.reply.text, /줄임말[\s\S]*치유 및 회복 효과를 감소/);
  const interaction = await ask("치감 중첩돼?");
  assert.match(interaction.reply.text, /중첩 여부는 아직 확인할 수 없어요/);
});

test("상대 이름만 다른 동일한 아이템 근거도 공통으로 한 번 보여 준다", async () => {
  const { reply } = await ask("오공으로 럼블, 모데 상대법 알려줘");
  assert.match(reply.text, /공통 조언[\s\S]*럼블·모데카이저의 피해/);
  assert.equal(reply.text.split("마법무효화의 망토").length, 2);
  assert.equal(reply.text.split("진입 콤보는").length, 2);
});

test("쉼표로 쓴 두 VS 요청도 각각 답한다", async () => {
  const { dialogue } = await ask("오공 vs 럼블, 아리 vs 제드 상대법");
  assert.deepEqual(dialogue.parts.map(p => p.plan.type === "matchup" ? [p.plan.mine.id, p.plan.enemy.id] : p.plan.type),
    [["MonkeyKing", "Rumble"], ["Ahri", "Zed"]]);
});

test("두 상성 중 먼저 물은 쌍으로 돌아가도 그 쌍의 사용 불가 조건을 보존한다", async () => {
  const first = await ask("아리로 제드 상대할 때 내 E가 없는데 궁 대응 어떻게 해? 그리고 아리로 럭스 상대할 때 내 R이 없는데 어떻게 해?");
  const selected = await ask("아리로 제드 상대할 때 팁 좀", first.reply.memory);
  assert.deepEqual(selected.reply.memory.conditions.map(c => [c.slot, c.status]), [["E", "down"]]);
  assert.equal(selected.reply.memory.matchup?.enemy, "Zed");
});
