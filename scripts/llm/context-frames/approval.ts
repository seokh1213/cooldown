import assert from "node:assert/strict";
import type { QualityReport } from "../quality/types";

export const CONTEXT_APPROVAL_FILE = "research/llm-evals/workflow/reports/context-frames-20261007/approved.json";
export interface ContextApproval { caseHash: string; scorerHash: string; passedIds: string[] }

export function checkApprovedContexts(report: Pick<QualityReport, "caseHash" | "scorerHash"> & {
  rows: Array<{ id: string; pass: boolean | null }>;
}, approval: ContextApproval): void {
  assert.equal(report.caseHash, approval.caseHash, "Approved context cases changed; review the contracts");
  assert.equal(report.scorerHash, approval.scorerHash, "Approved context scorer changed; review the scorer");
  const rows = new Map(report.rows.map(row => [row.id, row]));
  const lost = approval.passedIds.filter(id => rows.get(id)?.pass !== true);
  assert.deepEqual(lost, [], "Candidate lost an adopted context success");
}
