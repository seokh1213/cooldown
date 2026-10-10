import type { DialoguePlan } from "../../conversation/planning/dialoguePlanner";
import type { DialogueReply } from "../../conversation/planning/dialogueReply";
import type { AdvisorData } from "../../retrieval/context";
import { buildRetrievalDocs } from "../../application/searchFallback";
import { answerEvidence } from "./answerEvidence";
import { numericContext, numericField, verifiedNumeric } from "./numericEvidence";

export interface NumericRequest { system: string; prompt: string; maxTokens: number; purpose: "grounded-numeric" }
export type NumericGenerator = (request: NumericRequest) => Promise<string>;
export interface NumericAttempt { accepted: boolean; reason: string; raw?: string }

export async function answerGroundedNumeric(dialogue: DialoguePlan, reply: DialogueReply, data: AdvisorData, generate: NumericGenerator) {
  const part = dialogue.parts.length === 1 ? dialogue.parts[0] : undefined;
  if (!part || dialogue.clarification || reply.respond || reply.related?.length || data.stale
    || dialogue.memory.conditions.length || !/몇|얼마|비율|퍼센트/.test(part.question)) {
    return { reply, numericAttempt: { accepted: false, reason: "ineligible" } as NumericAttempt };
  }
  const docs = buildRetrievalDocs(data, "ko_KR");
  const selected = answerEvidence(part.plan, docs).documentId;
  const document = docs.find(doc => doc.id === selected);
  if (!document) return { reply, numericAttempt: { accepted: false, reason: "no-document" } as NumericAttempt };
  if (!numericField(part.question, document)) return { reply, numericAttempt: { accepted: false, reason: "ambiguous-field" } as NumericAttempt };
  const context = numericContext(`${document.title}\n${document.text}`, part.question);
  try {
    const raw = await generate({ system: "Use only the document. Copy the requested number and unit exactly, with no explanation. If absent, output NOT_FOUND.",
      prompt: `Document:\n${context}\n\nQuestion: ${part.question}`, maxTokens: 24, purpose: "grounded-numeric" });
    const verified = verifiedNumeric(raw, part.question, document);
    const accepted = Boolean(verified && context.includes(verified.evidence));
    const numericAttempt: NumericAttempt = { accepted, reason: accepted ? "supported-field" : "unverified", raw };
    if (!accepted || !verified) return { reply, numericAttempt };
    const text = `**${verified.value}**\n${verified.evidence}\n\n${reply.text}`;
    const memory = { ...reply.memory, lastReply: { ...reply.memory.lastReply!, text } };
    return { reply: { ...reply, text, memory, answers: reply.answers ?? (reply.answer ? [reply.answer] : undefined) }, numericAttempt };
  } catch {
    return { reply, numericAttempt: { accepted: false, reason: "generation-error" } as NumericAttempt };
  }
}
