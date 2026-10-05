/** 연구도 앱의 대화 경로에 승인 색인을 전달한다. 응답 판단을 따로 구현하지 않는다. */
import { answerDialogue } from "../../../src/lib/advisor/dialogueFlow";
import type { PlanContext, PlanDeps } from "../../../src/lib/advisor/planTypes";
import type { Slot } from "./contract";
import type { ReviewedAbility, Topic } from "./retrieval";

export interface RetrievalMemory { champion: string; slot: Slot; topic?: Topic }
export async function answerReviewed(question: string, options: { ctx: PlanContext; deps: PlanDeps; index: Map<string, ReviewedAbility>; memory?: RetrievalMemory }) {
  const ctx = { ...options.ctx, data: options.ctx.data ? { ...options.ctx.data, abilityRules: options.index } : null };
  const result = await answerDialogue(question, ctx, options.deps);
  const memory = result.reply.memory.mechanic;
  const ability = memory && options.index.get(memory.abilityId);
  return { ...result, source: ability ? "reviewed" as const : "baseline" as const,
    retrievalMemory: ability ? { champion: ability.job.champion, slot: ability.job.slot, topic: memory?.topic } : undefined,
    abilityId: ability?.job.id, evidence: memory?.ruleIndices.flatMap(i => ability?.draft.rules[i]?.evidence ?? []) };
}
