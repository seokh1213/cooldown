import type { QualityReport, QualityRow, QualityStory } from "../quality/types";
import { digest } from "../quality/bank";

export interface ReviewCase {
  id: string;
  kind: "scope" | "matchup";
  question: string;
  expected: Record<string, unknown>;
  sources: QualityStory["sources"];
  measurements: Array<Pick<QualityRow, "id" | "mode" | "text">>;
  current: Array<{ mode: string; text: string; evidence: string; plans: unknown }>;
  inputHash: string;
}
export function pendingCases(report: QualityReport, bank: QualityStory[]): ReviewCase[] {
  const groups = new Map<string, QualityRow[]>();
  for (const row of report.rows) {
    if (!(row.mode === "fast-scope" && row.pass === false || row.suite.includes("retired-matchup-4") && row.pass === null)) continue;
    groups.set(row.id, [...groups.get(row.id) ?? [], row]);
  }
  return [...groups].map(([id, rows]) => {
    const [storyId, index] = id.split(":"), story = bank.find(entry => entry.id === storyId);
    if (!story || story.turns[Number(index)]?.q !== rows[0].question) throw new Error(`Review source mismatch: ${id}`);
    const content = { id, kind: rows[0].mode === "fast-scope" ? "scope" as const : "matchup" as const,
      question: rows[0].question, expected: story.turns[Number(index)].expected, sources: story.sources,
      measurements: rows.map(({ id, mode, text }) => ({ id, mode, text })), current: [] };
    return { ...content, inputHash: digest(content) };
  });
}
export function safeEmbeddedJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}
