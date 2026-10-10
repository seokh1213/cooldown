import assert from "node:assert/strict";
import test from "node:test";
import { conversionAmount, cooldownRemaining, isMechanicFollowup } from "../../../scripts/advisor/champion-mechanics/questionDetails";

test("전환량은 0·소수와 짧은 후속 수치를 허용한다", () => {
  assert.equal(conversionAmount("추가 체력 0이면?"), 0);
  assert.equal(conversionAmount("체력 14.5짜리면?"), 14.5);
  assert.equal(conversionAmount("280은?"), 280);
  assert.equal(conversionAmount("그럼 280짜리는?"), 280);
});
test("정정한 숫자만 계산하고 복수 수치나 음수는 추정하지 않는다", () => {
  assert.equal(conversionAmount("체력 140 말고 280이면 공격력은?"), 280);
  assert.equal(conversionAmount("체력 140 대신 체력 280이면?"), 280);
  assert.equal(conversionAmount("체력 140과 체력 280짜리면?"), undefined);
  assert.equal(conversionAmount("체력 -140이면?"), undefined);
  assert.equal(conversionAmount("-140 체력이면?"), undefined);
});
test("짧은 조건·수치만 이전 주제를 이어받고 다른 질문에는 적용하지 않는다", () => {
  assert.equal(isMechanicFollowup("280은?"), true);
  assert.equal(isMechanicFollowup("쿨 남았으면?"), true);
  assert.equal(isMechanicFollowup("아리 280 체력은?"), false);
  assert.equal(isMechanicFollowup("도란검 가격은?"), false);
});
test("쿨이 남지 않은 조건과 아직 돌지 않은 조건을 구분한다", () => {
  assert.equal(cooldownRemaining("보호막 쿨이 안 남았으면?"), false);
  assert.equal(cooldownRemaining("쿨이 남지 않았으면?"), false);
  assert.equal(cooldownRemaining("쿨이 다 돌았으면?"), false);
  assert.equal(cooldownRemaining("쿨이 안 돌았으면?"), true);
  assert.equal(cooldownRemaining("쿨 남았으면?"), true);
  assert.equal(cooldownRemaining("쿨이 몇 초야?"), undefined);
});
