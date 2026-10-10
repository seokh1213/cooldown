/** 슬롯 이름 없이 물은 평타·능력치 전환 판정도 기존 패시브 본문을 직접 조회한다. */
import type { ChampionCard } from "@/domain/knowledge/facts";
import { buildSpellAnswer } from "../answers/spellAnswer";
import { dialogueMemoryOf, type DialogueMemory } from "../conversation/dialogueState";
import { isBasicAttackMechanicQuestion, passiveAttackEvidence } from "../understanding/basicAttackQuestion";
import { isPassiveStatQuestion, passiveStatEvidence } from "../understanding/passiveStatQuestion";
import type { ResolvedQuestion } from "../understanding/resolvedQuestion";
import type { AnswerPlan, PlanContext } from "../contracts/planTypes";
import { askedRules } from "../retrieval/questionDocs";
import { buildItemCard } from "../conversation/context";

function passiveOwner(resolved: ResolvedQuestion, ctx: PlanContext, memory: DialogueMemory): ChampionCard | undefined {
  if (resolved.champions.length) return resolved.champions.length === 1 ? resolved.champions[0] : undefined;
  const prior = memory.active === "spell" ? memory.spell?.champion
    : memory.active === "champion" ? memory.champion
      : memory.active === "stat" && memory.stat?.champions.length === 1 ? memory.stat.champions[0] : undefined;
  if (prior) return ctx.data!.cardById.get(prior);
  return ctx.championIds.length === 1 ? ctx.data!.cardById.get(ctx.championIds[0]) : undefined;
}

export function passiveMechanicPlan(resolved: ResolvedQuestion, ctx: PlanContext, suppliedMemory?: DialogueMemory): AnswerPlan | undefined {
  if (!ctx.data || resolved.matchup || resolved.slot && resolved.slot !== "P") return undefined;
  const attack = isBasicAttackMechanicQuestion(resolved.text);
  const stat = isPassiveStatQuestion(resolved.text);
  if (!attack && !stat || askedRules(ctx.data, resolved.text).some(rule => rule.subject !== "gameplay")) return undefined;
  if (attack && buildItemCard(ctx.data, resolved.text)) return undefined;
  const memory = suppliedMemory ?? dialogueMemoryOf(ctx.turns, ctx.data);
  const card = passiveOwner(resolved, ctx, memory);
  if (!card || card.spells.some(spell => spell.slot !== "P" && spell.name.length > 1 && resolved.text.includes(spell.name))) return undefined;
  const passive = card.spells.find(spell => spell.slot === "P");
  if (!passive) return undefined;
  const highlighted = stat ? passiveStatEvidence(passive, resolved.text) : passiveAttackEvidence(passive, resolved.text);
  if (!highlighted.length) return undefined;
  const answer = buildSpellAnswer(card, passive, resolved.text, ctx.lang);
  return answer.kind === "spell" ? { type: "card", answer: { ...answer, focus: "effect", headline: undefined, facts: [], highlighted }, notice: ctx.notice } : undefined;
}
