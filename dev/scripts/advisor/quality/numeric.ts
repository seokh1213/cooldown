import { numericContext } from "../../../../src/features/advisor/answers/numericEvidence";
import type { Check, QualityStory } from "./types";

export const NUMERIC_SYSTEM = "Use only the document. Copy the requested number and unit exactly, with no explanation. If absent, output NOT_FOUND.";
export interface NumericGold { answer: string; context: string; answerable: boolean; conflictingSource: boolean; cohort: string; docId: string }
export const numericGold = (story: QualityStory): NumericGold => story.turns[0].expected.numericGold as NumericGold;
export function numericRequest(question: string, document: string) {
  const evidence = numericContext(document, question);
  return { system: NUMERIC_SYSTEM, prompt: `Document:\n${evidence}\n\nQuestion: ${question}`, maxTokens: 24, evidence };
}
export const numericChecks = (text: string, gold: NumericGold): Check[] => [{ label: "exact-number-and-unit", pass: text.trim() === gold.answer }];
