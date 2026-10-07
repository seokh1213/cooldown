import assert from "node:assert/strict";
import test from "node:test";
import { pendingCases, safeEmbeddedJson } from "../../scripts/llm/review/packet";
import type { QualityReport, QualityStory } from "../../scripts/llm/quality/types";

test("검수는 측정 모드를 묶되 분류 실패와 의미 미확정 상성만 포함한다", () => {
  const bank = [{ id: "one", turns: [{ q: "질문", expected: { scope: "ability" } }], sources: [] }] as unknown as QualityStory[];
  const report = { rows: [
    { id: "one:0", question: "질문", mode: "none", suite: ["retired-matchup-4"], pass: null },
    { id: "one:0", question: "질문", mode: "offline", suite: ["retired-matchup-4"], pass: null },
    { id: "one:0", question: "질문", mode: "model", suite: ["other"], pass: true },
  ] } as unknown as QualityReport;
  const [entry] = pendingCases(report, bank);
  assert.equal(entry.measurements.length, 2);
  assert.deepEqual(entry.expected, { scope: "ability" });
  assert.throws(() => pendingCases(report, []), /source mismatch/);
});
test("독립 HTML의 JSON은 script 종료 문자열도 안전하게 보존한다", () => {
  const value = { text: "</script><img src=x onerror=alert(1)>\u2028" };
  const encoded = safeEmbeddedJson(value);
  assert.ok(!encoded.includes("<"));
  assert.deepEqual(JSON.parse(encoded), value);
});
