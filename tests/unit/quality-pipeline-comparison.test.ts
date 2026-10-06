import assert from "node:assert/strict";
import { test } from "node:test";
import { digest } from "../../scripts/llm/quality/bank";
import { comparePipelineReports, type DataProvenance } from "../../scripts/llm/quality/pipelineComparison";
import type { QualityReport } from "../../scripts/llm/quality/types";

function fixture() {
  const baseline: DataProvenance = { dataFiles: [["public/models/offline/request-v1.bin", "old"],
    ["public/models/offline/request-v1.json", "old-meta"], ["public/data/26.19/cards.json", "same"]] };
  const current: DataProvenance = { dataFiles: baseline.dataFiles.map(([file, hash]) => [file, file.endsWith(".bin") ? "new" : hash]) };
  const report = (data: DataProvenance): QualityReport => ({ schema: 1, profile: "model", caseHash: "cases", scorerHash: "scorer",
    dataHash: digest(data.dataFiles), sourceHash: "source", graphHash: "qa", numericPurpose: "qa", created: "fixed", checks: [],
    rows: [{ id: "one", suite: ["test"], mode: "model", question: "Q", text: "A", pass: true, checks: [], seconds: 0 }] });
  return { provenance: { current, baseline }, current: report(current), baseline: report(baseline) };
}

test("분류기만 교체한 파이프라인 비교는 원본 해시와 바뀐 파일을 보존한다", () => {
  const input = fixture(), originalHash = input.current.dataHash;
  const result = comparePipelineReports(input.current, input.baseline, input.provenance);
  assert.deepEqual(result.changedArtifacts, [{ file: "public/models/offline/request-v1.bin", before: "old", after: "new" }]);
  assert.equal(input.current.dataHash, originalHash);
  input.current.rows[0].pass = false;
  assert.deepEqual(comparePipelineReports(input.current, input.baseline, input.provenance).regressions, ["model:one"]);
});

test("게임 데이터·QA 웨이트·채점 기준이 다르거나 입력 출처가 변조되면 비교를 거부한다", () => {
  const input = fixture();
  input.provenance.current.dataFiles[2][1] = "different-patch";
  input.current.dataHash = digest(input.provenance.current.dataFiles);
  assert.throws(() => comparePipelineReports(input.current, input.baseline, input.provenance), /only permits/);
  const weights = fixture(); weights.current.graphHash = "other-qa";
  assert.throws(() => comparePipelineReports(weights.current, weights.baseline, weights.provenance), /same QA/);
  const scorer = fixture(); scorer.current.scorerHash = "other-scorer";
  assert.throws(() => comparePipelineReports(scorer.current, scorer.baseline, scorer.provenance), /different cases/);
  const tampered = fixture(); tampered.current.dataHash = "unverified";
  assert.throws(() => comparePipelineReports(tampered.current, tampered.baseline, tampered.provenance), /provenance/);
});

test("분류기 삭제·중복 출처·불완전한 질문 집합은 비교하지 않는다", () => {
  const deleted = fixture(); deleted.provenance.current.dataFiles.shift(); deleted.current.dataHash = digest(deleted.provenance.current.dataFiles);
  assert.throws(() => comparePipelineReports(deleted.current, deleted.baseline, deleted.provenance), /only permits/);
  const duplicate = fixture(); duplicate.provenance.current.dataFiles.push(duplicate.provenance.current.dataFiles[0]);
  duplicate.current.dataHash = digest(duplicate.provenance.current.dataFiles);
  assert.throws(() => comparePipelineReports(duplicate.current, duplicate.baseline, duplicate.provenance), /provenance/);
  const partial = fixture(); partial.current.rows = [];
  assert.throws(() => comparePipelineReports(partial.current, partial.baseline, partial.provenance), /coverage mismatch/);
});

test("능력치 분류기 추가와 교체도 원본 해시와 엄격한 회귀 기준을 보존한다", () => {
  const input = fixture();
  input.provenance.current.dataFiles.push(["public/models/offline/stat-v1.json", "new-stat"]);
  input.current.dataHash = digest(input.provenance.current.dataFiles);
  const added = comparePipelineReports(input.current, input.baseline, input.provenance);
  assert.deepEqual(added.changedArtifacts.find(row => row.file.endsWith("stat-v1.json")), {
    file: "public/models/offline/stat-v1.json", before: undefined, after: "new-stat",
  });
  input.provenance.baseline.dataFiles.push(["public/models/offline/stat-v1.json", "old-stat"]);
  input.baseline.dataHash = digest(input.provenance.baseline.dataFiles);
  assert.equal(comparePipelineReports(input.current, input.baseline, input.provenance).changedArtifacts.at(-1)?.before, "old-stat");
  input.provenance.current.dataFiles.pop();
  input.current.dataHash = digest(input.provenance.current.dataFiles);
  assert.throws(() => comparePipelineReports(input.current, input.baseline, input.provenance), /only permits/);
});
