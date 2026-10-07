import assert from "node:assert/strict";
import test from "node:test";
import { comparePatchReports } from "../../scripts/llm/quality/patchComparison";
import type { QualityReport } from "../../scripts/llm/quality/types";

const report = () => ({ profile: "regression", caseHash: "cases", sourceHash: "code", scorerHash: "scorer", dataHash: "old",
  rows: [{ id: "one", mode: "none", pass: true, text: "140초", checks: [{ label: "target", pass: true }] }] }) as QualityReport;
test("패치 비교는 자료 차이만 허용하며 코드·채점·모델 변경을 거부한다", () => {
  const before = report(), after = report(); after.dataHash = "new"; after.rows[0].text = "120초";
  const result = comparePatchReports(after, before);
  assert.equal(result.regressions.length, 0); assert.equal(result.changedAnswers.length, 1);
  for (const key of ["caseHash", "sourceHash", "scorerHash", "graphHash"] as const) {
    const changed = structuredClone(after); changed[key] = "changed";
    assert.throws(() => comparePatchReports(changed, before), /input mismatch/);
  }
});
test("기존 실패에 가려진 새 검사 실패와 중복·누락도 거부한다", () => {
  const before = report(), after = report(); before.rows[0].pass = false; after.rows[0].pass = false;
  after.rows[0].checks[0].pass = false;
  assert.deepEqual(comparePatchReports(after, before).regressions, ["none:one"]);
  after.rows.push(after.rows[0]); assert.throws(() => comparePatchReports(after, before), /coverage/);
});
