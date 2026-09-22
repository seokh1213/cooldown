/**
 * 컴파일된 스킬 계산식을 숫자로 풀어 본다 — **시험 전용**
 *
 * `compileAbilitySimulation` 이 낳은 식이 맞는지 확인하려면 값을 넣어 풀어 봐야 한다.
 * 그 일을 하던 코드가 시뮬레이션 화면 안에 있었는데, 화면을 걷어내면서 식이 맞는지
 * 보던 단언 스물아홉 건이 함께 죽을 참이었다.
 *
 * 컴파일러가 낳는 `ability.simulation` 은 그대로 배포되고 VS 화면의 스킬 상세가
 * 그 항들을 보여 준다. 그러니 이 검사는 살아 있어야 한다. 화면이 아니라 **컴파일러
 * 옆**이 제 자리라서 이리로 옮겼다.
 *
 * 묶음에 실리지 않는다. 화면 코드가 이것을 부르지 않는다.
 */
import type {
  AbilitySimulation,
  AbilitySimulationCalculation,
  AbilitySimulationExpr,
  AbilitySimulationExpression,
  AbilitySimulationStat,
} from "../../src/data/contracts/championData";
import { evaluateExpr } from "../../src/lib/abilitySimulationExpr";

export interface SimpleStats {
  level: number;
  health: number;
  bonusHealth: number;
  mana: number;
  bonusMana: number;
  armor: number;
  bonusArmor: number;
  magicResist: number;
  bonusMagicResist: number;
  attackDamage: number;
  baseAttackDamage: number;
  bonusAttackDamage: number;
  abilityPower: number;
  attackSpeed: number;
  bonusAttackSpeed: number;
  movespeed: number;
  critChance: number;
  critDamage: number;
  bonusCritDamage: number;
  lifeSteal: number;
  lethality: number;
  armorPenFlat: number;
  armorPenPercent: number;
  magicPenFlat: number;
  magicPenPercent: number;
}

export interface SkillSummary {
  id: string;
  name?: string;
  maxrank: number;
  cooldowns: (number | string)[];
  cooldownsWithAbilityHaste: number[];
}

export type DamageType = AbilitySimulationCalculation["damageType"];

export interface AbilitySimulationTermResult {
  stat: AbilitySimulationStat;
  coefficient: number;
  statValue: number;
  contribution: number;
}

export interface AbilitySimulationResult {
  total: number;
  base: number;
  terms: AbilitySimulationTermResult[];
  targetHealthMultiplier?: number;
  /** 선형으로 못 나눈 스킬. 있으면 base/terms 대신 이 공식을 표시한다. */
  expression?: AbilitySimulationExpr;
}

function simulationStatValue(stat: AbilitySimulationStat, stats: SimpleStats): number {
  const values: Record<AbilitySimulationStat, number> = {
    abilityPower: stats.abilityPower,
    totalAttackDamage: stats.attackDamage,
    baseAttackDamage: stats.baseAttackDamage,
    bonusAttackDamage: stats.bonusAttackDamage,
    maxHealth: stats.health,
    bonusHealth: stats.bonusHealth,
    armor: stats.armor,
    bonusArmor: stats.bonusArmor,
    magicResist: stats.magicResist,
    bonusMagicResist: stats.bonusMagicResist,
    maxMana: stats.mana,
    bonusMana: stats.bonusMana,
    attackSpeed: stats.attackSpeed,
    bonusAttackSpeed: stats.bonusAttackSpeed,
    moveSpeed: stats.movespeed,
    critChance: stats.critChance,
    critDamage: stats.critDamage,
    bonusCritDamage: stats.bonusCritDamage,
    lifeSteal: stats.lifeSteal,
    lethality: stats.lethality,
  };
  return values[stat];
}

/** 대상 체력 비례 스킬은 마지막에 체력값을 곱한다. 선형 경로와 같은 규칙이다. */
function targetHealthMultiplierFor(
  scaling: "max" | "current" | "missing" | undefined,
  target: { currentHealth: number; maxHealth: number } | undefined,
): number | null | undefined {
  if (!scaling) return undefined;
  if (!target) return null;
  if (scaling === "max") return target.maxHealth;
  if (scaling === "current") return target.currentHealth;
  return Math.max(target.maxHealth - target.currentHealth, 0);
}

function evaluateExpressionDetails(
  expression: AbilitySimulationExpression,
  abilityRank: number,
  stats: SimpleStats,
  target?: { currentHealth: number; maxHealth: number },
): AbilitySimulationResult | null {
  // 중첩 수를 모르는 채로 0 을 넣으면 조용히 틀린 값이 나온다. 값을 내지 않는 편이 옳다.
  if (expression.requiresBuffStacks) return null;
  // 공식을 스탯 항으로 쪼갤 수 없으므로 terms 는 비고, base 에는 대상 배수 이전 값을 담는다.
  const base = evaluateExpr(expression.root, {
    rank: abilityRank,
    level: stats.level,
    stat: (stat) => simulationStatValue(stat, stats),
  });
  if (!Number.isFinite(base)) return null;
  const multiplier = targetHealthMultiplierFor(expression.targetHealthScaling, target);
  if (multiplier === null) return null;
  const total = multiplier === undefined ? base : base * multiplier;
  return Number.isFinite(total)
    ? { total, base, terms: [], targetHealthMultiplier: multiplier, expression: expression.root }
    : null;
}

export function evaluateAbilitySimulation(
  simulation: AbilitySimulation | undefined,
  abilityRank: number,
  stats: SimpleStats,
  target?: { currentHealth: number; maxHealth: number },
): number | null {
  return evaluateAbilitySimulationDetails(
    simulation,
    abilityRank,
    stats,
    target,
  )?.total ?? null;
}

export function evaluateAbilitySimulationDetails(
  simulation: AbilitySimulation | undefined,
  abilityRank: number,
  stats: SimpleStats,
  target?: { currentHealth: number; maxHealth: number },
): AbilitySimulationResult | null {
  if (simulation?.status === "expression" && simulation.expression) {
    return evaluateExpressionDetails(simulation.expression, abilityRank, stats, target);
  }
  if (simulation?.status !== "complete" || !simulation.primary) return null;
  const rankIndex = Math.max(Math.trunc(abilityRank) - 1, 0);
  const levelIndex = Math.min(Math.max(Math.trunc(stats.level) - 1, 0), 17);
  const valueAt = (
    byRank: number[] | undefined,
    byLevel: number[] | undefined,
    byRankAndLevel: number[][] | undefined,
  ): number => {
    if (byRankAndLevel) {
      const rank = Math.min(rankIndex, byRankAndLevel.length - 1);
      return byRankAndLevel[rank]?.[levelIndex];
    }
    if (byLevel) return byLevel[levelIndex];
    if (byRank) return byRank[Math.min(rankIndex, byRank.length - 1)];
    return Number.NaN;
  };
  const primary = simulation.primary;
  const base = valueAt(
    primary.baseByRank,
    primary.baseByLevel,
    primary.baseByRankAndLevel,
  );
  if (!Number.isFinite(base)) return null;
  let total = base;
  const terms: AbilitySimulationTermResult[] = [];
  for (const term of simulation.primary.terms) {
    const coefficient = valueAt(
      term.coefficientsByRank,
      term.coefficientsByLevel,
      term.coefficientsByRankAndLevel,
    );
    if (!Number.isFinite(coefficient)) return null;
    const statValue = simulationStatValue(term.stat, stats);
    const contribution = coefficient * statValue;
    terms.push({ stat: term.stat, coefficient, statValue, contribution });
    total += contribution;
  }
  const healthScaling = simulation.primary.targetHealthScaling;
  let targetHealthMultiplier: number | undefined;
  if (healthScaling) {
    if (!target) return null;
    targetHealthMultiplier = healthScaling === "max"
      ? target.maxHealth
      : healthScaling === "current"
        ? target.currentHealth
        : Math.max(target.maxHealth - target.currentHealth, 0);
    total *= targetHealthMultiplier;
  }
  return Number.isFinite(total)
    ? { total, base, terms, targetHealthMultiplier }
    : null;
}
