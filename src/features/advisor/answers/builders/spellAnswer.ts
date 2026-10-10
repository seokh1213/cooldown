/** 스킬 카드의 구조화된 사실과 질문이 가리킨 결론. */
import type { ChampionCard,SpellFact } from "@/domain/knowledge/cards/contracts";
import { tickHeading,tickText } from "@/domain/knowledge/combat/abilityTicks";
import { controlHeading,controlText } from "@/domain/knowledge/combat/crowdControl";
import type { Language } from "@/shared/i18n";
import { passiveAttackEvidence } from "../../understanding/spells/basicAttackQuestion";
import { asksCrowdControl } from "../../understanding/spells/crowdControlQuestion";
import { passiveStatEvidence } from "../../understanding/spells/passiveStatQuestion";
import { detectSpellFocus,type SpellFocus } from "../../understanding/spells/spellFocus";
import { selectSpellForm } from "../../understanding/spells/spellForm";
import type { AdvisorAnswer,Fact } from "../answer";
import { sentencesWith } from "../presentation/answerText";
import { cardLabels,translateDamage,translateRatioStat,translateTag } from "../presentation/promptLocale";

/**
 * 계수 목록을 글로. "주문력 105%" 의 능력치 이름은 툴팁에서 읽어 낸 한국어라 옮긴다.
 *
 * 한 줄 요약·표·헤드라인이 저마다 같은 식을 적고 있었다. 옮길 자리가 늘자 한 곳을
 * 빠뜨려 영어 카드에 "Ratios 주문력 50%" 가 나왔다. 식을 한 곳에 모은다.
 */
export function ratioText(ratios: Array<[string, number]>, lang: Language): string {
  return ratios.map(([stat, value]) => `${translateRatioStat(stat, lang)} ${value}%`).join(", ");
}

/**
 * 쿨타임 행. 충전형 스킬(럼블 E, 아칼리 R…)은 쿨타임 필드가 연속 시전 간격 0.5초여서
 * 그대로 내면 틀린 답이 된다. 쿨타임 표와 같은 관례로 재충전 시간을 앞세운다.
 */
export function cooldownFact(spell: SpellFact, lang: Language = "ko_KR"): Fact | undefined {
  const w = cardLabels(lang);
  if (spell.recharge) {
    const charges = spell.maxCharges ? ` · ${w.charges(spell.maxCharges)}` : "";
    const gap = spell.cooldown ? ` · ${w.recast(spell.cooldown)}` : "";
    return { label: w.recharge, value: `${w.seconds(spell.recharge)}${charges}${gap}` };
  }
  if (spell.cooldown) return { label: w.cooldown, value: w.seconds(spell.cooldown) };
  return undefined;
}

/**
 * 시전 사거리. 랭크마다 다르면 "2500/3250/4000". 자기 시전·전역 스킬은 값이 없다(`SpellFact.range`).
 * "제드 궁 사거리" 에 본문 문장만 보이고 625 가 없었다(2026-09-30 브라우저 시험).
 */
export function rangeFact(spell: SpellFact, lang: Language = "ko_KR"): Fact | undefined {
  if (spell.range === undefined) return undefined;
  const value = Array.isArray(spell.range) ? spell.range.join("/") : String(spell.range);
  return { label: cardLabels(lang).range, value };
}

/** 스킬 하나에서 사실 하나를 글로. 스킬 표(챔피언 카드의 focus)와 비교 표가 같이 쓴다. */
export function spellFocusValue(spell: SpellFact, focus: SpellFocus, lang: Language = "ko_KR"): string {
  switch (focus) {
    case "ticks":
      return tickText(spell.ticks, lang);
    case "cooldown":
      return cooldownFact(spell, lang)?.value ?? "";
    case "cost":
      return spell.cost ?? "";
    case "ratio":
      return ratioText(Object.entries(spell.ratios ?? {}), lang);
    case "range":
      return rangeFact(spell, lang)?.value ?? "";
    case "damage":
      return spell.damageTypes.map((type) => translateDamage(type, lang)).join("·");
    case "effect":
      return spell.effects.map((tag) => translateTag(tag, lang)).join(", ");
  }
}

/** 질문과 독립적인 스킬 전체 정보. 카드의 모든 행과 답변이 같은 사실을 사용한다. */
export function spellFacts(spell: SpellFact, lang: Language = "ko_KR"): Fact[] {
  const w = cardLabels(lang);
  const facts: Fact[] = [];
  if (spell.ticks?.status === "known" || spell.ticks?.status === "unknown") facts.push({ label: tickHeading(lang), value: tickText(spell.ticks, lang) });
  const cooldown = cooldownFact(spell, lang);
  if (cooldown) facts.push(cooldown);
  if (spell.cost) facts.push({ label: w.cost, value: spellFocusValue(spell, "cost", lang) });
  const range = rangeFact(spell, lang);
  if (range) facts.push(range);
  if (spell.damageTypes.length) {
    facts.push({ label: w.damageType, value: spellFocusValue(spell, "damage", lang) });
  }
  if (spell.effects.length) {
    facts.push({ label: w.effects, value: spellFocusValue(spell, "effect", lang) });
  }
  const control = spell.crowdControl ? { label: controlHeading(lang), value: controlText(spell.crowdControl, lang) } : undefined;
  if (control) facts.push(control);
  const ratios = Object.entries(spell.ratios ?? {});
  if (ratios.length) facts.push({ label: w.ratios, value: spellFocusValue(spell, "ratio", lang) });
  return facts;
}

/** 질문이 가리킨 수치나 본문 문장을 답의 앞에 놓는다. */
export function buildSpellAnswer(
  card: ChampionCard,
  spell: SpellFact,
  question: string,
  lang: Language = "ko_KR",
): AdvisorAnswer {
  const form = selectSpellForm(card, spell, question, lang);
  if (form.clarification) return { kind: "text", text: form.clarification };
  spell = form.spell;
  if (form.selected) card = { ...card, spells: card.spells.map(item => item.slot === spell.slot ? spell : item) };
  const w = cardLabels(lang);
  const detected = detectSpellFocus(question);
  const facts = spellFacts(spell, lang);
  const cooldown = cooldownFact(spell, lang);
  const range = rangeFact(spell, lang);
  const control = facts.find(fact => fact.label === controlHeading(lang));
  const ratios = Object.entries(spell.ratios ?? {});

  let headline: Fact | undefined;
  let highlighted: string[] = [];
  if (detected?.focus === "ticks") {
    headline = { label: tickHeading(lang), value: tickText(spell.ticks, lang) };
  } else if (control && asksCrowdControl(question)) {
    headline = control;
  } else if (detected?.focus === "cooldown" && cooldown) {
    headline = cooldown;
  } else if (detected?.focus === "cost" && spell.cost) {
    headline = { label: w.cost, value: spellFocusValue(spell, "cost", lang) };
  } else if (detected?.focus === "ratio" && ratios.length) {
    headline = { label: w.ratios, value: spellFocusValue(spell, "ratio", lang) };
  } else if (detected?.focus === "range" && range) {
    headline = range;
  } else if (detected?.focus === "effect" || detected?.focus === "range") {
    // 사거리 숫자가 없는 스킬(자기 시전·전역)은 본문의 사거리 문장으로 내려간다
    highlighted = sentencesWith(spell.text, detected.keywords);
  } else if (detected?.focus === "damage") {
    highlighted = sentencesWith(spell.text, ["피해"]);
  }
  const attackEvidence = passiveAttackEvidence(spell, question);
  if (!headline && attackEvidence.length) highlighted = attackEvidence;
  const statEvidence = passiveStatEvidence(spell, question);
  if (!headline && statEvidence.length) highlighted = statEvidence;
  if (form.selected && !headline && !highlighted.length) highlighted = [spell.text];

  return {
    kind: "spell",
    championId: card.id,
    championName: card.name,
    card,
    spell,
    focus: detected?.focus,
    headline,
    // headline 을 이미 올렸으면 같은 사실을 facts 에 되풀이하지 않는다.
    facts: headline === control ? [] : headline ? facts.filter((fact) => fact.label !== headline?.label) : facts,
    highlighted,
  };
}
