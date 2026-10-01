import assert from "node:assert/strict";
import { test } from "node:test";
import { detectRatios } from "../../src/lib/knowledge/facts-ratios";

test("레벨에 따라 달라지는 계수 범위에서도 스탯별 최대값을 수집한다", () => {
  assert.deepEqual(detectRatios("((70% ~ 100%) 주문력) + ((15% ~ 60%) 공격력)"), { 주문력: 100, 공격력: 60 });
});

test("체력 계수의 범위와 랭크 목록을 구분해 읽는다", () => {
  assert.deepEqual(detectRatios("대상 최대 체력의 (5.0% ~ 10.0%)와 추가 체력의 6/6.5/7/7.5/8%"), { "최대 체력": 10, "추가 체력": 8 });
});

test("고정 계수와 범위가 함께 나오면 스탯별 가장 큰 값을 쓴다", () => {
  assert.deepEqual(detectRatios("(50% 주문력) + ((40% ~ 70%) 주문력) + (60% 추가 공격력)"), { 주문력: 70, "추가 공격력": 60 });
});

test("퍼센트가 없는 체력 수치와 범위는 계수로 만들지 않는다", () => {
  assert.deepEqual(detectRatios("최대 체력의 15와 (68 ~ 240)의 마법 피해"), {});
});
