import assert from "node:assert/strict";
import { test } from "node:test";
import { requestedContent } from "../../../../src/features/advisor/understanding/requests/requestText";
import { asksSpellNumbers, detectSpellFocus } from "../../../../src/features/advisor/understanding/spells/spellFocus";
import { asksWholeKit } from "../../../../src/features/advisor/understanding/requests/askWords";

test("정정한 범위만 읽고 부재 조건의 아니라면은 보존한다", () => {
  assert.equal(requestedContent("쿨 말고 스킬 구성을 알려줘"), "스킬 구성을 알려줘");
  assert.equal(requestedContent("冷却不是重点，只想看技能组"), "看技能组");
  assert.equal(requestedContent("쿨 끝난 게 아니라면?"), "쿨 끝난 게 아니라면?");
  assert.equal(detectSpellFocus("Not asking for a combo guide, just the AP ratio on E")?.focus, "ratio");
});

test("수치 조회의 앞선 상황 설명과 실제 교전 타이밍 질문을 구분한다", () => {
  assert.equal(asksSpellNumbers("I want to dodge E. What's its base cooldown at rank 2?"), true);
  assert.equal(asksSpellNumbers("궁 쿨 빠지면 들어가도 돼?"), false);
  assert.equal(asksWholeKit("Q 쿨 말고 패시브 Q W E R이 각각 무슨 기능인지"), true);
  assert.equal(asksWholeKit("파이크와 아크샨 패시브 각각 설명해줘"), false);
  assert.equal(asksWholeKit("锐雯P技能说明提到暴击吗？"), false);
  assert.equal(asksWholeKit("锐雯完整技能组介绍"), true);
});
