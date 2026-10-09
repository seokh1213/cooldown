import type { ResolvedQuestion } from "../resolvedQuestion";
import type { AnswerPlan, PlanContext } from "../planTypes";
import type { DialogueMemory } from "../dialogueState";
import { askedRules } from "../questionDocs";
import { asksScenarioAdvice } from "../askWords";
import { buildItemCard } from "../context";
import { normalizeMechanicQuestion, questionState } from "./question";
import { questionTopic } from "./retrieval";
import { renderRules } from "./render";

export function effectSourcesPlan(input: ResolvedQuestion, ctx: PlanContext, memory: DialogueMemory): AnswerPlan | undefined {
  const data = ctx.data;
  if (!data?.abilityRules?.size || ctx.lang !== "ko_KR" || input.champions.length > 1 || input.matchup) return undefined;
  const question = normalizeMechanicQuestion(input.text);
  const topic = questionTopic(question);
  const kind = topic === "heal" || topic === "shield" ? topic : undefined;
  if (!kind || asksScenarioAdvice(question) || buildItemCard(data, question)
    || /소환사|스펠|\bsummoner\b|召唤师|(?:회복|치유)\s*감소|치감/i.test(question)) return undefined;
  const remembered = memory.active === "spell" ? memory.spell : undefined;
  const card = input.champions[0] ?? (remembered && data.cardById.get(remembered.champion));
  if (!card || askedRules(data, question).some(rule => rule.subject !== "gameplay" && !(kind === "heal" && rule.name === "회복"))) return undefined;
  const sources = card.spells.flatMap(spell => {
    const ability = data.abilityRules!.get(`${card.id}.${spell.slot}`);
    if (!ability || ability.job.patch !== data.patch || ability.job.slotRole === "interface_only"
      || ability.job.variants.some(variant => variant.id !== "base")) return [];
    const rules = ability.draft.rules.filter(rule => rule.effects.some(effect => effect.kind === kind));
    return rules.length ? [{ spell, ability, rules }] : [];
  });
  const only = /(?:[PQWER]|궁(?:극기)?|패시브)(?:에서|에|으로|로|은|는)?\s*(?:만|뿐|밖에)/i.test(question);
  const hit = /(?<![A-Za-z])([QWER])(?![A-Za-z])[^?？.!]*?(?:맞|적중|명중)/i.exec(question);
  const slot = hit?.[1].toUpperCase() ?? (/(?:맞|적중|명중)/.test(question) ? input.slot ?? remembered?.slot : undefined);
  const hitSpell = card.spells.find(spell => spell.slot === slot);
  const hitAbility = hitSpell && data.abilityRules.get(`${card.id}.${hitSpell.slot}`);
  const passive = sources.find(source => source.spell.slot === "P");
  const linked = hitSpell && hitSpell.slot !== "P" && !sources.some(source => source.spell.slot === hitSpell.slot)
    && hitAbility?.draft.rules.some(rule => rule.effects.some(effect => effect.kind === "damage"))
    && passive?.rules.some(rule => rule.trigger.subject === "caster"
      && ["ability_hit", "attack_or_ability_hit"].includes(rule.trigger.event)) ? passive : undefined;
  if (!only && !linked) return undefined;
  const label = { heal: "회복", shield: "보호막" }[kind];
  const selected = only ? sources : linked ? [linked] : [];
  if (!selected.length) return undefined;
  const intro = linked ? `${hitSpell!.slot} ${hitSpell!.name} 적중으로 이어지는 ${label}은 P ${linked.spell.name}의 효과입니다. 아래 발동 조건을 충족해야 합니다.` : undefined;
  const scope = only ? `현재 자료에서 확인된 ${card.name}의 ${label} 스킬은 ${selected.map(source => `${source.spell.slot} ${source.spell.name}`).join(", ")}입니다.` : undefined;
  const state = questionState(question);
  const sections = selected.map(source => `### ${card.name} ${source.spell.slot} ${source.spell.name}\n${renderRules(source.ability.job, source.rules, question, state)}`);
  return { type: "code", answer: [intro, scope, ...sections].filter(Boolean).join("\n\n"),
    knowledge: { id: `ability-effects:${card.id}:${kind}`, title: `${card.name} ${label}`, context: { champions: [card.id], slot: input.slot ?? remembered?.slot } },
    controlContext: { champions: [card.id], slot: input.slot ?? remembered?.slot } };
}
