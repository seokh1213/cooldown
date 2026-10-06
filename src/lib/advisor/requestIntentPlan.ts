/** 소개·전체 능력치·스킬 소개는 현재 요청 범위로 새 답을 만든다. 이전 조회 항목을 이어 붙이지 않는다. */
import type { ChampionCard } from "@/lib/knowledge/facts";
import type { PlanContext, AnswerPlan } from "./planTypes";
import type { ResolvedQuestion } from "./resolvedQuestion";
import type { DialogueMemory } from "./dialogueState";
import { ALL_CHAMPION_STATS, explicitStatLevel, isStatLevel } from "./statQuery";
import { statPlanForQuery, unsupportedStatLevelPlan } from "./dialogueStats";
import { asksWholeKit } from "./askWords";
import { asksSpellNumbers } from "./spellFocus";
import { findGameMeta } from "./gameMeta";

function targets(resolved: ResolvedQuestion, memory: DialogueMemory, ctx: PlanContext): ChampionCard[] {
  const explicit = resolved.champions.map(card => card.id);
  const prior = memory.active === "stat" ? memory.stat?.champions : memory.active === "compare" ? memory.compared
    : memory.active === "spell" && memory.spell ? [memory.spell.champion] : memory.champion ? [memory.champion] : undefined;
  return (explicit.length ? explicit : prior?.length ? prior : ctx.championIds)
    .map(id => ctx.data?.cardById.get(id)).filter((card): card is ChampionCard => Boolean(card));
}

export function requestIntentPlan(resolved: ResolvedQuestion, memory: DialogueMemory, ctx: PlanContext): AnswerPlan | undefined {
  const profile = /기본.*정보|프로필|개요|\b(?:basic\s+profile|basic\s+info|profile|background\s+basics|introduction)\b|基础资料|基本信息|英雄概况/i.test(resolved.text);
  const profileAndKit = profile
    && /스킬|기술|\b(?:abilities|kit|skills)\b|技能/i.test(resolved.text)
    && /같이|함께|포함|\bboth\b|\band\b|\balongside\b|一起|和/i.test(resolved.text);
  const typedKit = asksWholeKit(resolved.text) && !asksSpellNumbers(resolved.text)
    && /스킬|기술|패시브|지속\s*효과|궁|\b(?:skills?|abilities|passive|kit|buttons?)\b|技能|被动|大招/i.test(resolved.text);
  const scope = profileAndKit ? "overview" : typedKit && !profile ? "skills" : resolved.requestIntent?.scope;
  if (scope === "chat") return { type: "code", answer: ctx.copy.smallTalk };
  if (scope === "identity") return { type: "code", answer: ctx.copy.identity };
  if (scope === "overview" && asksWholeKit(resolved.text) && !profile && !/소개/.test(resolved.text)) return undefined;
  if (!["overview", "statsAll", "skills"].includes(scope ?? "") || resolved.matchup) return undefined;
  // 이름을 명시한 게임 규칙은 화면의 챔피언을 이어 묻는 요청으로 대체하지 않는다.
  if (!resolved.champions.length && findGameMeta(resolved.text)) return undefined;
  const cards = targets(resolved, memory, ctx);
  if (!cards.length) return undefined;
  if (scope === "statsAll") {
    if (/스킬|패시브|궁(?!금)|아이템|템\s*사|한타|뜻|관통|치명력|\b(?:skill|ability|passive|item|teamfight)\b|技能|被动|装备|团战/i.test(resolved.text.replace(/(?:스킬|패시브)\s*말고/g, ""))) return undefined;
    const explicit = explicitStatLevel(resolved.text);
    const level = explicit ?? (memory.active === "stat" ? memory.stat?.level : undefined) ?? 1;
    if (!isStatLevel(level)) return unsupportedStatLevelPlan(level, ctx);
    return statPlanForQuery({ kind: "championStat", champions: cards.map(card => card.id), field: ALL_CHAMPION_STATS[0], fields: ALL_CHAMPION_STATS, level }, resolved, ctx);
  }
  if (cards.length !== 1) return undefined;
  return { type: "card", answer: { kind: "champion", card: cards[0], view: scope === "skills" ? "skills" : "overview" } };
}
