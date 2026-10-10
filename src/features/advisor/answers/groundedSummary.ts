/** 근거를 먼저 확정한 뒤 생성 후보를 검사한다. 검사 전 토큰은 화면에 전달하지 않는다. */
import type { DialoguePlan } from "../conversation/dialoguePlanner";
import type { DialogueReply } from "../conversation/dialogueReply";
import { checkMatchupFacts, evidenceSentences } from "./matchupFactCheck";

export type SummaryMode = "paraphrase" | "extractive";
export interface SummaryGenerator {
  (request: { system: string; prompt: string; maxTokens: number; purpose: "grounded-summary" }): Promise<{ text: string; seconds: number; looped?: boolean }>;
}
export interface SummaryExperiment { mode: SummaryMode; generate: SummaryGenerator }
export interface SummaryAttempt { accepted: boolean; reason: string; raw?: string; seconds?: number }

/** 숫자·명명·부정·조건을 문자로 보존한다. 공백과 문장 마침표 외의 의역을 의미 검증으로 간주하지 않는다. */
const canonical = (text: string) => text.replace(/\s+/g, "").replace(/[。]/g, ".");

export function acceptedSummary(candidate: string, evidence: readonly string[]): string | undefined {
  const sentences = evidenceSentences(candidate);
  if (!sentences.length || sentences.length > 2 || sentences.some(s => !/[.!?。！？]$/.test(s))) return undefined;
  const originals = sentences.map(sentence => evidence.find(source => canonical(source) === canonical(sentence)));
  if (originals.some(source => !source) || new Set(originals).size !== originals.length) return undefined;
  // 첫 근거 문장은 주제·행동의 기준이다. 이를 빠뜨린 채 뒤의 결과만 쓰는 후보는 버린다.
  if (originals[0] !== evidence[0]) return undefined;
  return originals.join(" ");
}

export async function summarizeGroundedReply(dialogue: DialoguePlan, reply: DialogueReply, experiment: SummaryExperiment): Promise<{ reply: DialogueReply; attempt: SummaryAttempt }> {
  const plan = dialogue.parts.length === 1 ? dialogue.parts[0].plan : undefined;
  if (dialogue.clarification || plan?.type !== "matchup" || reply.respond || !reply.text || reply.memory.conditions.length) return { reply, attempt: { accepted: false, reason: "ineligible" } };
  const prose = reply.text.replace(/\*\*[^*]+\*\*\n/g, "");
  const evidence = evidenceSentences(prose);
  // 여러 주제나 긴 근거를 중간에서 자르지 않는다.
  if (evidence.length < 2 || evidence.length > 3 || prose.length > 1200 || checkMatchupFacts(prose, [plan.mine, plan.enemy]).length) return { reply, attempt: { accepted: false, reason: "evidence-scope" } };
  const system = experiment.mode === "extractive"
    ? "You are a text editor. Select the first Korean evidence sentence and optionally the second. Output them verbatim, at most two complete sentences. No headings, translation or added words."
    : "You are a Korean editor. Summarize the evidence in one or two short Korean sentences answering the question. Preserve the subject, numbers, conditions, negation and advice. Add no facts.";
  try {
    const generated = await experiment.generate({ system, prompt: `Question: ${dialogue.parts[0].question}\nEvidence:\n${evidence.join("\n")}`, maxTokens: 160, purpose: "grounded-summary" });
    const text = generated.looped ? undefined : acceptedSummary(generated.text, evidence);
    const attempt = { accepted: Boolean(text), reason: text ? "supported" : "unverified", raw: generated.text, seconds: generated.seconds };
    if (!text) return { reply, attempt };
    // 전체 답을 유지하고 짧은 요약을 덧붙인다. 카드와 표시된 주제·조건 기억은 보존한다.
    return { reply: { ...reply, summary: text }, attempt };
  } catch {
    return { reply, attempt: { accepted: false, reason: "generation-error" } };
  }
}
