import assert from "node:assert/strict";
import { test } from "node:test";
import { loadData } from "../../scripts/llm/kev-agent/lib";
import { buildBroadAtoms } from "../../scripts/llm/atom-context/broad-build";
import { currentPair } from "../../scripts/llm/atom-context/build-conditional";
import { selectDecisionAnswer, type DecisionRequest } from "../../scripts/llm/atom-context/conditional";
import { emptyDialogue, scenarioConditions } from "../../src/lib/advisor/dialogueState";

const data = loadData("ko_KR");
const { atoms } = buildBroadAtoms();
function request(mine: string, enemy: string, question: string): DecisionRequest {
  return { mine, enemy, question, focus: "skill", pair: currentPair(mine, enemy, data.patch), baseline: "이번 턴의 현행 답",
    memory: { ...emptyDialogue(data.patch), conditions: scenarioConditions(question, [], 1) } };
}

test("그랩이 빠졌을 때는 럭스 견제를, 내 E도 빠졌으면 웨이브 행동을 고른다", () => {
  const available = selectDecisionAnswer(data, atoms, request("Lux", "Blitzcrank", "상대 Q가 빠졌어. 어떻게 교환해?"));
  assert.equal(available.atom, "blitz-down");
  const unavailable = selectDecisionAnswer(data, atoms, request("Lux", "Blitzcrank", "상대 Q가 빠졌고 내 E도 없어. 어떻게 교환해?"));
  assert.equal(unavailable.atom, "blitz-down-e-down");
  assert.doesNotMatch(unavailable.text, /광휘의 특이점을 터뜨리고/);
});

test("럭스 Q 부재로 진입하더라도 아리 궁의 탈출 몫을 유지한다", () => {
  const selected = selectDecisionAnswer(data, atoms, request("Ahri", "Lux", "상대 Q가 빠졌어. 어떻게 들어가?"));
  assert.equal(selected.atom, "lux-down");
  assert.match(selected.text, /빠져나올 몫을 최소 한 번 남/);
});

test("럼블 두 번째 작살과 보호막 소멸이라는 선행 조건을 함께 유지한다", () => {
  const selected = selectDecisionAnswer(data, atoms, request("Darius", "Rumble", "상대 E가 빠졌고 W도 빠졌어. 어떻게 들어가?"));
  assert.equal(selected.atom, "rumble-down");
  assert.match(selected.text, /두 번째 발을 피했고.*보호막이 사라진 뒤/s);
});

test("원래 기억에 W가 있어도 아이템·한타·새 팁으로 단위를 확장하지 않는다", () => {
  const input = request("Lux", "Yasuo", "상대 W가 빠졌어");
  for (const focus of ["teamfight", "situational-item", "laning"]) {
    const selected = selectDecisionAnswer(data, atoms, { ...input, question: "어떻게 해?", focus });
    assert.equal(selected.text, input.baseline);
    assert.equal(selected.fallback, "scope");
  }
  assert.equal(selectDecisionAnswer(data, atoms, { ...input, continuation: "advance" }).fallback, "scope");
});

test("지원하지 않는 상성 및 바뀐 출처는 현재 턴의 답으로 돌아간다", () => {
  const unsupported = request("Garen", "Teemo", "상대 Q가 빠졌으면?");
  assert.equal(selectDecisionAnswer(data, atoms, unsupported).fallback, "condition");
  const input = request("Lux", "Blitzcrank", "상대 Q가 빠졌어. 어떻게 교환해?");
  input.pair.escape = "바뀐 출처";
  assert.equal(selectDecisionAnswer(data, atoms, input).fallback, "source-drift");
});
