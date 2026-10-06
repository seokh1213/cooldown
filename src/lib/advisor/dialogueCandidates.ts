import type { AnswerPlan, PlanContext, PlanDeps } from "./planTypes";
import type { ResolvedQuestion } from "./resolvedQuestion";
import type { DialogueMemory } from "./dialogueState";
import type { RequestContract } from "./requestContract";
import { resolveDialogueFact } from "./dialogueFacts";
import { penetrationCalculation } from "./dialogueRules";
import { dialogueStatPlan, statPlanForQuery } from "./dialogueStats";
import { requestIntentPlan } from "./requestIntentPlan";
import { matchupPlan } from "./dialogueMatchup";
import { knowledgeFactPlan } from "./knowledgeFactPlan";
import { passiveMechanicPlan } from "./passiveMechanicPlan";
import { comboAdvicePlan } from "./comboPlan";
import { abilityBoundaryPlan } from "./abilityBoundaryPlan";
import { buildItemCard } from "./context";
import { askedRuleKinds } from "@/lib/knowledge/rules";
import { detectStats, statQueryFromAnswer } from "./statQuery";
import { answerChampionIds } from "./answer";
import { asksWholeKit } from "./askWords";

/** 조회·승인 근거·상성 중 현재 요청에 맞는 후보를 선택한다. */
export async function dialogueCandidates(resolved: ResolvedQuestion, memory: DialogueMemory, ctx: PlanContext, deps: PlanDeps) {
  const question = resolved.text;
  const mechanic = ctx.data?.abilityRules?.size
    ? (await import("./mechanics/plan")).approvedMechanicPlan(resolved, ctx, memory) : undefined;
  const passive = passiveMechanicPlan(resolved, ctx, memory);
  const knowledge = knowledgeFactPlan(resolved, ctx, memory);
  const item = ctx.data && !askedRuleKinds(question).size
    ? buildItemCard(ctx.data, question, memory.active === "item" ? memory.item : undefined) : undefined;
  const combo = comboAdvicePlan(resolved, ctx, memory);
  const explicitStat = dialogueStatPlan(resolved, memory, ctx);
  const certainStat = explicitStat && detectStats(question).length;
  const inferred = !certainStat && deps.inferStatQuery
    ? await deps.inferStatQuery(resolved, memory, ctx).catch(() => undefined) : undefined;
  const numeric = (inferred ? statPlanForQuery(inferred, resolved, ctx) : undefined) ?? explicitStat;
  const learned = numeric ? undefined : requestIntentPlan(resolved, memory, ctx);
  const fact = numeric ? undefined : resolveDialogueFact(resolved, memory, ctx);
  const requestedMatchup = !numeric && !fact?.plan ? await matchupPlan(resolved, memory, ctx, deps) : undefined;
  const wholeKit = learned?.type === "card" && learned.answer.kind === "champion"
    && learned.answer.view === "skills" && asksWholeKit(question) ? learned : undefined;
  const preferred: AnswerPlan | undefined = abilityBoundaryPlan(resolved, ctx) ?? penetrationCalculation(question, ctx)
    ?? requestedMatchup ?? (!numeric && knowledge?.type === "code" && knowledge.knowledge ? knowledge : undefined)
    ?? combo ?? wholeKit ?? (knowledge?.controlContext && mechanic?.memory.topic !== "control_resistance" ? knowledge : undefined)
    ?? (item ? { type: "card", answer: item } : undefined) ?? mechanic?.plan ?? (numeric ? undefined : knowledge)
    ?? passive ?? learned ?? (resolved.matchup ? await matchupPlan(resolved, memory, ctx, deps) : undefined);
  let request: RequestContract | undefined;
  if (learned?.type === "card") request = { operation: resolved.requestIntent?.scope === "statsAll" ? "lookup" : "explain",
    targets: answerChampionIds(learned.answer), stat: statQueryFromAnswer(learned.answer) };
  if (inferred && numeric) request = { operation: "lookup", stat: inferred, targets: inferred.champions };
  if (passive?.type === "card" && passive.answer.kind === "spell" && preferred === passive)
    request = { operation: "explain", targets: [passive.answer.championId] };
  if (mechanic && preferred === mechanic.plan)
    request = { operation: "explain", targets: [mechanic.memory.abilityId.split(".")[0]] };
  if (combo?.type === "card" && combo.answer.kind === "champion")
    request = { operation: "advice", targets: [combo.answer.card.id] };
  return { plan: preferred ?? numeric, request, fact: preferred || numeric ? undefined : fact, mechanic };
}
