import fs from "node:fs";
import path from "node:path";
import type { QualityReport, QualityRow } from "./types";

const rowKey = (row: QualityRow) => `${row.mode}:${row.id}`;
export function compareReports(current: QualityReport, baseline: QualityReport) {
  if (current.caseHash !== baseline.caseHash || current.dataHash !== baseline.dataHash || current.scorerHash !== baseline.scorerHash || current.profile !== baseline.profile || current.backend !== baseline.backend)
    throw new Error("Baseline uses different cases, data, or profile; scores cannot be compared");
  if (new Set(current.rows.map(rowKey)).size !== current.rows.length || new Set(baseline.rows.map(rowKey)).size !== baseline.rows.length)
    throw new Error("Duplicate benchmark rows");
  const previous = new Map(baseline.rows.map(row => [rowKey(row), row]));
  const changed = current.rows.map(row => ({ row, before: previous.get(rowKey(row)) }));
  const missing = [...previous.keys()].filter(key => !current.rows.some(row => rowKey(row) === key));
  const extra = changed.filter(({ before }) => !before).map(({ row }) => rowKey(row));
  if (missing.length || extra.length) throw new Error(`Baseline coverage mismatch: missing ${missing.length}, extra ${extra.length}`);
  return {
    gains: changed.filter(({ row, before }) => row.pass === true && before?.pass === false).map(({ row }) => rowKey(row)),
    regressions: changed.filter(({ row, before }) => row.pass === false && before?.pass === true || row.preserve && before?.text !== row.text).map(({ row }) => rowKey(row)),
  };
}

export function reviewPacket(report: QualityReport) {
  return { schema: 1, caseHash: report.caseHash, sourceHash: report.sourceHash, graphHash: report.graphHash,
    dataHash: report.dataHash, scorerHash: report.scorerHash,
    rubric: { accuracy: "현재 근거에 맞는가, 없던 수치·조건·주장을 만들면 실패", directness: "요청한 대상과 조건에 직답하는가",
      context: "정정·관점·생략된 지칭을 보존하는가", requiredFailure: "근거 밖 단정 또는 대상·조건·수치 오류" },
    rows: report.rows.filter(row => row.pass === null || row.pass === false).map(row => ({ key: rowKey(row), question: row.question,
      text: row.text, evidence: row.evidence, failures: row.checks.filter(check => !check.pass).map(check => check.label),
      observed: row.observed,
      verdict: "pending", reason: "" })) };
}

export function verifyReview(report: QualityReport, review: ReturnType<typeof reviewPacket>): string[] {
  if (review.caseHash !== report.caseHash || review.sourceHash !== report.sourceHash || review.graphHash !== report.graphHash
    || review.dataHash !== report.dataHash || review.scorerHash !== report.scorerHash)
    return ["Review does not match the measured artifacts"];
  const expected = reviewPacket(report).rows.map(row => row.key);
  const ids = review.rows.map(row => row.key);
  if (new Set(ids).size !== ids.length) return ["Duplicate review entries"];
  const missing = expected.filter(key => !ids.includes(key));
  const extra = ids.filter(key => !expected.includes(key));
  return [...missing.map(key => `Unreviewed: ${key}`), ...extra.map(key => `Unexpected review: ${key}`),
    ...review.rows.filter(row => row.verdict !== "pass" || !row.reason.trim()).map(row => `Review unresolved: ${row.key}`)];
}

export function saveReport(directory: string, report: QualityReport, comparison?: ReturnType<typeof compareReports>, reviewErrors: string[] = []) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "results.json"), JSON.stringify(report, null, 2) + "\n");
  const groups = new Map<string, QualityRow[]>();
  for (const row of report.rows) for (const suite of row.suite) {
    const key = `${suite} / ${row.mode}`; groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const unsafe = report.rows.filter(row => row.numeric?.accepted && row.checks.some(check => check.label === "accepted-answer-correct" && !check.pass));
  const complete = report.checks.some(check => ["complete-coverage", "complete-task-coverage"].includes(check.name) && check.pass);
  const summary = { complete, measurements: report.rows.length, automatic: report.rows.filter(row => row.pass !== null).length,
    manual: report.rows.filter(row => row.pass === null).length, unsafeNumeric: unsafe.length,
    infrastructurePassed: complete && report.checks.every(check => check.pass), comparison,
    promotion: !report.checks.every(check => check.pass) ? "infrastructure-failed" : !complete ? "incomplete" : !comparison ? "needs-matched-baseline" : comparison.regressions.length ? "regressions" : reviewErrors.length ? "needs-review" : unsafe.length ? "unsafe-numeric" : "eligible",
    reviewErrors };
  fs.writeFileSync(path.join(directory, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  fs.writeFileSync(path.join(directory, "review-packet.json"), JSON.stringify(reviewPacket(report), null, 2) + "\n");
  const lines = ["# Advisor regression and quality measurements", "", `Profile: ${report.profile}. Promotion: **${summary.promotion}**.`, "",
    "Automatic contracts are separate from semantic review. Historical answers are never gold.", "",
    "| Suite / mode | Pass / measured | Manual |", "|---|---:|---:|",
    ...[...groups].map(([key, rows]) => `| ${key} | ${rows.filter(row => row.pass === true).length}/${rows.filter(row => row.pass !== null).length} | ${rows.filter(row => row.pass === null).length} |`),
    "", `Accepted wrong numeric answers: ${unsafe.length}.`, `Infrastructure checks: ${report.checks.filter(check => check.pass).length}/${report.checks.length}.`,
    ...(comparison ? [`Gains: ${comparison.gains.length}. Regressions: ${comparison.regressions.length}.`] : ["A matched baseline is required before deciding a model change."]),
    "", "Detailed rows: results.json. Semantic review: review-packet.json. Failed checks: logs/."];
  fs.writeFileSync(path.join(directory, "README.md"), lines.join("\n") + "\n");
  return summary;
}
