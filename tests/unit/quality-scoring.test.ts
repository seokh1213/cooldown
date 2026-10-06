import assert from "node:assert/strict";
import { test } from "node:test";
import { healingDoesNotStack } from "../../scripts/llm/conversational-advisor/score";
import { sameStatQuery, routeCheck } from "../../scripts/llm/quality/checks";
import { evaluationDeps, qualityContext } from "../../scripts/llm/quality/dialogue";
import type { ChampionStatQuery } from "../../src/lib/advisor/statQuery";
import { grade } from "../../scripts/llm/mechanic-schema/cases";
import { applyReviewedContracts, type ReviewedContract } from "../../scripts/llm/quality/reviewedContracts";
import type { QualityStory } from "../../scripts/llm/quality/types";
import { detectStats } from "../../src/lib/advisor/statQuery";

test("비중첩의 동의어를 인정하되 합산된다는 모순은 기각한다", () => {
  assert.equal(healingDoesNotStack("치유 감소율은 여러 개를 적용해도 합산되지 않습니다."), true);
  assert.equal(healingDoesNotStack("치유 감소율은 중첩되지 않습니다."), true);
  assert.equal(healingDoesNotStack("치유 감소율은 중첩됩니다."), false);
  assert.equal(healingDoesNotStack("합산되지 않습니다. 하지만 치유 감소율은 중첩됩니다."), false);
});

test("단일 항목의 같은 표현만 인정하고 대상·레벨·추가 항목 오류는 기각한다", () => {
  const query: ChampionStatQuery = { kind: "championStat", champions: ["Lux"], field: "health", level: 1 };
  assert.equal(sameStatQuery({ ...query, fields: ["health"] }, query), true);
  assert.equal(sameStatQuery({ ...query, fields: ["health", "armor"] }, query), false);
  assert.equal(sameStatQuery({ ...query, champions: ["Ahri"] }, query), false);
  assert.equal(sameStatQuery({ ...query, level: 18 }, query), false);
  assert.equal(sameStatQuery({ ...query, fields: ["armor"] }, query), false);
  assert.equal(sameStatQuery(undefined, null), true);
});

test("생명력 흡수의 효과와 기본 생명력 수치를 구분한다", () => {
  assert.deepEqual(detectStats("기본 생명력 수치는?"), ["health"]);
  assert.deepEqual(detectStats("기본 평타에 생명력 흡수가 적용돼?"), []);
});

test("모델 없는 경로도 실제 낱말 판정을 검사하고 오답 기대값은 통과하지 않는다", async () => {
  const ctx = qualityContext("ko_KR", "none"), deps = evaluationDeps();
  const input = { question: "오공으로 럼블 상대법 알려줘", ctx, deps };
  assert.deepEqual(await routeCheck({ ...input, expected: { routeGold: "matchup" } }), [{ label: "route-kind", pass: true }]);
  assert.deepEqual(await routeCheck({ ...input, expected: { routeGold: "skills" } }), [{ label: "route-kind", pass: false }]);
});

test("보호막 대상 조건의 동의어를 인정하고 미니언에게 보호막을 주는 오답은 기각한다", () => {
  const item = { id: "target", group: "target", question: "미니언 보호막?", split: "new" as const,
    checks: ["미니언에게는 보호막이 생기지 않아"] };
  assert.equal(grade("미니언은 이 효과의 챔피언 대상 조건에 해당하지 않습니다.", item).pass, true);
  assert.equal(grade("미니언에게도 보호막이 생깁니다.", item).pass, false);
});

test("수동 질문의 기대값을 등록하면 ID·출처를 유지하고 오래된 답 보호는 해제한다", () => {
  const story: QualityStory = { id: "a", suites: ["manual"], lang: "ko_KR", split: "regression", manual: true,
    turns: [{ q: "질문", expected: { sameAsBaseline: true } }], sources: [{ file: "input.json", row: "one" }] };
  const contract: ReviewedContract = { id: "a:0", question: "질문", sources: story.sources, expected: { must: ["조건"] },
    review: "contract", reason: "승인 출처와 조건 대조", patch: "26.19" };
  const [updated] = applyReviewedContracts([story], [contract]);
  assert.equal(updated.id, "a");
  assert.equal(updated.manual, false);
  assert.equal(updated.turns[0].expected.sameAsBaseline, undefined);
  assert.throws(() => applyReviewedContracts([story], [contract, contract]), /Duplicate/);
  assert.throws(() => applyReviewedContracts([story], [{ ...contract, question: "다른 질문" }]), /matches source/);
  assert.throws(() => applyReviewedContracts([story], [{ ...contract, id: "missing:0" }]), /missing/);
});
