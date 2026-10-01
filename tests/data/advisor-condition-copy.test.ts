import assert from "node:assert/strict";
import { test } from "node:test";
import { loadData, offlineFileJudge } from "../../scripts/llm/kev-agent/lib";
import { currentPair } from "../../scripts/llm/atom-context/build-conditional";
import { translations } from "../../src/i18n/translations";
import { planDialogue } from "../../src/lib/advisor/dialoguePlanner";
import { assembleDialogueReply } from "../../src/lib/advisor/dialogueReply";
import { composeMatchupReply } from "../../src/lib/advisor/matchupReply";
import { selectPrecomputed } from "../../src/lib/advisor/precomputed";
import { conditionMatchupText } from "../../src/lib/advisor/conditionedMatchup";
import { dehydrateTurn, reviveTurn } from "../../src/lib/advisor/history";
import { scenarioConditions } from "../../src/lib/advisor/dialogueState";
import type { PlanContext } from "../../src/lib/advisor/planTypes";

const data = loadData("ko_KR");
const subjects = { mine: data.cardById.get("Ahri")!, enemy: data.cardById.get("Zed")! };
const caption = /말씀하신 조건:|Your stated conditions:|你提供的条件:/;

test("조건 머리말을 빼도 저장 복원 뒤 E의 복귀와 R의 부재를 대안 선택에 반영한다", async () => {
  const ctx: PlanContext = { data, lang: "ko_KR", copy: translations.ko_KR.advisor, turns: [], championIds: [],
    judge: "offline", consented: false, canUseModel: false, retrieval: false };
  const deps = { judge: offlineFileJudge(), search: async () => [] };
  const ask = async (question: string) => {
    const dialogue = await planDialogue(question, ctx, deps, "combined");
    const reply = await assembleDialogueReply(dialogue, data, "ko_KR", {
      matchup: async (knowledge, lang, request) => composeMatchupReply(knowledge, lang, request, currentPair(request.mine.id, request.enemy.id, data.patch)),
    });
    const stored = dehydrateTurn({ id: ctx.turns.length + 1, role: "assistant", content: reply.text, answer: reply.answer, memory: reply.memory });
    ctx.turns = [...ctx.turns, { role: "user", content: question }, reviveTurn(JSON.parse(JSON.stringify(stored)), data)!];
    assert.doesNotMatch(reply.text, caption);
    assert.doesNotMatch(reply.answer?.kind === "compare" ? reply.answer.precomputed! : "", caption);
    return reply;
  };
  const first = await ask("아리로 제드를 상대하고 내 E가 없는데 상대 궁에 어떻게 대응해?");
  assert.ok(first.memory.conditions.some(c => c.owner === "mine" && c.slot === "E" && c.status === "down"));
  assert.match(first.text, /내 E.*추천할 수 없/);
  assert.doesNotMatch(first.text, /매혹으로 콤보를 끊|군중 제어를 걸어/);

  const second = await ask("내 R도 없고 E만 돌아왔어. 상대 궁에 어떻게 대응해?");
  assert.ok(second.memory.conditions.some(c => c.owner === "mine" && c.slot === "E" && c.status === "ready"));
  assert.ok(second.memory.conditions.some(c => c.owner === "mine" && c.slot === "R" && c.status === "down"));
  assert.match(second.text, /아리 E 매혹/);
  assert.match(second.text, /군중 제어를 걸어 콤보를 끊/);
  assert.doesNotMatch(second.text, /내 R.*추천할 수 없|R 혼령 질주로.*(?:접근|진입)/);
});

test("은행의 원문 선택에서도 조건 목록을 답변에 덧붙이지 않는다", () => {
  const mine = data.cardById.get("Jax")!;
  const enemy = data.cardById.get("Fiora")!;
  const conditions = scenarioConditions("상대 W는 있고 Q가 빠진 거야", [], 1);
  const selected = selectPrecomputed({ watch: "응수가 살아 있으면 강한 공격을 아낍니다.", escape: "스킬이 빠지면 들어갑니다." },
    { mode: "topic", focus: "escape-window", conditions }, [mine, enemy]);
  assert.match(selected.text!, /응수가 살아/);
  assert.doesNotMatch(selected.text!, /스킬이 빠지면 들어|말씀하신 조건:/);
  assert.deepEqual(conditions.map(c => [c.slot, c.status]), [["W", "ready"], ["Q", "down"]]);
});

for (const lang of ["ko_KR", "en_US", "zh_CN"] as const) test(`${lang}에서 스킬 부재는 검사하되 조건 머리말은 표시하지 않는다`, () => {
  const result = conditionMatchupText({ ...data, playbooks: new Map() }, lang,
    { ...subjects, question: "내 E가 없는데 상대 궁에 어떻게 대응해?", conditions: scenarioConditions("내 E가 없어", [], 1) },
    "제드 R이 붙으면 아리 E 매혹을 맞힙니다.");
  assert.equal(result.abstained, true);
  assert.ok(result.rejected > 0);
  assert.doesNotMatch(result.text, caption);
  assert.doesNotMatch(result.text, /매혹을 맞힙/);
});
