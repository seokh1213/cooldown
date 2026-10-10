import { ruleLines, ruleName, type RuleNotes } from "@/domain/knowledge/rules";
import { detectSpellFocus } from "./spellFocus";

const TICK = /\bticks?\b|틱|跳/i;
const TICK_MEASURE = /\b(?:\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:ticks?|seconds?)\b|\d+(?:\.\d+)?\s*(?:초|틱|秒|跳)/i;
const PER_TICK_DAMAGE = /틱당.*(?:피해|데미지|대미지|딜)|(?:피해|데미지|대미지|딜).*틱당|\b(?:damage\s+per\s+tick|per.tick\s+damage)\b|每跳.*伤害|伤害.*每跳/i;
const ASPECTS = [
  /증폭|amplif|增幅|增伤/i,
  /은신|진실(?:의)?\s*시야|stealth|invisib|true\s*sight|隐身|真实视野/i,
  /고정\s*피해|true\s*damage|真实伤害|真伤/i,
  /스킬\s*효과|spell\s*effects?|法术效果|技能效果/i,
];

/** 문장을 줄이지 않고 선택해, 그 문장에 붙은 조건·예외도 함께 전달한다. */
export function focusedRuleLines(rule: RuleNotes, question: string, lang: string): string[] {
  const lines = ruleLines(rule, lang);
  const focus = detectSpellFocus(question)?.focus;
  let primary: string[] = [];
  if (focus === "ticks") {
    // 룬 발동의 “첫 틱”과 피해가 반복되는 간격·횟수는 다른 사실이다.
    const measured = lines.filter((line, index) => [line, rule.notes[index]].some(text => TICK.test(text) && TICK_MEASURE.test(text)));
    if (measured.length) {
      const damage = PER_TICK_DAMAGE.test(question)
        ? lines.filter((line, index) => /\b(?:each|per)\s+tick\b.*\bdamage\b|틱(?:당|은).*피해|매\s*틱.*피해|每跳.*伤害/i.test(`${line} ${rule.notes[index]}`)) : [];
      primary = [...new Set([...damage, ...measured])];
    }
  }
  // “어떤 룬을 들어?” 같은 넓은 질문을 흔한 서술어 하나로 예외 규칙에 연결하지 않는다.
  const aspects = ASPECTS.filter(pattern => pattern.test(question));
  const related = lines.filter((line, index) => aspects.some(pattern => pattern.test(`${line} ${rule.notes[index]}`)));
  return [...new Set([...primary, ...related])];
}

/** 복사한 답문에서도 “이 효과”가 어느 개체를 가리키는지 남긴다. */
export function ruleAnswerText(rule: RuleNotes, highlighted: string[], lang: string): string {
  const text = (highlighted.length ? highlighted : ruleLines(rule, lang)).join("\n");
  const name = ruleName(rule, lang);
  return highlighted.length && !text.toLowerCase().includes(name.toLowerCase()) ? `${name}: ${text}` : text;
}
