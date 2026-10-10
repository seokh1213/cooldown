import assert from "node:assert/strict";
import fs from "node:fs";
import { buildBank, digest } from "../../../../../scripts/llm/quality/bank";
import { compareReports } from "../../../../../scripts/llm/quality/report";
import type { QualityReport, QualityRow } from "../../../../../scripts/llm/quality/types";

const [baselinePath, currentPath] = process.argv.slice(2);
assert.ok(baselinePath && currentPath, "Provide baseline and current results.json");
const read = (file: string): QualityReport => JSON.parse(fs.readFileSync(file, "utf8"));
const baseline = read(baselinePath), current = read(currentPath);
const bank = buildBank();
const addedStories = bank.filter(story => story.sources.some(source => source.file.endsWith("/live-web-questions.json")));
const sharedBank = bank.filter(story => !addedStories.includes(story));
assert.equal(addedStories.length, 7);
assert.equal(digest(bank), current.caseHash, "Current contracts changed after measurement");
assert.equal(digest(sharedBank), baseline.caseHash, "Historical contracts changed");
for (const report of [baseline, current]) {
  assert.ok(report.checks.every(check => check.pass), "Infrastructure failed");
  assert.ok(report.checks.some(check => check.name === "complete-coverage" && check.pass));
  assert.equal(new Set(report.rows.map(row => `${row.mode}:${row.id}`)).size, report.rows.length);
}
const prior = new Map(baseline.rows.map(row => [`${row.mode}:${row.id}`, row]));
const sharedRows = current.rows.filter(row => prior.has(`${row.mode}:${row.id}`));
const addedRows = current.rows.filter(row => !prior.has(`${row.mode}:${row.id}`));
assert.equal(sharedRows.length, baseline.rows.length, "Historical measurements missing");
assert.equal(addedRows.length, 34);
const addedIds = new Set(addedStories.map(story => story.id));
for (const row of addedRows) assert.ok(addedIds.has(row.id.slice(0, row.id.lastIndexOf(":"))));
for (const row of sharedRows) assert.equal(row.question, prior.get(`${row.mode}:${row.id}`)!.question);

// The subset hash is computed from unchanged contracts, not copied from the baseline.
const comparison = compareReports({ ...current, caseHash: digest(sharedBank), rows: sharedRows }, baseline);
const counts = (rows: QualityRow[]) => ({ measured: rows.length, pass: rows.filter(row => row.pass === true).length,
  fail: rows.filter(row => row.pass === false).length, manual: rows.filter(row => row.pass === null).length });
console.log(JSON.stringify({ scope: "unchanged historical bank; additional contracts reported separately",
  baselinePath, currentPath, baselineCaseHash: baseline.caseHash, currentCaseHash: current.caseHash,
  verifiedSharedBankHash: digest(sharedBank), dataHash: current.dataHash, scorerHash: current.scorerHash,
  baseline: counts(baseline.rows), currentShared: counts(sharedRows), added: counts(addedRows),
  currentTotal: counts(current.rows), ...comparison,
  changedAnswers: sharedRows.filter(row => row.text !== prior.get(`${row.mode}:${row.id}`)!.text).length,
  addedRows }, null, 2));
