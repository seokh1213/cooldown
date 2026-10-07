import type { QualityReport } from "./types";

/** A patch update may change data, but never the model, scorer, cases, or measured code. */
export function comparePatchReports(current: QualityReport, baseline: QualityReport) {
  for (const key of ["profile", "caseHash", "scorerHash", "sourceHash", "graphHash", "numericPurpose", "backend", "model"] as const)
    if (current[key] !== baseline[key]) throw new Error(`Patch comparison input mismatch: ${key}`);
  const key = (row: QualityReport["rows"][number]) => `${row.mode}:${row.id}`;
  const previous = new Map(baseline.rows.map(row => [key(row), row]));
  if (previous.size !== baseline.rows.length || new Set(current.rows.map(key)).size !== current.rows.length
    || previous.size !== current.rows.length || current.rows.some(row => !previous.has(key(row)))) throw new Error("Patch comparison coverage mismatch");
  const regressions: string[] = [], gains: string[] = [], changedAnswers: string[] = [];
  for (const row of current.rows) {
    const before = previous.get(key(row))!;
    if (row.text !== before.text) changedAnswers.push(key(row));
    if (row.pass === true && before.pass === false) gains.push(key(row));
    const lostCheck = before.checks.some((check, index) => check.pass
      && (row.checks[index]?.label !== check.label || !row.checks[index]?.pass));
    if (before.pass === true && row.pass !== true || lostCheck) regressions.push(key(row));
  }
  return { gains, regressions, changedAnswers, beforeDataHash: baseline.dataHash, afterDataHash: current.dataHash,
    scope: "Patch contract regression. Changed answer semantics still require review; this is not a same-data model comparison." };
}
