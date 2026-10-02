/** 능력치 질문의 어휘와 조회 계약. 모델도 수치 대신 이 계약을 출력할 수 있다. */
import type { StatName } from "@/lib/knowledge/facts";
import type { AdvisorAnswer } from "./answer";

export type StatLevel = 1 | 6 | 11 | 18;
export const STAT_QUERY_TERMS: Record<StatName, string> = {
  health: "체력", healthRegen: "체력 재생", armor: "방어력", magicResist: "마법 저항력",
  attackDamage: "공격력", attackSpeed: "공격 속도", moveSpeed: "이동 속도",
};
export interface ChampionStatQuery {
  kind: "championStat";
  champions: string[];
  field: StatName;
  /** 요청 순서. 단일 항목과 과거 기록은 field만 사용한다. */
  fields?: StatName[];
  level: StatLevel;
}

const STAT_LEXICON: Array<[StatName, RegExp]> = [
  ["healthRegen", /체력\s*(?:재생|회복)|체젠|(?:health|hp)\s*(?:regen(?:eration)?|recovery)|\bhp5\b|生命(?:值)?(?:回复|恢复)|回血/i],
  ["magicResist", /마법\s*저항|마저|마방|magic\s*resist(?:ance)?|\bmr\b|魔抗|魔法抗性/i],
  ["attackSpeed", /공격\s*속도|공속|attack\s*speed|\bas\b|攻(?:击)?速(?:度)?/i],
  ["moveSpeed", /이동\s*속도|이속|무빙|빨라|빠르|빠른|move(?:ment)?\s*speed|\bms\b|\bfaster\b|移动速度|移速|更快/i],
  ["attackDamage", /공격력|깡공|깡뎀|\bad\b|attack\s*damage|攻击力/i],
  ["armor", /방어력|방어|아머|\barmou?r\b|护甲/i],
  ["health", /체력|피통|단단|튼튼|탱키|\bhp\b|\bhealth\b|\btank(?:y|ier)\b|生命值|更肉|坦/i],
];

export function detectStat(question: string): StatName | undefined {
  // 체력 재생처럼 긴 이름을 체력보다 먼저 찾는다.
  return STAT_LEXICON.find(([, pattern]) => pattern.test(question))?.[0];
}

/** 긴 어휘가 덮는 짧은 어휘만 제외한다. 별도로 물은 체력은 체젠과 함께 남긴다. */
export function detectStats(question: string): StatName[] {
  const matches = STAT_LEXICON.flatMap(([field, pattern]) => [...question.matchAll(new RegExp(pattern.source, "gi"))]
    .filter(match => !(field === "attackSpeed" && match.index === 0 && /^as\b.*\b(?:against|into)\b/i.test(question)))
    .map(match => ({ field, index: match.index, end: match.index + match[0].length })));
  const distinct = matches.filter(match => !/^(?:은|는|이|가|을|를|도)?\s*(?:말고|제외|빼고)/i.test(question.slice(match.end))
    && !matches.some(other => other !== match && other.index <= match.index && other.end >= match.end
      && other.end - other.index > match.end - match.index));
  return [...new Set(distinct.sort((a, b) => a.index - b.index).map(match => match.field))];
}

export function statFields(query: ChampionStatQuery): StatName[] {
  return query.fields?.length ? query.fields : [query.field];
}

export function validStatFields(query: ChampionStatQuery): boolean {
  const fields = statFields(query);
  return fields[0] === query.field && new Set(fields).size === fields.length
    && fields.every(field => Object.prototype.hasOwnProperty.call(STAT_QUERY_TERMS, field));
}

/** 레벨 생략과 미지원 레벨을 구별한다. 기본 레벨을 조용히 대신 넣지 않는다. */
export function explicitStatLevel(question: string): number | undefined {
  if (/만렙|풀\s*레벨|후반|max\s*level|full\s*build|满级/i.test(question)) return 18;
  const match = /(\d+)\s*(?:레벨|렙|level|lv\.?|급|级)|(?:level|lv\.?)\s*(\d+)/i.exec(question);
  return match ? Number(match[1] ?? match[2]) : undefined;
}

export function isStatLevel(level: number): level is StatLevel {
  return [1, 6, 11, 18].includes(level);
}

export function detectLevel(question: string): StatLevel {
  const level = explicitStatLevel(question);
  return level !== undefined && isStatLevel(level) ? level : 1;
}

/** 기존 대화 카드도 강조된 능력치 행에서 조회 조건을 복원한다. */
export function statQueryFromAnswer(answer: AdvisorAnswer): ChampionStatQuery | undefined {
  if (answer.kind === "champion") return answer.statQuery;
  if (answer.kind !== "compare" || answer.matchup || answer.slot) return undefined;
  if (answer.statQuery) return answer.statQuery;
  const fields = answer.rows.filter(row => row.hit).flatMap(row => detectStats(row.label));
  return fields.length ? { kind: "championStat", champions: answer.cards.map(card => card.id), field: fields[0],
    ...(fields.length > 1 ? { fields } : {}), level: answer.level ?? 1 } : undefined;
}
