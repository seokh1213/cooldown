/** 채점 기대값은 모델 프롬프트에 들어가지 않는다. 추가 12턴은 실행 전에 고정한 탐색 표본. */
import { cases as earlierCases } from "../passive-rag/cases";

export interface Case { id: string; group: string; question: string; split: "earlier" | "new"; checks: string[]; rejects?: string[] }
const checks: Record<string, string[]> = {
  a01: ["두 번째", "취소", "이동 속도"], a02: ["두 번째", "취소", "이동 속도"], a03: ["취소", "이동 속도"],
  a04: ["취소", "이동 속도"], a05: ["발동하지 않아"], a06: ["3번째", "챔피언"], a07: ["마법", "챔피언", "보호막"], a08: ["미니언에게는 보호막이 생기지 않아"],
  p01: ["추가 체력", "추가 공격력", "14"], p02: ["추가 체력", "추가 공격력"], p03: ["추가 체력", "추가 공격력"],
  p04: ["추가 체력", "추가 공격력"], p05: ["공격력 10"], p06: ["기본 체력", "전환되지 않아"], p07: ["최대 체력에 붙지 않고"], p08: ["14", "800%", "비축"],
  "d01-1": ["두 번째", "취소", "이동 속도"], "d01-2": ["발동하지 않아"], "d01-3": ["미니언에게는 보호막이 생기지 않아"],
  "d01-4": ["3번째", "챔피언", "보호막"], "d02-1": ["두 번째", "취소"], "d02-2": ["추가 체력", "추가 공격력"],
  "d02-3": ["공격력 10"], "d02-4": ["기본 체력", "전환되지 않아"], c01: ["확인할 수 없어"], c02: ["기절 효과가 없어"],
};
export const cases: Case[] = earlierCases.filter(item => !item.holdout || item.id.startsWith("c")).map(item => ({
  id: item.id, group: item.group, question: item.question, split: "earlier", checks: checks[item.id],
}));
cases.push(
  { id: "n01", group: "n01", split: "new", question: "파이크 추가체력 280짜리 사면 AD 몇이야?", checks: ["공격력 20"] },
  { id: "n02", group: "n02", split: "new", question: "파이크 성장 체력도 공격력으로 치환되나", checks: ["성장 체력", "전환되지 않아"] },
  { id: "n03", group: "n03", split: "new", question: "아크샨 두발 다 쏘는데 이속 버프도 있어?", checks: ["발동하지 않아"] },
  { id: "n04", group: "n04", split: "new", question: "아크샨 쉴드 쿨 남아 있는데 챔피언 세대 때리면?", checks: ["보호막 쿨이 남아", "생기지 않아", "마법"] },
  { id: "n05-1", group: "n05", split: "new", question: "파이크는 추가체력 140 받으면?", checks: ["공격력 10"] },
  { id: "n05-2", group: "n05", split: "new", question: "아니 280짜리면?", checks: ["공격력 20"] },
  { id: "n05-3", group: "n05", split: "new", question: "아크샨 두번째 공격을 취소하면?", checks: ["취소", "이동 속도"], rejects: ["공격력 20"] },
  { id: "n06-1", group: "n06", split: "new", question: "아크샨 미니언한테 세번 치면 실드 생김?", checks: ["미니언에게는 보호막이 생기지 않아"] },
  { id: "n06-2", group: "n06", split: "new", question: "그럼 상대 챔피언이면", checks: ["3번째", "챔피언", "보호막"] },
  { id: "n06-3", group: "n06", split: "new", question: "한대만 치는 상황이면?", checks: ["1번", "충족하지 않아", "3번째"] },
  { id: "n07", group: "n07", split: "new", question: "파이크 적한테 보이는 동안에도 비축한 체력이 회복돼?", checks: ["적에게 보이는 동안", "충족하지 않아"] },
  { id: "n08", group: "n08", split: "new", question: "아크샨이랑 파이크 패시브 둘 다 설명해줘", checks: ["한 챔피언"], rejects: ["공격력 10"] },
);
export function grade(text: string, item: Case): { pass: boolean; missing: string[]; forbidden: string[] } {
  const equivalents: Record<string, RegExp> = {
    "두 번째": /두\s*번째|추가\s*공격/,
    "발동하지 않아": /발동하지\s*않|취소 조건에 해당하지\s*않/,
    "3번째": /3번째|세\s*번째|3회\s*적중/,
    "1번": /1번|1회\s*적중/,
    "기본 체력": /기본(?:·성장)?\s*체력/,
    "전환되지 않아": /(?:전환|포함)(?:되지|하지)?\s*않/,
    "최대 체력에 붙지 않고": /최대 체력에 붙지 않고|전환 시 추가 최대 체력 증가를 대체/,
    "미니언에게는 보호막이 생기지 않아": /미니언에게는 보호막이 생기지\s*않|미니언은.*챔피언 대상 조건에 해당하지\s*않/,
    "보호막 쿨이 남아": /보호막 (?:쿨|재사용 대기시간)(?:이)?\s*남아/,
    "생기지 않아": /생기지\s*않|사용 가능 조건에 해당하지\s*않/,
    "충족하지 않아": /충족하지\s*않|조건에 해당하지\s*않/,
    "적에게 보이는 동안": /적에게 보이는 동안|보이는 상태/,
  };
  const missing = item.checks.filter(check => /^\d+(?:\.\d+)?$/.test(check)
    ? !new RegExp(`(?<![\\d.])${check.replace(/\./g, "\\.")}(?![\\d.])`).test(text)
    : equivalents[check] ? !equivalents[check].test(text) : !text.includes(check));
  const forbidden = (item.rejects ?? []).filter(check => text.includes(check));
  return { pass: !missing.length && !forbidden.length, missing, forbidden };
}
