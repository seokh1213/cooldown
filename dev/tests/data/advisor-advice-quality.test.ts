import assert from "node:assert/strict";
import { test } from "node:test";
import { loadData, offlineFileJudge } from "../../scripts/advisor/kev-agent/lib";
import { conditionMatchupText } from "../../../src/features/advisor/application/conditionedMatchup";
import { composeMatchupReply } from "../../../src/features/advisor/answers/matchupReply";
import { checkMatchupFacts, checkedMatchupText } from "../../../src/features/advisor/answers/matchupFactCheck";
import { adviceQuestion } from "../../../src/features/advisor/application/adviceRelevance";
import { adviceUnit, actionEligible } from "../../../src/features/advisor/application/adviceActions";
import { planDialogue, splitDialogueQuestions } from "../../../src/features/advisor/conversation/dialoguePlanner";
import { emptyDialogue, scenarioConditions } from "../../../src/features/advisor/conversation/dialogueState";
import { currentPair } from "../../scripts/advisor/atom-context/build-conditional";
import { translations } from "../../../src/shared/i18n/translations";

const data = loadData("ko_KR");
const pair = (mine: string, enemy: string) => ({ mine: data.cardById.get(mine)!, enemy: data.cardById.get(enemy)! });
const unavailable = (question: string) => scenarioConditions(question, [], 1);

test("내 스킬 부재와 상대 궁 대응 대상을 구분한다", () => {
  const subjects = pair("Ahri", "Zed");
  assert.deepEqual(adviceQuestion("내 E가 없는데 상대 궁에 어떻게 대응해?", subjects).target, { owner: "enemy", slot: "R" });
  assert.equal(adviceQuestion("상대 W는 있고 내 E도 없어. 어떻게 해?", subjects).target, undefined);
  for (const q of ["내 E 없이 궁 대응은?", "내 E는 돌아왔고 R은 없어. 아까 상성에서 궁 대응은?"]) {
    assert.deepEqual(adviceQuestion(q, subjects).target, { owner: "enemy", slot: "R" });
  }
  assert.deepEqual(adviceQuestion("내 궁으로 어떻게 대응해?", subjects).target, { owner: "mine", slot: "R" });
});

test("매혹이 없는 제드 궁 대응을 파밍 조언으로 대신하지 않는다", () => {
  const request = { ...pair("Ahri", "Zed"), question: "내 E가 없는데 상대 궁에 어떻게 대응해?", conditions: unavailable("내 E가 없어") };
  const result = conditionMatchupText(data, "ko_KR", request, "제드 R 죽음의 표식이 붙으면 아리 E 매혹으로 콤보를 끊습니다.");
  assert.match(result.text, /제드 R.*다른 방법.*확인하지 못/);
  assert.doesNotMatch(result.text, /파밍|Q 견제/);
});

test("내 궁이 없어도 매혹이 돌아왔다면 궁 대응의 군중 제어 수단을 표시한다", () => {
  const result = conditionMatchupText(data, "ko_KR", { ...pair("Ahri", "Zed"), question: "상대 궁에 어떻게 대응해?", conditions: unavailable("내 R은 없고 내 E는 돌아왔어") }, "아리 R 혼령 질주로 접근해 E 매혹을 맞힙니다.");
  assert.match(result.text, /아리 E 매혹을 걸어/);
  assert.match(result.text, /표식.*아리 E 매혹을 걸어 콤보를 끊/);
  assert.doesNotMatch(result.text, /R가/);
});

test("쓰레쉬 Q 부재에서는 아군 이동용 랜턴 대신 가까운 상대의 E 대응을 고른다", () => {
  const result = conditionMatchupText(data, "ko_KR", { ...pair("Thresh", "Morgana"), question: "내 Q 없이 어떻게 들어가?", conditions: unavailable("내 Q가 없어") }, "쓰레쉬 Q 사형 선고로 거리를 좁힙니다.");
  assert.match(result.text, /상대 뒤에서.*앞에서/);
  assert.doesNotMatch(result.text, /아군이 직접 클릭/);
});

test("쓰레쉬 Q와 E가 없으면 랜턴을 본인 진입기로 제시하지 않는다", () => {
  const result = conditionMatchupText(data, "ko_KR", { ...pair("Thresh", "Morgana"), question: "그래도 진입해?", conditions: unavailable("내 Q와 E가 없어") }, "쓰레쉬 Q 사형 선고로 거리를 좁히고 E 사슬 채찍으로 붙잡습니다.");
  assert.match(result.text, /방어·거리 관리/);
  assert.doesNotMatch(result.text, /랜턴|아군이 직접 클릭/);
});

test("잭스 Q와 E 없이 딜 교환을 물으면 평타 W와 급소 원문을 고른다", () => {
  const result = conditionMatchupText(data, "ko_KR", { ...pair("Jax", "Fiora"), question: "내 Q와 E가 없는데 딜 교환은?", conditions: unavailable("내 Q와 E가 없어") }, "잭스 Q로 뛰어 E를 켭니다.");
  assert.match(result.text, /평타 → W.*평타/);
  assert.match(result.text, /급소.*짧은 딜 교환/);
  assert.doesNotMatch(result.text, /W와 R이 주문력|2~5레벨/);
});

test("일상어 반격 타이밍을 잭스 E 사용 요구로 해석하지 않는다", () => {
  const subjects = pair("Jax", "Fiora");
  assert.equal(actionEligible(adviceUnit("급소 반대쪽으로 서서 반격 타이밍을 잡습니다.", subjects), unavailable("내 E가 없어")), true);
  assert.equal(actionEligible(adviceUnit("E 반격으로 기절시킵니다.", subjects), unavailable("내 E가 없어")), false);
});

test("레오나 Q E R 부재에서 붙은 뒤 쓰는 W를 진입 대안으로 고르지 않는다", () => {
  const result = conditionMatchupText(data, "ko_KR", { ...pair("Leona", "Morgana"), question: "어떻게 진입해?", conditions: unavailable("내 Q와 E와 R이 없어") }, "레오나 E로 붙어 Q를 씁니다.");
  assert.match(result.text, /방어·거리 관리/);
  assert.doesNotMatch(result.text, /W 일식|붙은 직후/);
});

test("전투 결과의 보편적 단정을 제거하고 실제 스킬의 조건부 효과는 유지한다", () => {
  const cards = Object.values(pair("Ahri", "Darius"));
  assert.equal(checkMatchupFacts("다리우스의 모든 콤보는 E로 시작합니다.", cards)[0]?.reason, "unsupported-guarantee");
  assert.equal(checkedMatchupText("E부터 시작하면 그 뒤 스킬이 전부 확정으로 들어갑니다.", cards), "");
  assert.equal(checkedMatchupText("이동 불가를 막으면 응수가 기절을 겁니다.", cards), "이동 불가를 막으면 응수가 기절을 겁니다.");
});

test("적 챔피언에게만 허물어지는 벽을 아군이 깨고 나가라는 조언은 반증한다", () => {
  const cards = Object.values(pair("Thresh", "Morgana"));
  assert.equal(checkMatchupFacts("급하면 아군이 벽 하나를 일부러 부수고 빠져나갑니다.", cards)[0]?.reason, "effect-target");
  assert.equal(checkedMatchupText("적 챔피언이 벽을 통과하면 벽이 허물어집니다.", cards), "적 챔피언이 벽을 통과하면 벽이 허물어집니다.");
});

test("아군 역할 조건이 다른 가지는 각각 조건과 행동을 보존하고 표시한 한타 주제를 기억한다", () => {
  const request = { ...pair("Thresh", "Morgana"), question: "한타 때는?", focus: "teamfight", scope: "topic" as const, conditions: unavailable("내 Q가 없어") };
  const reply = composeMatchupReply(data, "ko_KR", request, currentPair("Thresh", "Morgana", data.patch));
  assert.equal(reply.answer.kind, "compare");
  if (reply.answer.kind === "compare") {
    assert.match(reply.answer.precomputed!, /아군이 뒤에서 싸우면.*E 사슬 채찍.*W 어둠의 통로로 보호/);
    assert.doesNotMatch(reply.answer.precomputed!, /아군이 먼저 진입하면/);
    assert.deepEqual(reply.topics, ["teamfight"]);
  }
});

test("조건과 콤보 이유는 보존하면서 모든 후속 스킬 적중 보장만 제외한다", () => {
  const request = { ...pair("Ahri", "Zed"), question: "콤보 알려줘", focus: "combo", scope: "topic" as const, conditions: unavailable("내 R이 없어") };
  const reply = composeMatchupReply(data, "ko_KR", request, currentPair("Ahri", "Zed", data.patch));
  assert.equal(reply.answer.kind, "compare");
  if (reply.answer.kind === "compare") {
    assert.match(reply.answer.precomputed!, /E 매혹 → W 여우불 → Q/);
    assert.doesNotMatch(reply.answer.precomputed!, /전부 확정/);
  }
});

test("영어 중국어 군중 제어도 실제 사용 가능한 내 스킬을 요구한다", () => {
  for (const text of ["Apply crowd control while the mark is active to interrupt his combo.", "用控制技能打断他的连招。"])
    assert.equal(actionEligible(adviceUnit(text, pair("Ahri", "Zed")), unavailable("내 E가 없어")), false);
});

test("쓰레쉬 랜턴의 아군 돌진은 내 이동기 대신 쓰지 않는다", () => {
  const unit = adviceUnit("사슬이 보이면 이동기로 범위 밖으로 나갑니다.", pair("Thresh", "Morgana"));
  assert.equal(actionEligible(unit, unavailable("내 Q가 없어")), false);
});

test("쉼표로 연결한 조건은 답할 요청과 한 문장으로 유지하고 독립 수치 질문은 나눈다", () => {
  for (const q of ["As Ahri against Zed, my E is down. How do I respond to enemy R?", "My E is available, but my R is down. What combo can I use?", "정정, 내 E는 돌아왔어. 콤보 알려줘"])
    assert.deepEqual(splitDialogueQuestions(q), [q]);
  assert.equal(splitDialogueQuestions("아리 Q 쿨타임 알려줘, 그리고 제드 R 사거리 알려줘").length, 2);
});

test("수치 조회 뒤 궁 대응으로 돌아오면 새 부재 조건을 기억한다", async () => {
  const memory = { ...emptyDialogue(data.patch), active: "spell" as const, spell: { champion: "Ahri", slot: "E", focus: "cooldown" as const }, matchup: { mine: "Ahri", enemy: "Zed" } };
  const ctx = { data, lang: "ko_KR" as const, copy: translations.ko_KR.advisor, turns: [{ role: "assistant" as const, memory }], championIds: [], consented: false, canUseModel: false, retrieval: false, judge: "offline" as const };
  const dialogue = await planDialogue("아까 상성에서 내 E는 다시 없어. 궁 대응은?", ctx, { judge: offlineFileJudge(), search: async () => [] }, "combined");
  assert.equal(dialogue.parts[0].plan.type, "matchup");
  assert.ok(dialogue.memory.conditions.some(c => c.owner === "mine" && c.slot === "E" && c.status === "down"));
});
