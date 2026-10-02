/** 검증한 상호작용 및 CC 조회. 모델의 추측이나 일반 상성 조언보다 확인된 사실을 먼저 쓴다. */
import { CROWD_CONTROL, controlText } from "@/lib/knowledge/crowdControl";
import { matchesMechanicsQuestion } from "@/lib/knowledge/mechanics";
import { asksCrowdControl, asksCrowdControlSequence } from "./crowdControlQuestion";
import { asksSkillHandling, asksScenarioAdvice } from "./askWords";
import { buildSpellAnswer } from "./spellAnswer";
import type { ResolvedQuestion } from "./resolvedQuestion";
import type { AnswerPlan, PlanContext } from "./planTypes";
import type { SpellFact } from "@/lib/knowledge/facts";
import type { Language } from "@/i18n";

function smiteRestriction(spells: SpellFact[], lang: Language): string {
  const i = lang === "ko_KR" ? 0 : lang === "en_US" ? 1 : 2;
  if (spells.some(spell => !spell.crowdControl || spell.crowdControl.status !== "known")) {
    return ["복사·반사된 효과나 확인되지 않은 판정에 따라 달라져 강타 가능 여부를 확정할 수 없습니다. 실제 효과가 제압·정지라면 그동안 강타를 쓸 수 없습니다.",
      "Smite availability depends on the copied, reflected or unverified effect. It is disabled if that effect applies suppression or stasis.",
      "惩戒能否使用取决于复制、反弹或尚未确认的效果。若实际效果为压制或凝滞，期间不能使用惩戒。"][i];
  }
  const controls = spells.flatMap(s => s.crowdControl?.effects ?? []).filter(e => e.target === "enemy" || e.target === "all");
  const blocked = controls.some(e => CROWD_CONTROL[e.type].blocksSmite);
  return blocked ? ["제압·정지가 유지되는 동안 강타를 쓸 수 없습니다. 다른 CC 단계에서는 이 제한이 없습니다.",
    "Smite is disabled during suppression or stasis; other CC phases do not impose this restriction.", "压制或凝滞期间不能使用惩戒；其他控制阶段不受此限制。"][i]
    : ["이 CC 자체는 강타 사용을 막지 않습니다. 대상·사거리·쿨타임 조건은 별도로 충족해야 합니다.",
      "This CC does not disable Smite. Target, range and cooldown requirements still apply.", "这些控制不禁止惩戒，但仍须满足目标、范围和冷却条件。"][i];
}

function curatedInteraction(question: string, ctx: PlanContext): AnswerPlan | undefined {
  const candidates = ctx.data!.mechanics.filter(section => section.questionGroups?.length
    && matchesMechanicsQuestion(section, question));
  const best = candidates.sort((a, b) => b.questionGroups!.length - a.questionGroups!.length)[0];
  if (!best) return undefined;
  const localized = ctx.lang === "ko_KR" ? undefined : best.localized?.[ctx.lang];
  const title = localized?.title ?? best.title;
  const text = localized?.text ?? best.text;
  return { type: "code", answer: `### ${title}\n${text}`, knowledge: { id: `mech:${best.id}`, title } };
}

export function knowledgeFactPlan(resolved: ResolvedQuestion, ctx: PlanContext): AnswerPlan | undefined {
  if (!ctx.data) return undefined;
  const { text: question } = resolved;
  let { champions, slot } = resolved;
  const smite = /강타|스마|\bsmite\b|惩戒/i.test(question);
  if (!champions.length && smite && /그럼|그때|이때|그거|then|that|那么|此时/i.test(question)) {
    const replies = ctx.turns.filter(turn => turn.role === "assistant");
    const prior = replies[replies.length - 1];
    const answer = prior?.answer;
    if (answer?.kind === "spell" && answer.spell.crowdControl) {
      champions = [ctx.data.cardById.get(answer.championId)!].filter(Boolean);
      slot = answer.spell.slot;
    }
  }
  const interaction = curatedInteraction(question, ctx);
  const propertyQuestion = smite || /정화|수은|미카엘|강인함|치감|해제|풀(?:면|어|리|려|린|렸)|cleanse|qss|mikael|tenacity|dispel|remove|净化|水银|米凯尔|韧性|解除/i.test(question);
  if (interaction && (!champions.length || propertyQuestion)) return interaction;
  if (asksSkillHandling(question) || asksScenarioAdvice(question) || resolved.matchup) return undefined;
  if (interaction && asksCrowdControlSequence(question)) return interaction;
  if (!champions.length || !(asksCrowdControl(question) || smite)) return interaction;
  if (champions.length === 1 && slot && !smite) {
    const spell = champions[0].spells.find(s => s.slot === slot);
    if (spell?.crowdControl) return { type: "card", answer: buildSpellAnswer(champions[0], spell, question, ctx.lang) };
  }
  const sections = champions.map(card => {
    const spells = slot ? card.spells.filter(s => s.slot === slot) : card.spells;
    const lines = spells.map(spell => `${spell.slot} ${spell.name}: ${spell.crowdControl ? controlText(spell.crowdControl, ctx.lang) : "CC 정보 미확인"}`);
    // 유형에 따른 강타 판정만 말한다. 실제 타깃의 사거리/생존/쿨타임까지 사용 가능하다고 보장하지 않는다.
    if (smite) lines.push(smiteRestriction(spells, ctx.lang));
    return `### ${card.name}\n${lines.join("\n")}`;
  });
  return { type: "code", answer: sections.join("\n\n") };
}
