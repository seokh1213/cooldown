import assert from "node:assert/strict";
import { test } from "node:test";
import { loadData } from "../../scripts/llm/kev-agent/lib";
import { buildConditional, currentPair } from "../../scripts/llm/atom-context/build-conditional";
import { compileDecisionAtoms, selectDecisionAnswer, type DecisionRequest, type DecisionSeed } from "../../scripts/llm/atom-context/conditional";
import { emptyDialogue, scenarioConditions } from "../../src/lib/advisor/dialogueState";

const data = loadData("ko_KR");
const { atoms } = buildConditional();
const pair = (mine: string, enemy: string) => currentPair(mine, enemy, data.patch);
function request(mine = "Jax", enemy = "Fiora", question = "피오라 W 응수 어떻게 빼?"): DecisionRequest {
  return { mine, enemy, question, pair: pair(mine, enemy), memory: emptyDialogue(data.patch), baseline: "현재 답변" };
}

test("W가 빠지면 잭스의 현재 콤보 근거를 쓰고 살아 있을 때 경고를 제외한다", () => {
  const input = request("Jax", "Fiora", "상대 W가 빠졌으면 어떻게 교환해?");
  input.memory.conditions = scenarioConditions(input.question, [], 1);
  const selected = selectDecisionAnswer(data, atoms, input);
  assert.equal(selected.atom, "jax-fiora-w-down");
  assert.match(selected.text, /잭스 E 반격을 켜고 잭스 Q 도약 공격/);
  assert.doesNotMatch(selected.text, /응수가 살아 있는 동안|응수를 빼낸 뒤/);
});

test("정정으로 W가 다시 있고 Q가 빠지면 위험한 재발동과 옆무빙을 설명한다", () => {
  const input = request("Jax", "Fiora", "왜 E 재발동을 조심해야 해?");
  const down = scenarioConditions("상대 W가 빠졌으면?", [], 1);
  input.memory.conditions = scenarioConditions("정정, 상대 W는 있고 Q가 빠진 거야", down, 2);
  const selected = selectDecisionAnswer(data, atoms, input);
  assert.equal(selected.atom, "jax-fiora-w-ready");
  assert.match(selected.text, /상대 W 사용 가능 · 상대 Q 재사용 대기 중/);
  assert.match(selected.text, /옆무빙/);
  assert.doesNotMatch(selected.text, /Q 찌르기가 들어올 수/);
});

test("내 E도 빠졌다면 재진입 콤보 대신 E가 돌아올 때까지 파밍하는 근거를 고른다", () => {
  const input = request("Jax", "Fiora", "상대 W가 빠졌고 내 E도 빠졌어. 어떻게 교환해?");
  input.memory.conditions = scenarioConditions(input.question, [], 1);
  const selected = selectDecisionAnswer(data, atoms, input);
  assert.equal(selected.atom, "jax-fiora-w-down-e-down");
  assert.match(selected.text, /E 반격이 쿨타임이면 사거리 밖에서 파밍만/);
  assert.doesNotMatch(selected.text, /E 반격을 켜고/);
});

test("내 Q가 빠진 상황은 도약 콤보 없이 붙었을 때의 짧은 교환만 안내한다", () => {
  const input = request("Jax", "Fiora", "상대 W는 빠졌지만 내 Q가 없는데 어떻게 해?");
  input.memory.conditions = scenarioConditions(input.question, [], 1);
  const selected = selectDecisionAnswer(data, atoms, input);
  assert.equal(selected.atom, "jax-fiora-w-down-q-down");
  assert.match(selected.text, /붙어서 짧게 교환할 때는 기본 공격/);
  assert.doesNotMatch(selected.text, /잭스 Q 도약 공격으로 들어가/);
});

test("챔피언을 바꾸면 아트록스 전용 Q 유도와 잭스의 E 대응을 구분한다", () => {
  const aatrox = selectDecisionAnswer(data, atoms, request("Aatrox"));
  const jax = selectDecisionAnswer(data, atoms, request());
  assert.equal(aatrox.atom, "aatrox-fiora-w-ready");
  assert.match(aatrox.text, /Q 1·2타로 응수를 유도/);
  assert.doesNotMatch(jax.text, /Q 1·2타로/);
});

test("아트록스는 응수가 빠져도 피오라 Q 직후라는 진입 조건을 함께 보여준다", () => {
  const input = request("Aatrox", "Fiora", "상대 W가 빠지면 무엇부터 해?");
  input.memory.conditions = scenarioConditions(input.question, [], 1);
  const selected = selectDecisionAnswer(data, atoms, input);
  assert.equal(selected.atom, "aatrox-fiora-w-down");
  assert.match(selected.text, /피오라 Q 찌르기를 쓰게 만든 직후.*피오라 W 응수까지 빠졌다면/s);
});

test("출처 내용이 바뀌거나 다른 상대에게만 맞는 노트면 현재 답변으로 복귀한다", () => {
  const input = request();
  input.pair = { ...input.pair, watch: "내용이 변경되었습니다." };
  assert.deepEqual(selectDecisionAnswer(data, atoms, input), { text: "현재 답변", fallback: "source-drift" });
  const source = atoms.find(atom => atom.id === "aatrox-fiora-w-ready")!;
  const wrong: DecisionSeed = { ...source, id: "wrong-owner", mine: "Jax", reason: source.reason, action: source.action };
  assert.throws(() => compileDecisionAtoms(data, [wrong], pair), /현재 출처에서 인용을 찾지 못함/);
});

test("W와 관계없는 라인전·아이템 질문은 기존 답변을 유지한다", () => {
  const selected = selectDecisionAnswer(data, atoms, request("Jax", "Fiora", "라인전은 어떻게 해?"));
  assert.deepEqual(selected, { text: "현재 답변", fallback: "scope" });
});
