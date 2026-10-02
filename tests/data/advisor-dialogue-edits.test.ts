import assert from "node:assert/strict";
import { test } from "node:test";
import { loadData, offlineFileJudge } from "../../scripts/llm/kev-agent/lib";
import { translations } from "../../src/i18n/translations";
import { planDialogue } from "../../src/lib/advisor/dialoguePlanner";
import { assembleDialogueReply } from "../../src/lib/advisor/dialogueReply";
import { composeMatchupReply } from "../../src/lib/advisor/matchupReply";
import { dehydrateTurn, reviveTurn } from "../../src/lib/advisor/history";
import { scenarioConditions } from "../../src/lib/advisor/scenarioConditions";
import { adviceQuestion } from "../../src/lib/advisor/adviceRelevance";
import { statFields } from "../../src/lib/advisor/statQuery";
import type { PlanContext } from "../../src/lib/advisor/planTypes";

const data = loadData("ko_KR");
function chat() {
  const ctx: PlanContext = { data, lang: "ko_KR", copy: translations.ko_KR.advisor, turns: [], championIds: [],
    judge: "none", consented: false, canUseModel: false, retrieval: false };
  return async (q: string) => {
    const dialogue = await planDialogue(q, ctx, { judge: offlineFileJudge(), search: async () => [] }, "combined");
    const reply = await assembleDialogueReply(dialogue, data, "ko_KR", {
      matchup: async (source, lang, request) => composeMatchupReply(source, lang, request, undefined),
    });
    const index = ctx.turns.length;
    const turns = [{ id: index, role: "user" as const, content: q },
      { id: index + 1, role: "assistant" as const, content: reply.text, answer: reply.answer, answers: reply.answers, memory: reply.memory }];
    ctx.turns = [...ctx.turns, ...turns.flatMap(turn => {
      const restored = reviveTurn(JSON.parse(JSON.stringify(dehydrateTurn(turn))), data);
      return restored ? [restored] : [];
    })];
    return { dialogue, reply };
  };
}

test("조회 대상과 항목을 제외해도 남은 대상·레벨·항목은 저장 후 유지한다", async () => {
  const ask = chat();
  await ask("오공 문도 아리 11렙 체력 체젠 마저 비교");
  const removed = (await ask("문도는 빼고 보여줘")).reply.memory.stat!;
  assert.deepEqual(removed.champions, ["MonkeyKing", "Ahri"]);
  assert.equal(removed.level, 11);
  const fields = (await ask("체젠은 빼줘")).reply.memory.stat!;
  assert.deepEqual(statFields(fields), ["health", "magicResist"]);
  assert.deepEqual(fields.champions, ["MonkeyKing", "Ahri"]);
});

test("처음 질문의 제외 대상을 숫자 표에 넣지 않는다", async () => {
  const { reply } = await chat()("문도 말고 오공 체력 체젠 알려줘");
  assert.deepEqual(reply.memory.stat?.champions, ["MonkeyKing"]);
  assert.doesNotMatch(reply.text, /문도/);
});

test("이름만 교체하거나 추가해도 능력치 항목과 레벨은 바뀌지 않는다", async () => {
  const ask = chat();
  await ask("오공 18렙 체력 체젠 알려줘");
  const replaced = (await ask("그럼 제드는?")).reply.memory.stat!;
  assert.deepEqual(replaced.champions, ["Zed"]);
  const added = (await ask("아리도")).reply.memory.stat!;
  assert.deepEqual(added.champions, ["Zed", "Ahri"]);
  assert.deepEqual(statFields(added), ["health", "healthRegen"]);
  assert.equal(added.level, 18);
});

test("대상이나 항목을 전부 제외하면 새 질문을 안내하며 이전 조회를 유지한다", async () => {
  const ask = chat();
  await ask("문도 체력 알려줘");
  for (const q of ["문도 빼줘", "체력도 빼줘"]) {
    const { reply } = await ask(q);
    assert.match(reply.text, /남지 않았어요.*예:/);
    assert.equal(reply.answer?.kind, "text");
    assert.deepEqual(reply.memory.stat?.champions, ["DrMundo"]);
  }
});

for (const [q, status] of [
  ["내 E가 아직 안 돌아왔어", "down"], ["내 E가 없는 게 아니야", "ready"], ["내 E가 없진 않아", "ready"],
  ["내 E는 쿨이 돌고 있어", "down"], ["my E isn't available", "down"], ["my E is not on cooldown", "ready"],
  ["내 E가 없었는데 이제 돌아왔어", "ready"],
] as const) test(`${q}: 부정과 마지막 정정의 상태를 읽는다`, () => {
  assert.deepEqual(scenarioConditions(q, [], 1).map(c => [c.owner, c.slot, c.status]), [["mine", "E", status]]);
});

test("나열한 두 스킬에 부정된 준비 상태를 공유한다", () => {
  assert.deepEqual(scenarioConditions("내 E와 R이 안 돌아왔어", [], 1).map(c => [c.slot, c.status]), [["E", "down"], ["R", "down"]]);
});

test("상대 궁 방어 질문은 공격 진입 노트 대신 사용 가능한 대응을 고른다", async () => {
  const ask = chat();
  const first = await ask("아리로 제드 상대할 때 내 E가 아직 안 돌아왔어. 궁 대응은?");
  assert.match(first.reply.text, /제드 R.*다른 방법.*확인하지 못/);
  assert.doesNotMatch(first.reply.text, /E 매혹을 맞|매혹을 걸어/);
  const corrected = await ask("내 E가 없는 게 아니야. 상대 궁 대응은?");
  assert.match(corrected.reply.text, /매혹을 걸어 콤보를 끊/);
  assert.doesNotMatch(corrected.reply.text, /진입 타이밍/);
});

test("영어 his ult의 상대 관점을 내 E 조건으로 덮지 않는다", () => {
  const subjects = { mine: data.cardById.get("Ahri")!, enemy: data.cardById.get("Zed")! };
  assert.deepEqual(adviceQuestion("My E isn't available. How do I avoid his ult?", subjects), { intent: "survive", target: { owner: "enemy", slot: "R" } });
});

test("내 챔피언을 교체한 두 상성에 예전 챔피언의 부재 조건을 넘기지 않는다", async () => {
  const ask = chat();
  await ask("아리로 제드 내 E 없이 궁 대응은? 그리고 아리로 럭스 내 R 없이 대응은?");
  await ask("내가 가렌으로 바꿨어. 상대법은?");
  const { dialogue } = await ask("둘 다 라인전은?");
  assert.deepEqual(dialogue.parts.map(p => [p.matchup?.mine, p.matchup?.enemy, p.matchup?.conditions]), [["Garen", "Zed", []], ["Garen", "Lux", []]]);
});

test("조건을 붙인 상성과 별개 수치 질문을 모두 전달한다", async () => {
  const { dialogue, reply } = await chat()("아리로 제드 상대할 때 내 E가 없고, 궁 대응은? 그리고 문도 체젠 알려줘");
  assert.equal(dialogue.parts.length, 2);
  assert.equal(dialogue.parts[0].matchup?.conditions[0].status, "down");
  assert.match(reply.text, /제드 R[\s\S]*문도 박사 체력 재생.*7/);
});

test("챔피언 이름을 잇는 그리고는 독립 질문으로 분리하지 않는다", async () => {
  const { dialogue } = await chat()("오공으로 럼블 그리고 모데 상대법 알려줘");
  assert.deepEqual(dialogue.parts.map(p => [p.matchup?.mine, p.matchup?.enemy]), [["MonkeyKing", "Rumble"], ["MonkeyKing", "Mordekaiser"]]);
});

test("확인 단계 전에 유일한 이름 오타를 고치고 이름 없는 Q는 그대로 확인한다", async () => {
  const { reply } = await chat()("재이스 Q 쿨타임 알려줘");
  assert.match(reply.text, /제이스 Q.*16\/14\/12\/10\/8\/6초/);
  assert.match((await chat()("Q 쿨타임 알려줘")).reply.text, /어느 챔피언/);
});
