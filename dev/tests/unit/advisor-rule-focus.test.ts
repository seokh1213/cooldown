import assert from "node:assert/strict";
import test from "node:test";
import { buildRuleAnswer } from "../../../src/features/advisor/answers/answer";
import { focusedRuleLines, ruleAnswerText } from "../../../src/features/advisor/understanding/ruleFocus";
import { dehydrateAnswer, reviveAnswer } from "../../../src/features/advisor/storage/history";
import type { RuleNotes } from "../../../src/domain/knowledge/rules";

const rule: RuleNotes = {
  name: "테스트 주문", nameEn: "Example Spell", nameZh: "测试技能", page: "Example_Spell", subject: "summoner",
  notes: [
    "Each tick of Example Spell deals level-scaled true damage.",
    "Example Spell deals damage in seven ticks, about two seconds apart.",
    "Example Spell triggers another rune on its first tick. Subsequent ticks cannot trigger the rune.",
    "Example Spell cannot reveal stealthed targets because it does not grant true sight.",
    "Example Spell's damage cannot be amplified by damage amplifiers.",
  ],
  notesKo: [
    "매 틱은 레벨에 따라 달라지는 고정 피해를 입힙니다.",
    "약 2초 간격으로 총 7틱의 피해를 줍니다.",
    "첫 틱에는 다른 룬을 발동합니다. 이후 틱에는 발동하지 않습니다.",
    "진실의 시야를 주지 않으므로 은신한 대상을 드러내지 못합니다.",
    "피해 증폭 효과로 피해가 늘어나지 않습니다.",
  ],
  notesZh: ["每跳造成随等级变化的真实伤害。", "约每两秒造成伤害，共7跳。", "第一跳触发其他符文，后续伤害不触发。", "不提供真实视野，无法显形隐身的目标。", "伤害不会被伤害增幅效果提高。"],
};

for (const [lang, question] of [
  ["ko_KR", "테스트 주문 틱 간격은?"],
  ["en_US", "Example Spell tick interval?"],
  ["zh_CN", "测试技能每跳间隔是多少？"],
] as const) test(`${lang}: 틱 간격은 임의 개체의 검수 문장으로 답한다`, () => {
  const answer = buildRuleAnswer(rule, { lang, question });
  assert.equal(answer.kind, "rule");
  if (answer.kind !== "rule") return;
  const localized = lang === "ko_KR" ? rule.notesKo! : lang === "zh_CN" ? rule.notesZh! : rule.notes;
  assert.deepEqual(answer.highlighted, [localized[1]]);
  assert.deepEqual(new Set([...answer.highlighted, ...answer.rest]), new Set(localized));
  assert.equal(answer.focus, "ticks");
  assert.deepEqual(reviveAnswer(JSON.parse(JSON.stringify(dehydrateAnswer(answer)))), answer);
});

test("틱당 피해 질문은 레벨 조건과 피해 종류를 보존한다", () => {
  assert.deepEqual(focusedRuleLines(rule, "테스트 주문 틱당 피해는?", "ko_KR"), [rule.notesKo![0], rule.notesKo![1]]);
});

test("은신 질문은 시야 조건까지 한 문장으로 답한다", () => {
  assert.deepEqual(focusedRuleLines(rule, "테스트 주문 은신 보여?", "ko_KR"), [rule.notesKo![3]]);
});

test("피해 증폭 질문은 피해가 나온 모든 줄을 나열하지 않는다", () => {
  assert.deepEqual(focusedRuleLines(rule, "테스트 주문 피해 증폭 돼?", "ko_KR"), [rule.notesKo![4]]);
});

test("복합 질문의 서로 다른 측면을 모두 보존한다", () => {
  assert.deepEqual(focusedRuleLines(rule, "테스트 주문 은신과 피해 증폭은?", "ko_KR"), [rule.notesKo![3], rule.notesKo![4]]);
  assert.deepEqual(focusedRuleLines(rule, "테스트 주문 틱 간격이랑 피해 증폭은?", "ko_KR"), [rule.notesKo![1], rule.notesKo![4]]);
});

test("같이 물은 개체의 발동 조건을 틱 간격으로 대체하지 않는다", () => {
  const answer = buildRuleAnswer(rule, { question: "테스트 주문 첫 틱에 다른 룬 발동돼?", mentionedNames: [rule.name, "다른 룬"] });
  assert.equal(answer.kind, "rule");
  if (answer.kind === "rule") assert.deepEqual(answer.highlighted, [rule.notesKo![2]]);
});

test("개요와 근거가 없는 질문은 임의 문장을 정답으로 고르지 않는다", () => {
  assert.deepEqual(focusedRuleLines(rule, "테스트 주문 설명해줘", "ko_KR"), []);
  assert.deepEqual(focusedRuleLines(rule, "테스트 주문 룬 효과 알려줘", "ko_KR"), []);
  assert.deepEqual(focusedRuleLines(rule, "테스트 주문 우주선 가격은?", "ko_KR"), []);
  assert.deepEqual(focusedRuleLines(rule, "테스트 주문 들어도 돼?", "ko_KR"), []);
  assert.deepEqual(focusedRuleLines(rule, "How do I proc Example Spell?", "en_US"), []);
  assert.deepEqual(focusedRuleLines(rule, "Example Spell damage amount?", "en_US"), []);
});

test("골라낸 문장에 주어가 없어도 복사한 답의 대상을 알 수 있다", () => {
  assert.equal(ruleAnswerText(rule, [rule.notesKo![3]], "ko_KR"), `테스트 주문: ${rule.notesKo![3]}`);
});

test("쿨타임 조회는 관련 없는 피해 규칙을 다시 붙이지 않는다", () => {
  const answer = buildRuleAnswer(rule, { question: "테스트 주문 쿨타임?", cooldownSeconds: 42 });
  assert.equal(answer.kind, "rule");
  if (answer.kind === "rule") assert.deepEqual(answer.highlighted, ["재사용 대기시간 42초"]);
});
