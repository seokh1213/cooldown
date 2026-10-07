import { selectContextFrame } from "../../../src/lib/advisor/contextFrameSelection";
import { dialogueMemoryOf } from "../../../src/lib/advisor/dialogueState";
import type { PlanDeps } from "../../../src/lib/advisor/planTypes";

/** Experimental residual: keep the existing explicit/ambiguous/evicted contracts. */
export function guardedResidual(ranker: NonNullable<PlanDeps["rankContexts"]>): NonNullable<PlanDeps["rankContexts"]> {
  return (question, frames, ctx) => {
    const memory = dialogueMemoryOf(ctx.turns, ctx.data!);
    const guarded = selectContextFrame(question, frames, { ...ctx, contextPolicy: "guarded" },
      { pending: memory.contextPending, omitted: memory.contextOmissions });
    const learned = ranker(question, frames, ctx);
    const fallback = { ...guarded, policy: "learned" as const, scores: learned.scores };
    if (guarded.action === "clarify" || question.champions.length || question.matchup || learned.action === "keep") return fallback;
    if (guarded.action === "resume" && learned.selected !== guarded.selected) return fallback;
    return learned;
  };
}
