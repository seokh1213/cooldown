import { resolveQuestion, type ResolvedQuestion } from "../resolvedQuestion";
import type { AnswerPlan, PlanContext } from "../planTypes";
import type { DialogueMemory } from "../dialogueState";
import { askedRules } from "../questionDocs";
import { asksScenarioAdvice } from "../askWords";
import { buildItemCard } from "../context";
import { normalizeMechanicQuestion, questionState } from "./question";
import { questionTopic } from "./retrieval";
import { renderRules } from "./render";
import { buildSpellAnswer, type AdvisorAnswer } from "../answer";

export function effectSourcesPlan(input: ResolvedQuestion, ctx: PlanContext, memory: DialogueMemory): AnswerPlan | undefined {
  const data = ctx.data;
  if (!data?.abilityRules?.size || ctx.lang !== "ko_KR" || input.champions.length > 1 || input.matchup) return undefined;
  let question = normalizeMechanicQuestion(input.text);
  const correction = /^\s*아니/.test(question) && !input.spellFocus && !questionTopic(question)
    && /(?:스킬|능력)(?:들)?\s*(?:중에?|에서|에)\s*[?？.!]*$/.test(question);
  const previous = correction && memory.lastReply ? resolveQuestion(memory.lastReply.question, data) : undefined;
  const topic = questionTopic(question) ?? (previous && questionTopic(normalizeMechanicQuestion(previous.text)));
  const kind = topic === "heal" || topic === "shield" ? topic : undefined;
  if (!kind || asksScenarioAdvice(question) || buildItemCard(data, question)
    || /소환사|스펠|\bsummoner\b|召唤师|(?:회복|치유)\s*감소|치감/i.test(question)) return undefined;
  const remembered = memory.active === "spell" ? memory.spell : undefined;
  const champion = remembered?.champion ?? (memory.active === "champion" ? memory.champion
    : memory.rule?.id?.startsWith("ability-effects:") ? memory.rule.context?.champions[0] : undefined);
  const card = input.champions[0] ?? previous?.champions[0] ?? (champion && data.cardById.get(champion));
  if (!card || askedRules(data, question).some(rule => rule.subject !== "gameplay" && !(kind === "heal" && rule.name === "회복"))) return undefined;
  const label = { heal: "회복", shield: "보호막" }[kind];
  if (previous) question = `${question} ${label}`;
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
  const overview = only || !input.slot && (input.champions.length > 0 || correction || !remembered?.slot);
  if (!overview && !linked) return undefined;
  const selected = overview ? sources : linked ? [linked] : [];
  const intro = linked ? `${hitSpell!.slot} ${hitSpell!.name} 적중으로 이어지는 ${label}은 P ${linked.spell.name}의 효과입니다. 아래 발동 조건을 충족해야 합니다.` : undefined;
  const scope = overview ? selected.length
    ? `${card.name}의 ${label} 효과는 **${selected.map(source => source.spell.slot).join("·")}**에 있습니다.`
    : `현재 자료에서는 ${card.name}의 ${label} 효과가 있는 스킬을 확인하지 못했습니다.` : undefined;
  const context = { champions: [card.id], slot: overview ? undefined : input.slot ?? remembered?.slot };
  const state = questionState(question);
  const sections = selected.map(source => {
    const rules = source.rules.map(rule => ({ ...rule,
      effects: rule.effects.filter(effect => effect.kind === kind || effect.kind === "cooldown_change") }));
    return `### ${card.name} ${source.spell.slot} ${source.spell.name}\n${renderRules(source.ability.job, rules, question, state, "compact")}`;
  });
  const references: AdvisorAnswer[] = selected.length
    ? selected.map(source => buildSpellAnswer(card, source.spell, question, ctx.lang))
    : [{ kind: "champion", card, view: "skills" }];
  return { type: "code", answer: [intro, scope, ...sections].filter(Boolean).join("\n\n"),
    references,
    knowledge: { id: `ability-effects:${card.id}:${kind}`, title: `${card.name} ${label}`, context },
    controlContext: context };
}
