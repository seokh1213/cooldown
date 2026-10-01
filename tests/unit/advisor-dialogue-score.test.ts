import assert from "node:assert/strict";
import { test } from "node:test";
import { matchesTarget, checksFor } from "../../scripts/llm/conversational-advisor/score";

test("채점은 스킬 대상과 상성 관점의 오류를 분리해 잡는다", () => {
  assert.equal(matchesTarget({ kind: "spell", champion: "Lux", slot: "R" }, { kind: "spell", champion: "Jax", slot: "R" }), false);
  assert.equal(matchesTarget({ kind: "matchup", mine: "Fiora", enemy: "Jax" }, { kind: "matchup", mine: "Jax", enemy: "Fiora" }), false);
});
test("섞인 요청 채점은 모든 하위 질문의 대상이 맞아야 통과한다", () => {
  const want = { kind: "multi", parts: [{ kind: "spell", champion: "Lux", slot: "R" }, { kind: "rule" }] };
  assert.equal(matchesTarget({ kind: "multi", parts: [{ kind: "spell", champion: "Lux", slot: "R" }] }, want), false);
  assert.equal(matchesTarget({ kind: "multi", parts: [{ kind: "rule" }, { kind: "spell", champion: "Lux", slot: "R" }] }, want), true);
});
test("같은 수치를 나열한 비교와 단일 대상 조회는 다른 과제로 채점한다", () => {
  assert.equal(matchesTarget({ kind: "compare", champions: ["Lux", "Jax"], slot: "R" }, { kind: "spell", champion: "Lux", slot: "R" }), false);
});
test("계산식만 나열하고 요청 결과가 없으면 직답 내용 검사를 통과하지 못한다", () => {
  const check = checksFor("s07", 0)[0];
  assert.equal(check.test("기본 쿨타임 × 100 / (100 + 가속)"), false);
  assert.equal(check.test("8초입니다."), true);
});
test("프리징은 자료 부재를 밝히면 범위 조건을 통과하고 포탑 소개는 실패한다", () => {
  const check = checksFor("s15", 0)[0];
  assert.equal(check.test("프리징을 푸는 절차가 정리되어 있지 않습니다."), true);
  assert.equal(check.test("포탑 방패 장치를 깨면 125골드입니다."), false);
});
