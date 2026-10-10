import fs from "node:fs";
import assert from "node:assert/strict";
import { parseArgs } from "node:util";
import { checkApprovedContexts, type ContextApproval } from "./approval";
import type { QualityReport } from "../quality/types";

const { values } = parseArgs({ options: { report: { type: "string" }, approved: { type: "string" } } });
if (!values.report || !values.approved) throw new Error("--report and --approved are required");
const report = JSON.parse(fs.readFileSync(values.report, "utf8")) as QualityReport;
const approval = JSON.parse(fs.readFileSync(values.approved, "utf8")) as ContextApproval;
assert.ok(report.checks.some(check => check.name === "complete-coverage" && check.pass), "Context evaluation is incomplete");
assert.ok(report.checks.every(check => check.pass), "Context inputs or worker changed");
checkApprovedContexts(report, approval);
console.log(JSON.stringify({ protectedSuccesses: approval.passedIds.length, requiredClarifications: approval.clarificationIds?.length ?? 0,
  numericAnswers: approval.textRequirements?.length ?? 0 }));
