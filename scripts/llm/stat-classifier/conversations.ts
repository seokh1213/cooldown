import type { ChampionStatQuery, StatLevel } from "../../../src/lib/advisor/statQuery";
import type { Field } from "./seeds";

function stat(field: Field, level: StatLevel = 1, champions = ["MonkeyKing", "DrMundo"]): ChampionStatQuery {
  return { kind: "championStat", champions, field, level };
}
export interface Turn { question: string; expected: ChampionStatQuery | null }
export const conversations: Array<{ id: string; turns: Turn[] }> = [
  { id: "user-report", turns: [
    { question: "오공랑 문도 박사 중 1레벨 체력 누가 더 높아?", expected: stat("health") },
    { question: "체력회복량은 둘다 어떻게되지?", expected: stat("healthRegen") },
    { question: "아니아니 회복량", expected: stat("healthRegen") },
    { question: "18레벨에서는?", expected: stat("healthRegen", 18) },
    { question: "그럼 공걱속도는?", expected: stat("attackSpeed", 18) },
    { question: "문도만 보여줘", expected: stat("attackSpeed", 18, ["DrMundo"]) },
  ] },
  { id: "level-and-target", turns: [
    { question: "오공 문도 박사 6레벨 방어력 비교", expected: stat("armor", 6) },
    { question: "이동속두는?", expected: stat("moveSpeed", 6) },
    { question: "18레벨은?", expected: stat("moveSpeed", 18) },
    { question: "오공만 보여줘", expected: stat("moveSpeed", 18, ["MonkeyKing"]) },
    { question: "마법 저항럭은?", expected: stat("magicResist", 18, ["MonkeyKing"]) },
  ] },
  { id: "spell-vs-stat", turns: [
    { question: "문도 박사 11레벨 체력 재생", expected: stat("healthRegen", 11, ["DrMundo"]) },
    { question: "문도 R 체력 회복량은?", expected: null },
    { question: "회복량 알려줘", expected: null },
    { question: "기본 스탯의 체력 재생을 말한 거야", expected: stat("healthRegen", 1, ["DrMundo"]) },
    { question: "18레벨에서는?", expected: stat("healthRegen", 18, ["DrMundo"]) },
  ] },
  { id: "name-typo", turns: [
    { question: "오공랑 재이스 중 1레벨 체럭 비교", expected: stat("health", 1, ["MonkeyKing", "Jayce"]) },
    { question: "둘 마저는?", expected: stat("magicResist", 1, ["MonkeyKing", "Jayce"]) },
    { question: "18레벨은?", expected: stat("magicResist", 18, ["MonkeyKing", "Jayce"]) },
    { question: "제이스만 보여줘", expected: stat("magicResist", 18, ["Jayce"]) },
  ] },
  { id: "stat-correction", turns: [
    { question: "아리 럭스 체력 비교", expected: stat("health", 1, ["Ahri", "Lux"]) },
    { question: "체력 말고 회복량", expected: stat("healthRegen", 1, ["Ahri", "Lux"]) },
    { question: "체력 물약 회복량은?", expected: null },
    { question: "그럼 기본 방어력은?", expected: stat("armor", 1, ["Ahri", "Lux"]) },
  ] },
  { id: "ten-champions", turns: [
    { question: "오공 문도 박사 아리 제드 럭스 가렌 다리우스 조이 벡스 제이스 체력 재생 비교", expected: stat("healthRegen", 1, ["MonkeyKing", "DrMundo", "Ahri", "Zed", "Lux", "Garen", "Darius", "Zoe", "Vex", "Jayce"]) },
    { question: "18레벨에서는?", expected: stat("healthRegen", 18, ["MonkeyKing", "DrMundo", "Ahri", "Zed", "Lux", "Garen", "Darius", "Zoe", "Vex", "Jayce"]) },
    { question: "공격속두는?", expected: stat("attackSpeed", 18, ["MonkeyKing", "DrMundo", "Ahri", "Zed", "Lux", "Garen", "Darius", "Zoe", "Vex", "Jayce"]) },
    { question: "문도만", expected: stat("attackSpeed", 18, ["DrMundo"]) },
  ] },
  { id: "english", turns: [
    { question: "Wukong and Dr. Mundo health at level 11", expected: stat("health", 11) },
    { question: "both health regneration please", expected: stat("healthRegen", 11) },
    { question: "level 18?", expected: stat("healthRegen", 18) },
    { question: "Dr. Mundo only", expected: stat("healthRegen", 18, ["DrMundo"]) },
  ] },
  { id: "chinese", turns: [
    { question: "孙悟空 蒙多医生 6级生命值比较", expected: stat("health", 6) },
    { question: "两个的生命回复是多少？", expected: stat("healthRegen", 6) },
    { question: "18级呢？", expected: stat("healthRegen", 18) },
    { question: "只看蒙多医生", expected: stat("healthRegen", 18, ["DrMundo"]) },
  ] },
];
