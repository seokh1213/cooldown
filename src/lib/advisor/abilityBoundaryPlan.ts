import type { AnswerPlan, PlanContext } from "./planTypes";
import type { ResolvedQuestion } from "./resolvedQuestion";
import { buildSpellAnswer } from "./spellAnswer";
import { requestedSpellForms } from "./spellForm";
import { answerProse } from "./prose";

export function interfaceSlotPlan(resolved: Pick<ResolvedQuestion, "champions" | "slot">, ctx: PlanContext): AnswerPlan | undefined {
  const [card] = resolved.champions;
  if (!card || resolved.champions.length !== 1 || !resolved.slot) return undefined;
  const ability = ctx.data?.abilityRules?.get(`${card.id}.${resolved.slot}`);
  if (!ability || ability.job.patch !== ctx.data?.patch || ability.job.slotRole !== "interface_only") return undefined;
  const text = ctx.lang === "ko_KR" ? `${card.name} ${resolved.slot}는 무기 정보를 표시하는 인터페이스입니다. 직접 시전하는 스킬이 아니므로 공격 효과나 쿨타임으로 설명할 수 없습니다.`
    : ctx.lang === "en_US" ? `${card.name} ${resolved.slot} displays weapon information. It is not a castable ability and has no cast effect or ability cooldown.`
      : `${card.name} ${resolved.slot}用于显示武器信息，并非可施放的技能，不能按施法效果或技能冷却解释。`;
  return { type: "code", answer: { kind: "text", text }, controlContext: { champions: [card.id], slot: resolved.slot } };
}

/** 표시용 슬롯과 함께 요청한 여러 형태를 일반 단일 스킬 경로 전에 처리한다. */
export function abilityBoundaryPlan(resolved: ResolvedQuestion, ctx: PlanContext): AnswerPlan | undefined {
  const [card] = resolved.champions;
  if (!card || resolved.champions.length !== 1 || !resolved.slot || resolved.matchup) return undefined;
  const boundary = interfaceSlotPlan(resolved, ctx);
  if (boundary) return boundary;
  const spell = card.spells.find(spell => spell.slot === resolved.slot);
  if (!spell || /가속|랭크|haste|rank|急速|等级/i.test(resolved.text)) return undefined;
  const forms = requestedSpellForms(card, spell, resolved.text);
  if (forms.length < 2) return undefined;
  const text = forms.map(form => `${form.label}: ${answerProse(buildSpellAnswer(card, form, resolved.text, ctx.lang), ctx.lang)}`).join("\n\n");
  return { type: "code", answer: { kind: "text", text } };
}
