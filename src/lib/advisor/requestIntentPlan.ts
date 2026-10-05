/** 소개·전체 능력치·스킬 소개는 현재 요청 범위로 새 답을 만든다. 이전 조회 항목을 이어 붙이지 않는다. */
import type { ChampionCard } from "@/lib/knowledge/facts";
import type { PlanContext, AnswerPlan } from "./planTypes";
import type { ResolvedQuestion } from "./resolvedQuestion";
import type { DialogueMemory } from "./dialogueState";
import { ALL_CHAMPION_STATS, explicitStatLevel, isStatLevel } from "./statQuery";
import { statPlanForQuery, unsupportedStatLevelPlan } from "./dialogueStats";

function targets(resolved: ResolvedQuestion, memory: DialogueMemory, ctx: PlanContext): ChampionCard[] {
  const explicit = resolved.champions.map(card => card.id);
  const prior = memory.active === "stat" ? memory.stat?.champions : memory.active === "compare" ? memory.compared
    : memory.active === "spell" && memory.spell ? [memory.spell.champion] : memory.champion ? [memory.champion] : undefined;
  return (explicit.length ? explicit : prior?.length ? prior : ctx.championIds)
    .map(id => ctx.data?.cardById.get(id)).filter((card): card is ChampionCard => Boolean(card));
}

export function requestIntentPlan(resolved: ResolvedQuestion, memory: DialogueMemory, ctx: PlanContext): AnswerPlan | undefined {
  const scope = resolved.requestIntent?.scope;
  if (scope === "chat") return { type: "code", answer: ctx.copy.smallTalk };
  if (scope === "identity") return { type: "code", answer: ctx.copy.identity };
  if (!["overview", "statsAll", "skills"].includes(scope ?? "") || resolved.matchup) return undefined;
  const cards = targets(resolved, memory, ctx);
  if (!cards.length) return undefined;
  if (scope === "statsAll") {
    const explicit = explicitStatLevel(resolved.text);
    const level = explicit ?? (memory.active === "stat" ? memory.stat?.level : undefined) ?? 1;
    if (!isStatLevel(level)) return unsupportedStatLevelPlan(level, ctx);
    return statPlanForQuery({ kind: "championStat", champions: cards.map(card => card.id), field: ALL_CHAMPION_STATS[0], fields: ALL_CHAMPION_STATS, level }, resolved, ctx);
  }
  if (cards.length !== 1) return undefined;
  return { type: "card", answer: { kind: "champion", card: cards[0], view: scope === "skills" ? "skills" : "overview" } };
}
