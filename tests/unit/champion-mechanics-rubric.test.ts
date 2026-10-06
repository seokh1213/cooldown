import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { gradeAnswer } from "../../scripts/llm/champion-mechanics/evaluate";
import { reviewedRubric, MECHANICS_QUESTIONS, type MechanicsStory } from "../../scripts/llm/champion-mechanics/reviewedRubric";
import type { ReviewedContract } from "../../scripts/llm/quality/reviewedContracts";

const stories = JSON.parse(readFileSync(MECHANICS_QUESTIONS, "utf8")) as MechanicsStory[];
const contracts = readFileSync("research/llm-evals/workflow/datasets/regression/reviewed-contracts.jsonl", "utf8")
  .trim().split("\n").map(line => JSON.parse(line) as ReviewedContract);

test("배포 평가도 검수한 인터페이스 계약을 사용해 과거 공격 효과 오답을 거부한다", () => {
  const rubric = reviewedRubric(stories, contracts);
  const expected = rubric.find(story => story.id === "aphelios-interface")!.turns[0];
  assert.equal(expected.sameAsBaseline, undefined);
  assert.deepEqual(gradeAnswer(expected, "무기 정보를 표시하는 인터페이스입니다. 직접 시전하는 스킬이 아니므로 공격 효과가 없습니다."), []);
  assert.ok(gradeAnswer(expected, "쿨 0 · 둔화 · 속박 · 회복").length);
  assert.deepEqual(rubric.find(story => story.id === "morde-stats"), stories.find(story => story.id === "morde-stats"));
});

test("검수하지 않은 문자열 보호와 기존 필수 조건을 유지한다", () => {
  const rubric = reviewedRubric(stories, []);
  assert.deepEqual(rubric, stories);
  assert.deepEqual(gradeAnswer({ q: "fixture", require: ["마나"], must: ["60"] }, "마나"), ["missing:60"]);
  assert.deepEqual(gradeAnswer({ q: "fixture", require: ["마나"], must: ["60"] }, "60"), ["missing:마나"]);
});

test("질문이나 출처가 바뀌면 과거 검수 계약을 적용하지 않는다", () => {
  const changed = stories.map(story => story.id === "aphelios-interface"
    ? { ...story, turns: [{ ...story.turns[0], q: "다른 질문" }] } : story);
  assert.throws(() => reviewedRubric(changed, contracts), /missing from bank|no longer matches source/);
  const duplicate = contracts.find(entry => entry.sources.some(source => source.row === "aphelios-interface"))!;
  assert.throws(() => reviewedRubric(stories, [duplicate, duplicate]), /Duplicate reviewed contract/);
});
