/** 이번 요청의 사실 조회·상성·확인 질문을 계획하고 코드 기억을 갱신한다. 자료를 읽거나 화면에 쓰지 않는다. */
import { resolveQuestion } from "../understanding/resolvedQuestion";
import { planAnswer } from "../application/plan";
import type { AnswerPlan, PlanContext, PlanDeps } from "../contracts/planTypes";
import { resolveDialogueFact } from "./dialogueFacts";
import { ruleEllipsis } from "./dialogueRules";
import { matchupPlan } from "./dialogueMatchup";
import { statPlanForQuery } from "./dialogueStats";
import { describeRequest, planMismatch, unsupportedCondition, type RequestContract, type DialogueTrace } from "../contracts/requestContract";
import { requestGuidance } from "../understanding/requestGuidance";
import { conditionHint, prepareDialogueRequest, type DialogueRequest, type DialogueVariant } from "./dialogueRequest";
import { rememberDialoguePlan, scenarioConditions, type DialogueMemory, type MatchupContext } from "./dialogueState";
import { priorMatchup, rememberMatchupSelection } from "./dialogueMatchupMemory";
import { classifyRequestInput } from "../understanding/classifyRequestInput";
import { answerChampionIds } from "../answers/answer";
import { statQueryFromAnswer } from "../understanding/statQuery";
import { mechanicsContinuation } from "../application/mechanicsContinuation";

import { selectDialogueEvidence } from "./dialogueSelection";

export type { DialogueVariant } from "./dialogueRequest";
export { splitDialogueQuestions } from "./dialogueRequest";
export interface DialoguePlan {
  parts: Array<{ question: string; plan: AnswerPlan; matchup?: MatchupContext; request?: RequestContract }>;
  memory: DialogueMemory;
  clarification?: string;
  trace?: DialogueTrace;
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
  const trace: DialogueTrace = { judge: ctx.judge, parts: [], rejected: request.rejected };
  if (request.rejected) { memory.mechanic = undefined; const input = request.questions[0]; return { parts, memory, clarification: requestGuidance(request.rejected, ctx.lang, typeof input === "string" ? input : input.text), trace }; }
  if (!ctx.data) {
    const input = request.questions[0];
    return { parts: [{ question: typeof input === "string" ? input : input.text, plan: await planAnswer(input, ctx, deps) }], memory };
  }
  for (const input of request.questions) {
    const resolved = mechanicsContinuation(await classifyRequestInput(resolveQuestion(input, ctx.data), deps), memory, ctx);
    const question = resolved.text;
    const prior = priorMatchup(resolved, request.memory);
    if (prior) {
      const { conditions, ...matchup } = prior;
      memory = { ...memory, active: "matchup", matchup: structuredClone(matchup), conditions: structuredClone(conditions) };
    }
    let contract = describeRequest(resolved, memory, ctx);
    const unsupported = unsupportedCondition(question);
    if (unsupported) {
      memory.mechanic = undefined;
      trace.parts.push({ question, request: contract, plan: "code", rejected: unsupported });
      parts.push({ question, request: contract, plan: { type: "code", answer: { kind: "text", text: requestGuidance(unsupported, ctx.lang) } } });
      continue;
    }
    const { preferred, numeric, learned, passive, mechanic, combo } = await selectDialogueEvidence(resolved, memory, ctx, deps);
    if (learned?.type === "card") contract = { operation: resolved.requestIntent?.scope === "statsAll" ? "lookup" : "explain",
      targets: answerChampionIds(learned.answer), stat: statQueryFromAnswer(learned.answer) };
    let stat = preferred ? undefined : numeric;
    if (passive?.type === "card" && passive.answer.kind === "spell" && preferred === passive) {
      contract = { operation: "explain", targets: [passive.answer.championId] };
    }
    if (mechanic && preferred === mechanic.plan) contract = { operation: "explain", targets: [mechanic.memory.abilityId.split(".")[0]] };
    if (combo?.type === "card" && combo.answer.kind === "champion") contract = { operation: "advice", targets: [combo.answer.card.id] };
    if (!preferred && !stat && deps.inferStatQuery) {
      const query = await deps.inferStatQuery(resolved, memory, ctx).catch(() => undefined);
      if (query) {
        stat = statPlanForQuery(query, resolved, ctx);
        if (stat) contract = { ...contract, operation: "lookup", stat: query, targets: query.champions };
      }
    }
    const fact = stat || preferred ? undefined : resolveDialogueFact(resolved, memory, ctx);
    const asksCompare = /비교|둘\s*중|둘|각자|각각|both|each|compare|比较|两个|两人|分别/i.test(question);
    const shouldAsk = fact?.pending && (!fact.pending.candidates.length || fact.pending.candidates.length > 1 && !asksCompare);
    if (shouldAsk && (request.variant === "clarify" || request.variant === "combined")) {
      memory.pending = fact.pending;
      const clarification = clarificationText(fact.pending!, ctx);
      if (request.questions.length === 1) return { parts, memory, clarification, trace };
      trace.parts.push({ question, request: contract, plan: "code" });
      parts.push({ question, request: contract, plan: { type: "code", answer: { kind: "text", text: clarification } } });
      continue;
    }
    let plan = preferred ?? stat ?? fact?.plan ?? ruleEllipsis(resolved, memory, ctx) ?? await matchupPlan(resolved, memory, ctx, deps);
    plan ??= await planAnswer(resolved, ctx, deps);
    if (plan.type === "retry") plan = await planAnswer(plan.question, ctx, deps);
    const noEvidence = plan.type === "respond" || plan.type === "code" && typeof plan.answer === "string"
      && [ctx.copy.noLiteAnswer, ctx.copy.noGameData, ctx.copy.noModel].includes(plan.answer);
    const rejected = planMismatch(contract, plan) ?? (noEvidence ? "unsupported" : undefined);
    trace.parts.push({ question, request: contract, plan: plan.type, rejected });
    if (rejected) memory.mechanic = undefined;
    if (rejected) plan = { type: "code", answer: { kind: "text", text: requestGuidance(rejected, ctx.lang) } };
    if (!rejected) {
      if (plan.type === "matchup") {
        const selected = plan;
        const prior = request.memory.matchups?.find(pair => pair.mine === selected.mine.id && pair.enemy === selected.enemy.id);
        if (prior && (memory.matchup?.mine !== prior.mine || memory.matchup?.enemy !== prior.enemy)) {
          const { conditions, ...matchup } = structuredClone(prior);
          memory = { ...memory, matchup, conditions };
        }
      }
      memory = rememberDialoguePlan(memory, plan, fact);
      const itemOrRule = (plan.type === "card" || plan.type === "code") && typeof plan.answer !== "string"
        && ["item", "rule"].includes(plan.answer.kind);
      memory.mechanic = mechanic && plan === mechanic.plan ? mechanic.memory : itemOrRule ? memory.mechanic : undefined;
      if (memory.active === "matchup") memory.conditions = scenarioConditions(question, memory.conditions, ctx.turns.length, conditionHint(resolved, memory, ctx));
    }
    const matchup = plan.type === "matchup" && memory.matchup ? { ...memory.matchup, conditions: structuredClone(memory.conditions) } : undefined;
    parts.push({ question, plan, matchup, request: contract });
  }
  rememberMatchupSelection(memory, parts.flatMap(part => part.matchup ? [part.matchup] : []));
  return { parts, memory, trace };
}
