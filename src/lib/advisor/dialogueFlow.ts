/**
 * 앱의 대화 진입점: 맥락 복원 → 질문 계획 → 근거 답변 조립.
 * 결과의 reply와 memory는 화면 어댑터가 함께 기록한다(네 번째 단계).
 * 판정·검색은 PlanDeps로 주입하고, 화면·React·저장 구현은 이 흐름 밖에 둔다.
 */
import type { PlanContext, PlanDeps } from "./planTypes";
import { prepareDialogueRequest } from "./dialogueRequest";
import { planPreparedDialogue } from "./dialoguePlanner";
import { assembleDialogueReply } from "./dialogueReply";

export async function answerDialogue(question: string, ctx: PlanContext, deps: PlanDeps) {
  const request = prepareDialogueRequest(question, ctx, "combined");
  const dialogue = await planPreparedDialogue(request, ctx, deps);
  const reply = await assembleDialogueReply(dialogue, ctx.data, ctx.lang);
  return { dialogue, reply };
}
