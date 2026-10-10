import assert from "node:assert/strict";
import { test } from "node:test";
import { loadData } from "../../scripts/advisor/kev-agent/lib";
import { translations } from "../../../src/shared/i18n/translations";
import { planDialogue } from "../../../src/features/advisor/conversation/dialoguePlanner";
import { emptyDialogue, type DialogueMemory } from "../../../src/features/advisor/conversation/dialogueState";
import type { PlanContext } from "../../../src/features/advisor/contracts/planTypes";
import { assembleDialogueReply } from "../../../src/features/advisor/conversation/dialogueReply";
import { composeMatchupReply } from "../../../src/features/advisor/answers/matchupReply";
import { currentPair } from "../../scripts/advisor/atom-context/build-conditional";

const data = loadData("ko_KR");
const deps = { judge: async () => { throw new Error("판정기 미사용"); }, search: async () => [] };
function context(memory?: DialogueMemory): PlanContext {
  return { data, lang: "ko_KR", copy: translations.ko_KR.advisor, turns: memory ? [{ role: "assistant", memory }] : [],
    championIds: [], consented: false, canUseModel: false, retrieval: false, judge: "none" };
}
const matchup = (mine: string, enemy: string): DialogueMemory => ({ ...emptyDialogue(data.patch), active: "matchup", matchup: { mine, enemy } });

test("내 방어 스킬 부재의 후속 조언에서도 상성과 두 조건을 유지한다", async () => {
  const first = await planDialogue("상대 Q가 빠졌어. 어떻게 교환해?", context(matchup("Jax", "Teemo")), deps);
  const second = await planDialogue("내 E도 없는데 어떻게 해?", context(first.memory), deps);
  assert.equal(second.parts[0].plan.type, "matchup");
  assert.deepEqual(second.memory.conditions.map(c => [c.owner, c.slot, c.status]), [["enemy", "Q", "down"], ["mine", "E", "down"]]);
});

test("돌아온 스킬을 수치 조회로 읽지 않으면서 더 빨리 도는지 비교는 유지한다", async () => {
  const prior = matchup("Lux", "Blitzcrank");
  prior.conditions = [{ owner: "enemy", slot: "Q", status: "down", turn: 1, hypothetical: false }];
  const returned = await planDialogue("상대 Q는 돌아왔어. 이제 어떻게 싸워?", context(prior), deps);
  assert.equal(returned.parts[0].plan.type, "matchup");
  assert.equal(returned.memory.conditions[0].status, "ready");
  const compared = { ...prior, active: "spell" as const, compared: ["Lux", "Blitzcrank"], spell: { champion: "Lux", slot: "Q", focus: "cooldown" as const } };
  const numbers = await planDialogue("그럼 둘 중 누가 더 빨리 돌아?", context(compared), deps);
  const plan = numbers.parts[0].plan;
  if (plan.type !== "card" || plan.answer.kind !== "compare") assert.fail("수치 비교 카드 필요");
  assert.equal(plan.answer.slot, "Q");
});

test("한 문장 안의 내 스킬 부재와 상대 궁 진입 가정을 서로 섞지 않는다", async () => {
  const result = await planDialogue("내 매혹은 없는데 상대 궁이 오면 어떻게 해?", context(matchup("Ahri", "Zed")), deps);
  assert.deepEqual(result.memory.conditions.map(c => [c.owner, c.slot, c.status]), [["mine", "E", "down"], ["enemy", "R", "ready"]]);
  assert.equal(result.memory.conditions[0].hypothetical, false);
  assert.equal(result.memory.conditions[1].hypothetical, true);
});

test("대 문형 뒤의 명시적인 내 챔피언 정정은 어순보다 우선한다", async () => {
  const result = await planDialogue("가렌 vs 다리우스인데 내가 다리우스야. 한타 어떻게 해?", context(), deps);
  const plan = result.parts[0].plan;
  if (plan.type !== "matchup") assert.fail("상성 계획 필요");
  assert.deepEqual([plan.mine.id, plan.enemy.id], ["Darius", "Garen"]);
});

test("은행 읽기만 주입해 섞인 요청의 수치 답과 조언을 둘 다 조립한다", async () => {
  const result = await planDialogue("상대 Q가 빠졌으면 어떻게 교환해? 그리고 블리츠크랭크 Q 쿨타임도 알려줘", context(matchup("Lux", "Blitzcrank")), deps, "combined");
  const reply = await assembleDialogueReply(result, data, "ko_KR", { matchup: async (source, lang, request) => composeMatchupReply(source, lang, request, currentPair(request.mine.id, request.enemy.id, data.patch)) });
  assert.equal(result.parts.length, 2);
  assert.match(reply.text, /로켓 손/);
  assert.match(reply.text, /재사용 대기시간.*초/s);
  assert.equal(reply.memory.matchup?.mine, "Lux");
});
