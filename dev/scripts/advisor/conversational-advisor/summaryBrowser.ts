/** 실제 대화 흐름에 생성을 주입하고, 실패 후 본문과 다음 턴의 기억까지 비교한다. */
import { answerDialogue } from "../../../../src/features/advisor/conversation/dialogueFlow";
import { loadAdvisorData } from "../../../../src/features/advisor/conversation/context";
import type { PlanTurn } from "../../../../src/features/advisor/application/plan";
import type { SummaryMode } from "../../../../src/features/advisor/answers/groundedSummary";
import { translations } from "../../../../src/shared/i18n/translations";
import type { createEvaluation } from "./browser";

export async function evaluateSummaries(evaluation: Awaited<ReturnType<typeof createEvaluation>>, mode: SummaryMode, ids: readonly string[]) {
  const results: Array<Record<string, unknown>> = [];
  for (const item of evaluation.questions.filter(c => ids.includes(c.id))) {
    const lang = item.lang ?? "ko_KR";
    const data = await loadAdvisorData("26.19", lang);
    const turns: PlanTurn[] = [];
    for (const [turn, entry] of item.turns.entries()) {
      const ctx = { data, lang, copy: translations[lang].advisor, turns, championIds: [], consented: true, canUseModel: true, retrieval: true, judge: "model" as const };
      const callStart = evaluation.runtime.calls.length;
      const result = await answerDialogue(entry.q, ctx, evaluation.runtime, {
        mode, generate: request => evaluation.runtime.generate(request.system, request.prompt, request.maxTokens, request.purpose),
      });
      const original = evaluation.results.find(r => r.id === item.id && r.turn === turn && r.variant === "combined");
      const sameText = original?.text === result.reply.text;
      const sameMemory = JSON.stringify(original?.memory) === JSON.stringify(result.reply.memory);
      const visible = result.reply.summary ? `${result.reply.summary}\n\n${result.reply.text}` : result.reply.text;
      turns.push({ role: "user", content: entry.q }, { role: "assistant", content: visible, answer: result.reply.answer, memory: result.reply.memory });
      results.push({ id: item.id, turn, mode, holdout: Boolean(item.holdout), question: entry.q, summary: result.reply.summary, attempt: "attempt" in result ? result.attempt : undefined, sameText, sameMemory, calls: evaluation.runtime.calls.slice(callStart) });
    }
  }
  return results;
}
