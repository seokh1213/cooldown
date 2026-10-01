/** 능력치 질문의 어휘와 조회 계약. 모델도 수치 대신 이 계약을 출력할 수 있다. */
import type { StatName } from "@/lib/knowledge/facts";
import type { AdvisorAnswer } from "./answer";

export type StatLevel = 1 | 6 | 11 | 18;
export interface ChampionStatQuery {
  kind: "championStat";
  champions: string[];
  field: StatName;
  level: StatLevel;
}

const STAT_LEXICON: Array<[StatName, RegExp]> = [
  ["healthRegen", /체력\s*(?:재생|회복)|체젠|(?:health|hp)\s*(?:regen(?:eration)?|recovery)|\bhp5\b|生命(?:值)?(?:回复|恢复)|回血/i],
  ["magicResist", /마법\s*저항|마저|마방|magic\s*resist(?:ance)?|\bmr\b|魔抗|魔法抗性/i],
  ["attackSpeed", /공격\s*속도|공속|attack\s*speed|\bas\b|攻(?:击)?速(?:度)?/i],
  ["moveSpeed", /이동\s*속도|이속|무빙|빨라|빠르|빠른|move(?:ment)?\s*speed|\bms\b|\bfaster\b|移动速度|移速|更快/i],
  ["attackDamage", /공격력|깡뎀|\bad\b|attack\s*damage|攻击力/i],
  ["armor", /방어력|방어|아머|\barmou?r\b|护甲/i],
  ["health", /체력|피통|단단|튼튼|탱키|\bhp\b|\bhealth\b|\btank(?:y|ier)\b|生命值|更肉|坦/i],
];

export function detectStat(question: string): StatName | undefined {
  // 체력 재생처럼 긴 이름을 체력보다 먼저 찾는다.
  return STAT_LEXICON.find(([, pattern]) => pattern.test(question))?.[0];
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
  const hit = answer.rows.find(row => row.hit);
  const field = hit && detectStat(hit.label);
  return field ? { kind: "championStat", champions: answer.cards.map(card => card.id), field, level: answer.level ?? 1 } : undefined;
}
