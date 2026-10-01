import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeTooltipText } from "../../scripts/llm/lib/tooltipFingerprint";
import { digestSpellText } from "../../scripts/llm/lib/spellOverrides";

test("고정 계수와 중첩된 레벨별 계수 범위를 같은 문구로 비교한다", () => {
  assert.equal(
    digestSpellText("((60% 공격력) + (20% 주문력))의 물리 피해를 입힙니다."),
    digestSpellText("(((15% ~ 60%) 공격력) + ((5% ~ 20%) 주문력))의 물리 피해를 입힙니다."),
  );
});

test("괄호 깊이와 수치 목록의 곱셈 표기만 달라져도 지문을 유지한다", () => {
  assert.equal(
    digestSpellText("(104/155.25/330 + (156/162/180% 추가 공격력))의 마법 피해"),
    digestSpellText("((((80/115/220)))) + (120% 추가 공격력) × 1.3/1.35/1.5의 마법 피해"),
  );
});

test("단위 앞 한 자리 수와 레벨별 재사용 대기시간 범위를 동일하게 처리한다", () => {
  assert.equal(digestSpellText("8초마다 방패를 던집니다."), digestSpellText("(16 ~ 8)초마다 방패를 던집니다."));
});

test("단검 회수의 고정 환급량과 레벨별 환급 수식을 동일하게 처리한다", () => {
  assert.equal(
    digestSpellText("재사용 대기시간이 11.52/10.56/7.68초 (96%) 줄어듭니다."),
    digestSpellText("재사용 대기시간이 (0.78 ~ 0.96) × 12/11/8초 ((78% ~ 96%)) 줄어듭니다."),
  );
});

test("괄호 안 사용 조건의 변경을 감지한다", () => {
  assert.notEqual(digestSpellText("피해를 입힙니다. (챔피언 적중 시 회복)"), digestSpellText("피해를 입힙니다. (미니언 적중 시 회복)"));
});

test("괄호 안 효과의 변경을 감지한다", () => {
  assert.notEqual(digestSpellText("피해를 입힙니다. (추가 효과: 기절)"), digestSpellText("피해를 입힙니다. (추가 효과: 둔화)"));
});

test("피해 유형과 수식에 쓰인 능력치의 변경을 감지한다", () => {
  assert.notEqual(digestSpellText("(100 + 60% 주문력)의 마법 피해"), digestSpellText("(100 + 60% 주문력)의 물리 피해"));
  assert.notEqual(digestSpellText("(100 + 60% 주문력)의 마법 피해"), digestSpellText("(100 + 60% 공격력)의 마법 피해"));
});

test("문장 사이 공백과 수식 연산자를 정규화한다", () => {
  assert.equal(normalizeTooltipText("  (20 ~ 30)% × 1.3 + 2.5\n 마법 피해.  "), "마법 피해");
});
