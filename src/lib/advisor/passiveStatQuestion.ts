/** 구매한 능력치가 다른 능력치로 바뀌는 패시브의 조회. 전환 조건과 수치는 자료에서 읽는다. */
import type { SpellFact } from "@/lib/knowledge/facts";
import { splitSentences } from "./answerText";
import { asksScenarioAdvice, asksSkillHandling } from "./askWords";

const STATS = [
  /체력|\b(?:health|hp)\b|生命值/i,
  /공격력|\b(?:attack damage|ad)\b|攻击力/i,
  /주문력|\b(?:ability power|ap)\b|法术强度/i,
  /공속|공격\s*속도|attack speed|攻速|攻击速度/i,
  /치명타|crit(?:ical)?|暴击/i,
];
const CHANGE = /전환|변환|치환|환산|convert|instead|转化|转换|转为|替代/i;
const GAIN = /당.*(?:얻|증가)|(?:gain|grant).*(?:per|for every)|(?:per|for every).*(?:gain|grant)|每.*(?:获得|提供)/i;
const PURCHASE = /템|아이템|사면|사도|가면|가도|올리면|늘리면|구매|\b(?:items?|buy|build|purchase|gain|increase)\b|装备|购买|出|增加/i;

export function isPassiveStatQuestion(question: string): boolean {
  if (!STATS.some(stat => stat.test(question)) || !PURCHASE.test(question) && !CHANGE.test(question)) return false;
  return !asksScenarioAdvice(question) && !asksSkillHandling(question)
    && !/추천|뭐가\s*좋|최고|빌드|몇\s*코어|\b(?:recommend|best|which.*item)\b|推荐|出装/i.test(question);
}

export function passiveStatEvidence(spell: SpellFact, question: string): string[] {
  if (spell.slot !== "P" || !isPassiveStatQuestion(question)) return [];
  const asked = STATS.filter(stat => stat.test(question));
  const matches = (sentence: string) => asked.some(stat => stat.test(sentence))
    && STATS.filter(stat => stat.test(sentence)).length >= 2 && (CHANGE.test(sentence) || GAIN.test(sentence));
  // 요약의 “추가 최대 체력”과 조건을 보존한다. 본문의 회복·비축 계수는 전환 비율이 아니다.
  const summary = splitSentences(spell.summary ?? "").filter(matches);
  const text = splitSentences(spell.text);
  const relationship = summary.length ? summary : text.filter(matches);
  if (!relationship.length) return [];
  const conditions = splitSentences(spell.summary ?? "").filter(sentence => /이\s*효과|does not|do not|不.*(?:叠加|递归)/i.test(sentence));
  const rate = text.filter(sentence => /전환\s*비율|(?:at a|conversion)\s*rate|转化(?:比率|比例)/i.test(sentence));
  return [...new Set([...relationship, ...conditions, ...rate])]
    .map(sentence => sentence.replace(/^(?:또한[,，]?\s*|Additionally[,，]?\s*|此外[，,]?\s*)/i, ""));
}
