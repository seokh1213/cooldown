/** 이번 요청의 사실 조회·상성·확인 질문을 계획하고 코드 기억을 갱신한다. 자료를 읽거나 화면에 쓰지 않는다. */
import { resolveQuestion } from "./resolvedQuestion";
import { planAnswer } from "./plan";
import type { AnswerPlan, PlanContext, PlanDeps } from "./planTypes";
import { resolveDialogueFact } from "./dialogueFacts";
import { ruleEllipsis } from "./dialogueRules";
import { matchupPlan } from "./dialogueMatchup";
import { dialogueStatPlan, statPlanForQuery } from "./dialogueStats";
import { conditionHint, prepareDialogueRequest, type DialogueRequest, type DialogueVariant } from "./dialogueRequest";
import { rememberDialoguePlan, scenarioConditions, type DialogueMemory } from "./dialogueState";

export type { DialogueVariant } from "./dialogueRequest";
export { splitDialogueQuestions } from "./dialogueRequest";
export interface DialoguePlan {
  parts: Array<{ question: string; plan: AnswerPlan }>;
  memory: DialogueMemory;
  clarification?: string;
}

function clarificationText(pending: NonNullable<DialogueMemory["pending"]>, ctx: PlanContext): string {
  const names = pending.candidates.map(id => ctx.data!.cardById.get(id)?.name).filter(Boolean).join(" / ");
  if (ctx.lang === "en_US") return names ? `Whose ${pending.slot} do you mean: ${names}?` : "Which champion and ability do you mean?";
  if (ctx.lang === "zh_CN") return names ? `你指的是谁的 ${pending.slot}：${names}？` : "你指的是哪个英雄的哪个技能？";
  return names ? `${pending.slot}는 누구의 스킬인가요? ${names} 중에서 알려주세요.` : "어느 챔피언의 어떤 스킬을 말하나요?";
}

/** 계획만 필요한 평가·테스트의 진입점. 앱은 dialogueFlow의 전체 흐름을 사용한다. */
export async function planDialogue(question: string, ctx: PlanContext, deps: PlanDeps, variant: DialogueVariant = "memory"): Promise<DialoguePlan> {
  return planPreparedDialogue(prepareDialogueRequest(question, ctx, variant), ctx, deps);
}

export async function planPreparedDialogue(request: DialogueRequest, ctx: PlanContext, deps: PlanDeps): Promise<DialoguePlan> {
  let memory = request.memory;
  const parts: DialoguePlan["parts"] = [];
  if (!ctx.data) return { parts: [{ question: request.questions[0], plan: await planAnswer(request.questions[0], ctx, deps) }], memory };
  for (const question of request.questions) {
    const resolved = resolveQuestion(question, ctx.data);
    let stat = dialogueStatPlan(resolved, memory, ctx);
    if (!stat && deps.inferStatQuery) {
      const query = await deps.inferStatQuery(resolved, memory, ctx).catch(() => undefined);
      if (query) stat = statPlanForQuery(query, resolved, ctx);
    }
    const fact = stat ? undefined : resolveDialogueFact(resolved, memory, ctx);
    const asksCompare = /비교|둘\s*중|둘|both|compare|比较|两个/i.test(question);
    const shouldAsk = fact?.pending && (!fact.pending.candidates.length || fact.pending.candidates.length > 1 && !asksCompare);
    if (shouldAsk && (request.variant === "clarify" || request.variant === "combined")) {
      memory.pending = fact.pending;
      return { parts, memory, clarification: clarificationText(fact.pending!, ctx) };
    }
    let plan = stat ?? fact?.plan ?? ruleEllipsis(question, memory, ctx) ?? await matchupPlan(resolved, memory, ctx, deps);
    plan ??= await planAnswer(resolved, ctx, deps);
    if (plan.type === "retry") plan = await planAnswer(plan.question, ctx, deps);
    memory = rememberDialoguePlan(memory, plan, fact);
    if (memory.active === "matchup") memory.conditions = scenarioConditions(question, memory.conditions, ctx.turns.length, conditionHint(resolved, memory, ctx));
    parts.push({ question, plan });
  }
  return { parts, memory };
}
