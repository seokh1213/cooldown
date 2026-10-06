import { buildSpellAnswer } from "./spellAnswer";
import { renderRules } from "./mechanics/render";
import type { ResolvedQuestion } from "./resolvedQuestion";
import type { AnswerPlan, PlanContext } from "./planTypes";

/** 같은 슬롯을 여러 챔피언에게 물으면 각 스킬의 조건을 따로 설명한다. */
export function abilityDescriptions(resolved: ResolvedQuestion, ctx: PlanContext): AnswerPlan[] | undefined {
  if (!ctx.data || resolved.champions.length < 2 || !resolved.slot || resolved.matchup
    || resolved.spellFocus && resolved.spellFocus.focus !== "effect"
    || !/설명|소개|explain|describe|description|介绍|说明/i.test(resolved.text)) return undefined;
  return resolved.champions.map(card => {
    const spell = card.spells.find(spell => spell.slot === resolved.slot);
    if (!spell) return { type: "code", answer: ctx.copy.noLiteAnswer };
    const answer = buildSpellAnswer(card, spell, resolved.text, ctx.lang);
    if (answer.kind !== "spell") return { type: "card", answer };
    const ability = ctx.data!.abilityRules?.get(`${card.id}.${spell.slot}`);
    const approved = ctx.lang === "ko_KR" && ability && ability.job.patch === ctx.data!.patch
      && ability.job.slotRole !== "interface_only" && ability.job.variants.every(variant => variant.id === "base")
      ? renderRules(ability.job, ability.draft.rules, resolved.text) : spell.text || spell.summary;
    return { type: "card", answer: { ...answer, headline: undefined, facts: [],
      highlighted: [`${card.name} ${spell.slot} ${spell.name}:\n${approved}`] } };
  });
}
