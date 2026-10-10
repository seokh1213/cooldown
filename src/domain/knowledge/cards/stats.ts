import { statGrowth } from "../../game/levels/championLevel";
import type { StatGrade, StatName } from "./contracts";
import type { LevelScaledScalar } from "../../game/types/combatNormalized";
import { round } from "../text/text";
import type { ChampionRecord } from "./sourceRecords";

/** LoL 성장 공식: base + growth × (L−1) × (0.7025 + 0.0175 × (L−1)) */
export function statAtLevel(scalar: LevelScaledScalar, level: number): number {
  if (scalar.valuesByLevel && scalar.valuesByLevel[level - 1] !== undefined) {
    return scalar.valuesByLevel[level - 1];
  }
  return scalar.base + statGrowth(scalar.perLevel, level);
}

/** 공격 속도는 base × (1 + growth%/100 × 성장계수) */
function attackSpeedAtLevel(scalar: LevelScaledScalar, level: number): number {
  return scalar.base * (1 + statGrowth(scalar.perLevel / 100, level));
}

export const STAT_NAMES: StatName[] = [
  "health",
  "armor",
  "magicResist",
  "attackDamage",
  "attackSpeed",
  "moveSpeed",
  "healthRegen",
];

export function valueOf(champ: ChampionRecord, stat: StatName, level: number): number {
  const scalar = champ.baseStats[stat];
  if (stat === "attackSpeed") return attackSpeedAtLevel(scalar, level);
  return statAtLevel(scalar, level);
}

export function toGrade(percentile: number): StatGrade {
  if (percentile < 15) return "매우 낮음";
  if (percentile < 35) return "낮음";
  if (percentile < 65) return "보통";
  if (percentile < 85) return "높음";
  return "매우 높음";
}

/** 값 배열 안에서 value 의 백분위(0~100) */
export function percentileOf(value: number, all: number[]): number {
  if (all.length <= 1) return 50;
  const lower = all.filter((v) => v < value).length;
  const equal = all.filter((v) => v === value).length;
  // 동률은 중앙값 처리
  return round(((lower + (equal - 1) / 2) / (all.length - 1)) * 100, 1);
}
