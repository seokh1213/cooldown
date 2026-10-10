/** 검증한 상호작용 및 CC 조회. 모델의 추측이나 일반 상성 조언보다 확인된 사실을 먼저 쓴다. */
import { CROWD_CONTROL, controlText, controlLabel, type CrowdControlType, type SpellCrowdControl } from "@/domain/knowledge/combat/crowdControl";
import { matchesMechanicsQuestion } from "@/domain/knowledge/notes/mechanics";
import { controlQuery, askedCleansers, asksCrowdControl, asksControlDuration } from "../../understanding/spells/crowdControlQuestion";
import { controlInteractionAnswer, controlRuleAddenda } from "../../answers/builders/controlInteractionAnswer";
import { controlSubject, controlClarification } from "../../understanding/spells/controlSubject";
import { dialogueMemoryOf, type DialogueMemory } from "../../conversation/memory/dialogueState";
import { asksSkillHandling, asksScenarioAdvice, asksMatchup } from "../../understanding/requests/askWords";
import { buildSpellAnswer } from "../../answers/builders/spellAnswer";
import type { ResolvedQuestion } from "../../understanding/resolvedQuestion";
import type { AnswerPlan, PlanContext, ControlContext } from "../../contracts/planTypes";
import type { Language } from "@/shared/i18n";
import { interfaceSlotPlan } from "./abilityBoundaryPlan";
import { detectChampionMentions } from "../../understanding/champions/intent";

function smiteRestriction(effects: Array<SpellCrowdControl | undefined>, lang: Language): string {
  const i = lang === "ko_KR" ? 0 : lang === "en_US" ? 1 : 2;
  if (effects.some(control => !control || control.status !== "known")) {
    return ["복사·반사된 효과나 확인되지 않은 판정에 따라 달라져 강타 가능 여부를 확정할 수 없습니다. 실제 효과가 제압·정지라면 그동안 강타를 쓸 수 없습니다.",
      "Smite availability depends on the copied, reflected or unverified effect. It is disabled if that effect applies suppression or stasis.",
      "惩戒能否使用取决于复制、反弹或尚未确认的效果。若实际效果为压制或凝滞，期间不能使用惩戒。"][i];
  }
  const controls = effects.flatMap(control => control?.effects ?? []).filter(e => e.target === "enemy" || e.target === "all");
  const blocked = controls.some(e => CROWD_CONTROL[e.type].blocksSmite);
  return blocked ? ["제압·정지가 유지되는 동안 강타를 쓸 수 없습니다. 다른 CC 단계에서는 이 제한이 없습니다.",
    "Smite is disabled during suppression or stasis; other CC phases do not impose this restriction.", "压制或凝滞期间不能使用惩戒；其他控制阶段不受此限制。"][i]
    : ["이 CC 자체는 강타 사용을 막지 않습니다. 대상·사거리·쿨타임 조건은 별도로 충족해야 합니다.",
      "This CC does not disable Smite. Target, range and cooldown requirements still apply.", "这些控制不禁止惩戒，但仍须满足目标、范围和冷却条件。"][i];
}

function curatedInteraction(question: string, ctx: PlanContext, subject?: ControlContext): AnswerPlan | undefined {
  const query = subject ? `${subject.champions.map(id => ctx.data!.cardById.get(id)?.name ?? "").join(" ")} ${subject.slot ?? ""} ${question}` : question;
  const names = detectChampionMentions(ctx.data!, query).map(mention => query.slice(mention.index, mention.index + mention.length));
  const candidates = ctx.data!.mechanics.filter(section => section.questionGroups?.length
    && (!section.subjects || section.subjects.some(s => subject?.champions.includes(s.champion)
      && (subject.slot === s.slot || !subject.slot && Boolean(section.evidence))))
    && matchesMechanicsQuestion(section, section.subjects ? query : names.reduce((text, name) =>
      section.questionGroups!.some(group => group.some(word => word.toLowerCase() === name.toLowerCase()))
        ? text : text.split(name).join(" "), query)));
  const relevance = (note: typeof candidates[number]) => note.keywords.reduce((score, word) => score
    + (matchesMechanicsQuestion({ questionGroups: [[word]] }, query) ? word.length : 0), 0);
  const best = candidates.sort((a, b) => Number(Boolean(b.subjects)) - Number(Boolean(a.subjects))
    || b.questionGroups!.length - a.questionGroups!.length
    || (a.evidence && b.evidence ? relevance(b) - relevance(a) : 0))[0];
  if (!best) return undefined;
  const localized = ctx.lang === "ko_KR" ? undefined : best.localized?.[ctx.lang];
  const title = localized?.title ?? best.title;
  const text = localized?.text ?? best.text;
  const scoped = best.subjects?.filter(s => subject?.champions.includes(s.champion)
    && (!subject.slot || subject.slot === s.slot));
  const controlContext: ControlContext | undefined = best.controls?.length
    ? scoped?.length === 1 ? { champions: [scoped[0].champion], slot: scoped[0].slot }
      : { champions: [], types: [...best.controls] } : undefined;
  return { type: "code", answer: `### ${title}\n${text}`, knowledge: { id: `mech:${best.id}`, title,
    context: subject ? { champions: [...subject.champions], slot: subject.slot } : undefined },
    controlContext };
}

function absentControl(question: string, controls: Array<SpellCrowdControl | undefined>, lang: Language): string | undefined {
  if (!controls.length || controls.some(control => control?.status !== "known")) return undefined;
  const type = (Object.keys(CROWD_CONTROL) as CrowdControlType[]).find(type => {
    const label = controlLabel(type, lang).split("(")[0].trim();
    return label && question.toLowerCase().includes(label.toLowerCase());
  });
  if (!type || controls.some(control => control?.effects.some(effect => effect.type === type))) return undefined;
  const label = controlLabel(type, lang);
  return lang === "ko_KR" ? `${label} 효과가 없어요.` : lang === "en_US" ? `There is no ${label.toLowerCase()} effect.` : `没有${label}效果。`;
}

export function knowledgeFactPlan(resolved: ResolvedQuestion, ctx: PlanContext, suppliedMemory?: DialogueMemory): AnswerPlan | undefined {
  if (!ctx.data) return undefined;
  if (resolved.spellFocus?.focus === "ticks") return undefined;
  if (resolved.champions.length > 1 && !resolved.slot && asksMatchup(resolved.text)) return undefined;
  const memory = suppliedMemory ?? dialogueMemoryOf(ctx.turns, ctx.data);
  const query = controlQuery(resolved.text);
  if (query === "cleanse" && !askedCleansers(resolved.text).length && !asksCrowdControl(resolved.text)
    && !resolved.slot && (!memory.control || resolved.champions.length > 1)) return undefined;
  const direct = curatedInteraction(resolved.text, ctx, {
    champions: resolved.champions.map(card => card.id), slot: resolved.slot,
  });
  const directNote = direct?.type === "code" ? ctx.data.mechanics.find(section => `mech:${section.id}` === direct.knowledge?.id) : undefined;
  // 순수 수치 조회는 수치 경로로 보내고, 근거가 있는 조건부 상호작용은 먼저 답한다.
  if (!query && !directNote?.evidence && (asksControlDuration(resolved.text)
    || /쿨|재사용|사거리|계수|피해량|지속시간|몇\s*초|\b(?:cooldown|range|ratio|duration)\b|冷却|射程/i.test(resolved.text))) return undefined;
  // 구체적인 상호작용 노트는 일반 스킬·CC 목록보다 질문에 직접 답한다.
  if (directNote && directNote.questionGroups!.length >= 2
    && (directNote.evidence || !directNote.subjects && !directNote.controls)) return direct;
  if (asksSkillHandling(resolved.text) || asksScenarioAdvice(resolved.text)) return undefined;
  const inferredPassive = query === "types" && !resolved.slot && resolved.champions.length === 1
    && /평타.*(?:한\s*대|한대|1\s*대)|\b(?:basic|auto)\s*attack\b|普攻/i.test(resolved.text);
  const subject = query ? controlSubject(inferredPassive ? { ...resolved, slot: "P" } : resolved, ctx, memory) : undefined;
  const champions = subject ? subject.champions.map(id => ctx.data!.cardById.get(id)!).filter(Boolean) : resolved.champions;
  const slot = subject?.slot ?? resolved.slot;
  const boundary = interfaceSlotPlan({ champions, slot }, ctx);
  if (boundary) return boundary;
  const contextual = subject ? `${champions.map(card => card.name).join(" ")} ${slot ?? ""} ${resolved.text}` : resolved.text;
  const interaction = subject ? curatedInteraction(contextual, ctx, subject) : direct;
  if (asksSkillHandling(resolved.text) || asksScenarioAdvice(resolved.text) || resolved.matchup) return undefined;
  if (!subject || !query) return interaction;
  const withContext = (plan: AnswerPlan): AnswerPlan => ({ ...plan, controlContext: subject });
  if (subject.types?.length && !champions.length) {
    const control: SpellCrowdControl = { status: "known", effects: subject.types.map(type => ({ type, target: "enemy", source: "https://wiki.leagueoflegends.com/en-us/Types_of_Crowd_Control" })) };
    const text = query === "types" ? controlText(control, ctx.lang)
      : query === "smite" ? smiteRestriction([control], ctx.lang) : controlInteractionAnswer(control, query, resolved.text, ctx.lang);
    return withContext({ type: "code", answer: `### ${subject.types.map(type => controlLabel(type, ctx.lang)).join(" · ")}\n${text}` });
  }
  if (query !== "types") {
    if (!slot && interaction && /제압|에어본|정지|수면|졸음|suppression|airborne|stasis|sleep|drowsy|压制|击飞|凝滞|睡眠/i.test(resolved.text)) return interaction;
    const clarification = controlClarification(subject, ctx.lang);
    if (clarification) return withContext({ type: "code", answer: clarification });
    const [card] = champions;
    const spell = card.spells.find(s => s.slot === slot)!;
    const scoped = interaction?.type === "code" && ctx.data.mechanics.find(section => `mech:${section.id}` === interaction.knowledge?.id)?.subjects;
    if (scoped && spell.crowdControl?.status === "known" && (query === "sequence" || query === "cleanse")) return withContext(interaction!);
    if (query !== "smite") {
      let answer = `### ${card.name} ${spell.slot} ${spell.name}\n${controlInteractionAnswer(spell.crowdControl, query, resolved.text, ctx.lang)}`;
      if (query === "cleanse") answer += `\n${controlRuleAddenda(spell.crowdControl, resolved.text, ctx)}`;
      return withContext({ type: "code", answer });
    }
  }
  if (champions.length === 1 && slot && query === "types") {
    const spell = champions[0].spells.find(s => s.slot === slot);
    if (spell?.crowdControl) return withContext({ type: "card", answer: buildSpellAnswer(champions[0], spell, resolved.text, ctx.lang) });
  }
  const sections = champions.map(card => {
    const spells = slot ? card.spells.filter(s => s.slot === slot) : card.spells;
    const lines = spells.map(spell => `${spell.slot} ${spell.name}: ${spell.crowdControl ? controlText(spell.crowdControl, ctx.lang) : "CC 정보 미확인"}`);
    const absence = query === "types" && absentControl(resolved.text, spells.map(spell => spell.crowdControl), ctx.lang);
    if (absence) lines.unshift(absence);
    if (query === "smite") lines.push(smiteRestriction(spells.map(spell => spell.crowdControl), ctx.lang));
    return `### ${card.name}\n${lines.join("\n")}`;
  });
  return withContext({ type: "code", answer: sections.join("\n\n") });
}
