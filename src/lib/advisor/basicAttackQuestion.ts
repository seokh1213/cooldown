/** 평타의 결과를 묻는 문형과 패시브 본문의 근거 문장. 챔피언별 답을 새로 만들지 않는다. */
import { splitSentences } from "./answerText";
import { asksScenarioAdvice, asksSkillHandling, asksWholeKit } from "./askWords";
import { detectSpellFocus } from "./spellFocus";
import type { SpellFact } from "@/lib/knowledge/facts";

const ATTACK = /평타|기본\s*공격|(?:두\s*번째|추가)\s*공격|\b(?:basic\s*attacks?|auto(?:[ -]*attacks?)?|second\s*(?:attack|shot))\b|普攻|普通攻击|第二(?:次攻击|发)/i;
const RESULT = /치면|치고|맞추|때리|쏘면|취소|어떻게\s*(?:돼|되)|뭐가|왜|추가|발동|중첩|빨라|느려|둔화|\b(?:what|happens?|why|cancel|once|twice|third|fourth|after)\b|会|取消|一下|两下|三下|四下|之后/i;
const ATTACK_TEXT = /기본\s*공격|총탄|총은|주먹|\b(?:basic\s*attacks?|auto[ -]?attacks?|shots?|punch(?:es)?)\b|普攻|普通攻击|拳|子弹|射击/i;
const CANCEL = /취소|cancel|取消/i;
const CONTINUATION = /^(?:두\s*번째|연속\s*공격|왼쪽\s*주먹|오른쪽\s*주먹|대상이\s*챔피언|이\s*(?:공격|표식)|the\s*(?:second|additional)|if\s*(?:the\s*)?(?:target|second)|each\s*shot|第二|若|如果|右拳|左拳)/i;
const ORDINALS: Array<[number, RegExp]> = [
  [1, /한\s*(?:대|번|발)|1\s*(?:대|번|발)|첫\s*(?:공격|발)|\bonce\b|\bfirst\b|一下|一次|第一/i],
  [2, /두\s*(?:대|번|발)|두\s*번째|2\s*(?:대|번|발|회)|\btwice\b|\bsecond\b|两下|两次|第二/i],
  [3, /세\s*(?:대|번|발)|세\s*번째|3\s*(?:대|번|발|회)|\bthird\b|\bthree\b|三下|三次|第三/i],
  [4, /네\s*(?:대|번|발)|네\s*번째|4\s*(?:대|번|발|회)|\bfourth\b|\bfour\b|四下|四次|第四/i],
];

export function isBasicAttackMechanicQuestion(question: string): boolean {
  if (!ATTACK.test(question) || asksWholeKit(question) || asksScenarioAdvice(question) || asksSkillHandling(question)) return false;
  if (/추천|좋(?:아|을|은)|나아|들어가|진입|\b(?:should|better|recommend|engage)\b|建议|推荐/i.test(question)) return false;
  const focus = detectSpellFocus(question)?.focus;
  if (focus && ["cooldown", "cost", "range", "ratio"].includes(focus)) return false;
  return RESULT.test(question) || ORDINALS.some(([, pattern]) => pattern.test(question));
}

/** 특정 효과를 따로 묻는 경우에도 조건·선행 공격 문장을 함께 남긴다. */
export function passiveAttackEvidence(spell: SpellFact, question: string): string[] {
  if (spell.slot !== "P" || !isBasicAttackMechanicQuestion(question)) return [];
  const sentences = splitSentences(spell.text);
  const first = sentences.findIndex(sentence => ATTACK_TEXT.test(sentence));
  if (first < 0) return [];
  const ordinal = ORDINALS.find(([, pattern]) => pattern.test(question));
  const exact = ordinal && ordinal[0] > 1 ? sentences.findIndex(sentence => ordinal[1].test(sentence)) : -1;
  const cancelled = CANCEL.test(question) ? sentences.findIndex(sentence => CANCEL.test(sentence)) : -1;
  const focus = detectSpellFocus(question);
  const focused = focus?.focus === "effect" ? sentences.findIndex(sentence => focus.keywords.some(word => sentence.toLowerCase().includes(word.toLowerCase()))) : -1;
  // 물은 효과가 본문에 없으면 다른 평타 효과를 대신 답하지 않는다.
  if (focus?.focus === "effect" && focused < 0) return [];
  let start = focused >= 0 ? focused : cancelled >= 0 ? cancelled : exact >= 0 ? exact : first;
  // “이 표식”, “두 번째 공격”만 떼면 그 조건을 잃는다.
  if (start > 0 && (CONTINUATION.test(sentences[start]) || /이\s*표식|the\s*mark|该印记/i.test(sentences[start]))) start--;
  const evidence = [sentences[start]];
  for (let index = start + 1; index < sentences.length; index++) {
    const sentence = sentences[index];
    if (!CONTINUATION.test(sentence)) break;
    evidence.push(sentence);
  }
  return evidence;
}
