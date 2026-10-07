/**
 * 앱의 대화 진입점: 맥락 복원 → 질문 계획 → 근거 답변 조립.
 * 결과의 reply와 memory는 화면 어댑터가 함께 기록한다(네 번째 단계).
 * 판정·검색은 PlanDeps로 주입하고, 화면·React·저장 구현은 이 흐름 밖에 둔다.
 */
import type { PlanContext, PlanDeps } from "./planTypes";
import { prepareDialogueRequest } from "./dialogueRequest";
import { planPreparedDialogue } from "./dialoguePlanner";
import { summarizeGroundedReply, type SummaryExperiment } from "./groundedSummary";
import { assembleDialogueReply } from "./dialogueReply";
import { answerGroundedNumeric } from "./groundedNumeric";
import { withContextFrames } from "./contextDialogue";
import type { DialoguePlan } from "./dialoguePlanner";
import type { DialogueReply } from "./dialogueReply";
import { DEFAULT_CONTEXT_LIMIT, DEFAULT_CONTEXT_POLICY, type ContextDecision } from "./contextFrameTypes";

export interface DialogueOutput {
  dialogue: DialoguePlan;
  reply: DialogueReply;
  numericAttempt?: { accepted: boolean; reason: string; raw?: string };
  contextDecision?: ContextDecision;
}

export async function answerDialogue(question: string, ctx: PlanContext, deps: PlanDeps, summary?: SummaryExperiment): Promise<DialogueOutput> {
  const context = { ...ctx, contextPolicy: ctx.contextPolicy ?? DEFAULT_CONTEXT_POLICY, contextLimit: ctx.contextLimit ?? DEFAULT_CONTEXT_LIMIT };
  if (context.contextPolicy !== "legacy") return withContextFrames(question, context,
    (scoped, input) => answerCurrentDialogue(input, scoped, deps, summary), deps.rankContexts);
  return answerCurrentDialogue(question, context, deps, summary);
}

async function answerCurrentDialogue(question: string, ctx: PlanContext, deps: PlanDeps, summary?: SummaryExperiment): Promise<DialogueOutput> {
  const request = prepareDialogueRequest(question, ctx, "combined");
  const dialogue = await planPreparedDialogue(request, ctx, deps);
  const reply = await assembleDialogueReply(dialogue, ctx.data, ctx.lang);
  if (summary && ctx.consented && ctx.canUseModel && ctx.lang === "ko_KR") {
    const result = await summarizeGroundedReply(dialogue, reply, summary);
    return { dialogue, ...result };
  }
  if (deps.generateNumeric && ctx.data && ctx.consented && ctx.canUseModel && ctx.lang === "ko_KR") {
    return { dialogue, ...await answerGroundedNumeric(dialogue, reply, ctx.data, deps.generateNumeric) };
  }
  return { dialogue, reply };
}
