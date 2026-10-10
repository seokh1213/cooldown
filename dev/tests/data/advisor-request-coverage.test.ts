import assert from "node:assert/strict";
import { test } from "node:test";
import { loadData, offlineFileJudge } from "../../scripts/advisor/kev-agent/lib";
import { answerDialogue } from "../../../src/features/advisor/conversation/dialogueFlow";
import { planDialogue } from "../../../src/features/advisor/conversation/dialoguePlanner";
import { assembleDialogueReply } from "../../../src/features/advisor/conversation/dialogueReply";
import { composeMatchupReply } from "../../../src/features/advisor/answers/matchupReply";
import { answerKey, buildCompareAnswer } from "../../../src/features/advisor/answers/answer";
import { dehydrateTurn, reviveTurn } from "../../../src/features/advisor/storage/history";
import { detectStats, statFields } from "../../../src/features/advisor/understanding/statQuery";
import { translations } from "../../../src/shared/i18n/translations";
import type { Language } from "../../../src/shared/i18n";
import type { PlanContext } from "../../../src/features/advisor/contracts/planTypes";

function conversation(lang: Language = "ko_KR") {
  const data = loadData(lang);
  const ctx: PlanContext = { data, lang, copy: translations[lang].advisor, turns: [], championIds: [], judge: "none",
    consented: false, canUseModel: false, retrieval: false };
  const deps = { judge: offlineFileJudge(), search: async () => [] };
  return { data, ctx, async ask(question: string) {
    const dialogue = await planDialogue(question, ctx, deps, "combined");
    const reply = await assembleDialogueReply(dialogue, data, lang, {
      matchup: async (source, language, request) => composeMatchupReply(source, language, request, undefined),
    });
    const index = ctx.turns.length;
    const turns = [{ id: index, role: "user" as const, content: question },
      { id: index + 1, role: "assistant" as const, content: reply.text, answer: reply.answer, answers: reply.answers, memory: reply.memory }];
    ctx.turns = [...ctx.turns, ...turns.flatMap(turn => {
      const restored = reviveTurn(JSON.parse(JSON.stringify(dehydrateTurn(turn))), data);
      return restored ? [restored] : [];
    })];
    return { dialogue, reply };
  } };
}

for (const [q, fields] of [
  ["체력하고 체젠", ["health", "healthRegen"]], ["health and health regeneration", ["health", "healthRegen"]],
  ["生命值和生命回复", ["health", "healthRegen"]],
  ["이속 말고 공속만", ["attackSpeed"]],
] as const) test(`${q}: 중첩 어휘와 요청 순서를 구분한다`, () => assert.deepEqual(detectStats(q), fields));

test("둘의 체력과 체젠을 문장·강조 행·저장 카드에 모두 남긴다", async () => {
  const c = conversation();
  const { reply } = await c.ask("오공·문도 체력하고 체젠 비교해줘");
  assert.equal(reply.answer?.kind, "compare");
  if (reply.answer?.kind !== "compare") return;
  assert.deepEqual(reply.answer.headlines?.map(f => f.value), ["문도 박사 640 > 오공 610", "문도 박사 7 > 오공 3.5"]);
  assert.deepEqual(reply.answer.rows.map(row => row.values), [["610", "640"], ["3.5", "7"]]);
  assert.ok(reply.answer.rows.every(row => row.hit));
  assert.match(reply.text, /체력 \(1레벨\).*640.*610[\s\S]*체력 재생 \(5초당\).*7.*3\.5/);
  const restored = c.ctx.turns.at(-1)!.answer;
  assert.equal(restored?.kind, "compare");
  if (restored?.kind === "compare") assert.deepEqual(restored.headlines, reply.answer.headlines);
});

test("레벨·대상·항목을 독립적으로 갱신하고 같이 추가한다", async () => {
  const c = conversation();
  await c.ask("오공 문도 체력 체젠 비교");
  assert.deepEqual((await c.ask("18레벨이면?")).reply.memory.stat?.fields, ["health", "healthRegen"]);
  const narrowed = (await c.ask("문도만")).reply.memory.stat!;
  assert.deepEqual(narrowed.champions, ["DrMundo"]);
  assert.equal(narrowed.level, 18);
  assert.deepEqual(statFields(narrowed), ["health", "healthRegen"]);
  const one = (await c.ask("체젠만")).reply.memory.stat!;
  assert.deepEqual(statFields(one), ["healthRegen"]);
  const added = (await c.ask("체력도 같이")).reply.memory.stat!;
  assert.deepEqual(statFields(added), ["healthRegen", "health"]);
});

test("서로 다른 대상의 능력치 요청은 쉼표로 분리한다", async () => {
  const { reply } = await conversation().ask("오공 체력 알려줘, 문도 체젠 알려줘");
  assert.deepEqual(reply.answers?.flatMap(a => "statQuery" in a && a.statQuery ? [[a.statQuery.champions, a.statQuery.field]] : []),
    [[["MonkeyKing"], "health"], [["DrMundo"], "healthRegen"]]);
});

test("한 요청의 근거 부족이나 확인 질문이 다른 요청을 버리지 않는다", async () => {
  const c = conversation();
  const { reply, dialogue } = await c.ask("오공 문도 체력 비교해주고 오공으로 럼블 무조건 이기는 법 알려줘");
  assert.equal(dialogue.parts.length, 2);
  assert.match(reply.text, /640.*610[\s\S]*승리를 보장[\s\S]*예:/);
  assert.doesNotMatch(reply.text, /계정|결제/);
  const ambiguous = await conversation().ask("Q 쿨 알려주고 오공 체력 알려줘");
  assert.match(ambiguous.reply.text, /어느 챔피언[\s\S]*610/);
});

test("같은 스킬의 다른 사실과 다른 항목 목록을 카드 중복으로 버리지 않는다", async () => {
  const { reply } = await conversation().ask("아리 E 쿨 알려주고 아리 E 사거리 알려줘");
  assert.equal(reply.answers?.length, 2);
  assert.match(reply.text, /12초[\s\S]*975/);
  const c = conversation();
  const cards = [c.data.cardById.get("MonkeyKing")!, c.data.cardById.get("DrMundo")!];
  assert.notEqual(answerKey(buildCompareAnswer(cards, "체력 체젠")), answerKey(buildCompareAnswer(cards, "체력 마저")));
});

test("숫자 조회에서 언급한 내 스킬과 뒤따른 부재 조건을 연결한다", async () => {
  const { dialogue, reply } = await conversation().ask("아리 E 쿨 알려주고 E 없을 때 제드 궁 어떻게 대응해?");
  assert.equal(dialogue.parts[1].plan.type, "matchup");
  assert.deepEqual(dialogue.parts[1].matchup?.conditions.map(c => [c.owner, c.slot, c.status]), [["mine", "E", "down"]]);
  assert.match(reply.text, /12초[\s\S]*확인하지 못/);
  assert.doesNotMatch(reply.text, /매혹으로 콤보를 끊|매혹을 걸어/);
});

test("선택한 상대의 스탯을 묻고 둘 다 돌아와도 각 부재 조건은 유지된다", async () => {
  const c = conversation();
  await c.ask("아리로 제드 상대할 때 내 E가 없는데 대응은? 그리고 아리로 럭스 상대할 때 내 R이 없는데 대응은?");
  await c.ask("제드만 상대 궁 대응은?");
  assert.equal((await c.ask("상대 체력과 마저는?")).reply.memory.stat?.champions[0], "Zed");
  const { dialogue } = await c.ask("아까 상성으로 돌아가서 둘 다 팁 좀");
  assert.deepEqual(dialogue.parts.map(p => [p.matchup?.enemy, p.matchup?.conditions.map(c => [c.owner, c.slot, c.status])]),
    [["Zed", [["mine", "E", "down"]]], ["Lux", [["mine", "R", "down"]]]]);
  const corrected = await c.ask("제드만 내 R도 없고 E만 돌아왔어. 궁 대응은?");
  assert.equal(corrected.dialogue.parts[0].plan.type, "matchup");
  const correction = corrected.dialogue.parts[0].matchup;
  assert.ok(correction);
  assert.deepEqual(correction.conditions.map(c => [c.slot, c.status]), [["E", "ready"], ["R", "down"]]);
});

test("실제 앱 진입점에서도 네 독립 요청을 모두 전달한다", async () => {
  const c = conversation();
  const { dialogue, reply } = await answerDialogue("오공 체력 알려주고 문도 체젠 알려주고 아리 E 쿨 알려주고 제드 R 사거리 알려줘", c.ctx,
    { judge: offlineFileJudge(), search: async () => [] });
  assert.equal(dialogue.parts.length, 4);
  assert.equal(reply.answers?.length, 4);
  assert.match(reply.text, /610[\s\S]*7[\s\S]*12초[\s\S]*625/);
});
