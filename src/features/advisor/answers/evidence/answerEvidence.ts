import type { AnswerPlan } from "../../contracts/planTypes";
import type { RetrievalDoc } from "../../application/searchFallback";
import { dialogueAnswerText } from "../../conversation/planning/dialogueReply";
import type { Language } from "@/shared/i18n";

export function answerEvidence(plan: AnswerPlan, documents: readonly RetrievalDoc[], lang: Language = "ko_KR") {
  if (plan.type !== "card" && plan.type !== "code") return { text: "", documentId: undefined };
  const text = typeof plan.answer === "string" ? plan.answer : dialogueAnswerText(plan.answer, lang);
  if (typeof plan.answer !== "string" && plan.answer.kind === "rule") return { text, documentId: `rule:${plan.answer.rule.name}` };
  if (plan.type === "code" && plan.knowledge) return { text, documentId: plan.knowledge.id };
  if (plan.type === "code" && plan.related?.length) return { text, documentId: undefined };
  const matches = documents.filter(doc => text === doc.text || text.includes(`**${doc.title}**\n`));
  return { text, documentId: matches.length === 1 ? matches[0].id : undefined };
}
