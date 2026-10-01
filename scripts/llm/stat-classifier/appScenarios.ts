import type { ChampionStatQuery, StatLevel } from "../../../src/lib/advisor/statQuery";
import type { Field } from "./seeds";
import type { Turn } from "./conversations";

function stat(field: Field, champions: string[], level: StatLevel = 1): ChampionStatQuery {
  return { kind: "championStat", champions, field, level };
}
export const appScenarios: Array<{ id: string; turns: Array<Turn & { textIncludes?: string; answerKind?: string }> }> = [
  { id: "new-champion", turns: [
    { question: "오공 문도 박사 18레벨 체력 비교", expected: stat("health", ["MonkeyKing", "DrMundo"], 18) },
    { question: "럭스 스킬 설명해줘", expected: null },
    { question: "기본 방어력은?", expected: stat("armor", ["Lux"]) },
    { question: "6레벨에서는?", expected: stat("armor", ["Lux"], 6) },
  ] },
  { id: "item-and-spell", turns: [
    { question: "오공 문도 박사 6레벨 마저 비교", expected: stat("magicResist", ["MonkeyKing", "DrMundo"], 6) },
    { question: "체력 물약 회복량은?", expected: null, answerKind: "item" },
    { question: "문도 박사 18레벨 체력 재생", expected: stat("healthRegen", ["DrMundo"], 18) },
    { question: "문도 R 회복량은?", expected: null, answerKind: "spell" },
  ] },
  { id: "unsupported-level", turns: [
    { question: "오공 문도 박사 2레벨 체력 비교", expected: null, textIncludes: "2레벨 능력치는 현재 자료에 없습니다" },
    { question: "오공 문도 박사 6레벨 방어력 비교", expected: stat("armor", ["MonkeyKing", "DrMundo"], 6) },
    { question: "2레벨에서는?", expected: null, textIncludes: "2레벨 능력치는 현재 자료에 없습니다" },
    { question: "18레벨에서는?", expected: stat("armor", ["MonkeyKing", "DrMundo"], 18) },
  ] },
  { id: "ordinary-words", turns: [
    { question: "아니 회복량", expected: null },
    { question: "오공 문도 박사 11레벨 체력 비교", expected: stat("health", ["MonkeyKing", "DrMundo"], 11) },
    { question: "마나 회복량은?", expected: null },
    { question: "오공만 18레벨 방어력", expected: stat("armor", ["MonkeyKing"], 18) },
  ] },
];
