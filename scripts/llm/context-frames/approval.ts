import assert from "node:assert/strict";
import type { QualityReport } from "../quality/types";

export const CONTEXT_APPROVAL_FILE = "research/llm-evals/workflow/reports/context-frames-20261007/approved.json";
export const EXPANDED_CONTEXT_APPROVAL_FILE = "research/llm-evals/workflow/reports/context-followup-20261007/approved.json";
export const STRESS_APPROVAL_FILE = "research/llm-evals/workflow/reports/context-followup-20261007/stress-approved.json";
export interface ContextApproval { caseHash: string; scorerHash: string; passedIds: string[]; clarificationIds?: string[] }

export function checkApprovedContexts(report: Pick<QualityReport, "caseHash" | "scorerHash"> & {
  rows: Array<{ id: string; pass: boolean | null; decision?: unknown; observed?: unknown }>;
}, approval: ContextApproval): void {
  assert.equal(report.caseHash, approval.caseHash, "Approved context cases changed; review the contracts");
  assert.equal(report.scorerHash, approval.scorerHash, "Approved context scorer changed; review the scorer");
  const rows = new Map(report.rows.map(row => [row.id, row]));
  const lost = approval.passedIds.filter(id => rows.get(id)?.pass !== true);
  assert.deepEqual(lost, [], "Candidate lost an adopted context success");
  const unsafe = approval.clarificationIds?.filter(id => {
    const row = rows.get(id);
    return (row?.decision as { action?: string } | undefined)?.action !== "clarify" || Boolean(row?.observed);
  }) ?? [];
  assert.deepEqual(unsafe, [], "Candidate answered a forgotten context instead of clarifying");
}
