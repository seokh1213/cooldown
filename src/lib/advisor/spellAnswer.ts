/** 스킬 카드의 구조화된 사실과 질문이 가리킨 결론. */
import type { ChampionCard, SpellFact } from "@/lib/knowledge/facts";
import type { Language } from "@/i18n";
import type { AdvisorAnswer, Fact } from "./answer";
import { detectSpellFocus } from "./spellFocus";
import { cardLabels, translateDamage, translateRatioStat, translateTag } from "./promptLocale";
import { sentencesWith } from "./answerText";
import { controlText, controlHeading } from "@/lib/knowledge/crowdControl";
import { asksCrowdControl } from "./crowdControlQuestion";
import { passiveAttackEvidence } from "./basicAttackQuestion";
import { passiveStatEvidence } from "./passiveStatQuestion";

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

/**
 * 스킬 답. 질문이 가리키는 사실을 앞에 놓는다.
 *
 * 구조 필드(쿨·소모·계수)는 값이 바로 있으니 headline 으로 올린다.
 * 효과 수치는 본문 문장에만 있으니 그 문장을 골라 highlighted 로 올린다.
 */
export function buildSpellAnswer(
  card: ChampionCard,
  spell: SpellFact,
  question: string,
  lang: Language = "ko_KR",
): AdvisorAnswer {
  const w = cardLabels(lang);
  const detected = detectSpellFocus(question);
  const facts: Fact[] = [];
  const cooldown = cooldownFact(spell, lang);
  if (cooldown) facts.push(cooldown);
  if (spell.cost) facts.push({ label: w.cost, value: spell.cost });
  const range = rangeFact(spell, lang);
  if (range) facts.push(range);
  if (spell.damageTypes.length) {
    facts.push({ label: w.damageType, value: spell.damageTypes.map((type) => translateDamage(type, lang)).join("·") });
  }
  if (spell.effects.length) {
    facts.push({ label: w.effects, value: spell.effects.map((tag) => translateTag(tag, lang)).join(", ") });
  }
  const control = spell.crowdControl ? { label: controlHeading(lang), value: controlText(spell.crowdControl, lang) } : undefined;
  if (control) facts.push(control);
  const ratios = Object.entries(spell.ratios ?? {});
  if (ratios.length) facts.push({ label: w.ratios, value: ratioText(ratios, lang) });

  let headline: Fact | undefined;
  let highlighted: string[] = [];
  if (control && asksCrowdControl(question)) {
    headline = control;
  } else if (detected?.focus === "cooldown" && cooldown) {
    headline = cooldown;
  } else if (detected?.focus === "cost" && spell.cost) {
    headline = { label: w.cost, value: spell.cost };
  } else if (detected?.focus === "ratio" && ratios.length) {
    headline = { label: w.ratios, value: ratioText(ratios, lang) };
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
