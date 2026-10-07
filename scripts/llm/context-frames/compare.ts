import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { parseArgs } from "node:util";
import type { QualityReport } from "../quality/types";

const { values } = parseArgs({ options: { directory: { type: "string" }, require: { type: "string" } } });
if (!values.directory) throw new Error("--directory is required");
const directory = path.resolve(values.directory);
const baseline = JSON.parse(fs.readFileSync(path.join(directory, "legacy.json"), "utf8")) as QualityReport;
const original = new Map(baseline.rows.map(row => [row.id, row]));
const summary = [];
const variants = fs.readdirSync(directory).filter(file => /^(?:legacy|(?:lifo|typed|guarded|learned)-\d+)\.json$/.test(file)).sort();
for (const file of variants) {
  const policy = file.replace(/\.json$/, "");
  const report = JSON.parse(fs.readFileSync(path.join(directory, file), "utf8")) as QualityReport;
  for (const key of ["caseHash", "sourceHash", "scorerHash", "dataHash", "graphHash"] as const) assert.equal(report[key], baseline[key], `${policy}: ${key}`);
  assert.deepEqual(report.rows.map(row => row.id).sort(), baseline.rows.map(row => row.id).sort());
  assert.ok(report.checks.every(check => check.pass), `${policy}: incomplete or changed inputs`);
  const gains = report.rows.filter(row => row.pass === true && original.get(row.id)?.pass === false).map(row => row.id);
  const regressions = report.rows.filter(row => row.pass === false && original.get(row.id)?.pass === true).map(row => row.id);
  const protectedChanges = report.rows.filter(row => row.preserve && row.text !== original.get(row.id)?.text).map(row => row.id);
  const record = { policy, total: report.rows.length, passed: report.rows.filter(row => row.pass === true).length,
    failed: report.rows.filter(row => row.pass === false).length, manual: report.rows.filter(row => row.pass === null).length,
    gains, regressions, protectedChanges };
  summary.push(record);
  console.log(JSON.stringify({ ...record, gains: gains.length, regressions: regressions.length, protectedChanges: protectedChanges.length }));
}
fs.writeFileSync(path.join(directory, "comparison.json"), JSON.stringify({ baseline: "legacy", caseHash: baseline.caseHash,
  scorerHash: baseline.scorerHash, sourceHash: baseline.sourceHash, dataHash: baseline.dataHash, graphHash: baseline.graphHash, policies: summary }, null, 2) + "\n");
if (values.require) {
  const chosen = summary.find(entry => entry.policy === values.require);
  assert.ok(chosen, "Required candidate was not evaluated");
  assert.equal(chosen.regressions.length, 0, "Candidate introduces quality regressions");
  assert.equal(chosen.protectedChanges.length, 0, "Candidate changes protected replies");
}
