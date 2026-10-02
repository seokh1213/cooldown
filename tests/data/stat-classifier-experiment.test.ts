import assert from "node:assert/strict";
import { test } from "node:test";
import { correctNames, data, inputFeatures, jamo, predict, queryFor } from "../../scripts/llm/stat-classifier/runtime";
import { auditSplits } from "../../scripts/llm/stat-classifier/splitAudit";
import type { Example, LinearModel } from "../../scripts/llm/stat-classifier/contracts";
import { emptyDialogue, type DialogueMemory } from "../../src/lib/advisor/dialogueState";

const memory: DialogueMemory = { ...emptyDialogue(data.patch), active: "stat",
  stat: { kind: "championStat", champions: ["MonkeyKing", "DrMundo"], field: "health", level: 11 } };

test("자모 분해는 받침과 영문을 보존한다", () => {
  assert.equal(jamo("가각A"), "ㄱㅏㄱㅏㄱA");
  assert.equal(jamo("공격"), "ㄱㅗㅇㄱㅕㄱ");
});

test("인식한 이름 전체를 가려 항목 분류에 이름 길이가 영향을 주지 않는다", () => {
  const input = inputFeatures("오공랑 문도 박사 체력", memory);
  assert.equal(input.text, "◇랑 ◇ 체력");
  assert.equal(input.features["names=2"], 1);
});

test("같은 회복량 질문도 활성 문맥에 따라 다른 특징을 갖는다", () => {
  const stat = inputFeatures("회복량", memory);
  const spell = inputFeatures("회복량", { ...memory, active: "spell" });
  assert.equal(stat.text, spell.text);
  assert.equal(stat.features["active=stat:gram=회복"], 1);
  assert.equal(spell.features["active=spell:gram=회복"], 1);
});

test("모델이 정한 항목을 사용하면서 코드가 대상과 레벨을 유지한다", () => {
  assert.deepEqual(queryFor("both health regneration please", memory, "healthRegen"), {
    kind: "championStat", champions: ["MonkeyKing", "DrMundo"], field: "healthRegen", level: 11,
  });
  assert.deepEqual(queryFor("문도만 18레벨", memory, "inherit"), {
    kind: "championStat", champions: ["DrMundo"], field: "health", level: 18,
  });
  assert.equal(queryFor("문도만", { ...memory, active: "spell" }, "inherit"), null);
  assert.deepEqual(queryFor("문도만 18레벨", { ...memory, stat: { ...memory.stat!, fields: ["health", "healthRegen"] } }, "inherit"), {
    kind: "championStat", champions: ["DrMundo"], field: "health", fields: ["health", "healthRegen"], level: 18,
  });
});

test("학습한 항목도 스킬·아이템·미지원 레벨 차단을 우회하지 않는다", () => {
  for (const question of ["문도 R 회복량", "체력 물약 회복량", "마나 회복량", "문도 2레벨 체력"]) {
    assert.equal(queryFor(question, memory, "healthRegen"), null, question);
  }
});

test("이름 후보를 사용해도 일반어 아니를 아리로 바꾸지 않는다", () => {
  assert.deepEqual(correctNames("아니 회복량").changes, []);
  assert.deepEqual(correctNames("오공랑 재이스 체력 비교").changes, [{ original: "재이스", id: "Jayce" }]);
});

test("선형 계산은 채널별 정규화와 문맥 오프셋을 적용하고 낮은 확신은 거절한다", () => {
  const model: LinearModel = { name: "fixture", labels: ["health", "other"], bias: [0, 0], confidence: 0.8, margin: 0,
    channels: [{ kind: "char", vocabulary: { ab: 0, ba: 1 }, idf: [1, 1] }, { kind: "context", vocabulary: { stat: 0 } }],
    weights: [[2, 0, 1], [0, 2, -1]] };
  const input = { text: "abab", features: { stat: 1 } };
  const expected = 1 / (1 + Math.exp(-(2 / Math.sqrt(5) + 2)));
  assert.ok(Math.abs(predict(model, input).probabilities[0] - expected) < 1e-12);
  assert.equal(predict(model, input).label, "health");
  assert.equal(predict({ ...model, confidence: 0.99 }, input).label, "other");
});

test("표현 계열이나 띄어쓰기 변형이 split을 넘으면 평가를 중단한다", () => {
  const row: Example = { id: "a", family: "same", split: "train", category: "field", question: "체력 재생",
    memory, text: "체력 재생", features: {}, label: "healthRegen", expected: null };
  assert.throws(() => auditSplits([row, { ...row, id: "b", split: "test", question: "체력재생" }]), /split 중복/);
  assert.throws(() => auditSplits([row, { ...row, id: "b", family: "different", split: "test", question: "체력재생" }]), /입력 1/);
});
