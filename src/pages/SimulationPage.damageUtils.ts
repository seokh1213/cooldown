import type {
  AbilitySimulation,
  AbilitySimulationCalculation,
  AbilitySimulationStat,
} from "@/data/contracts/championData";
import type { Champion, ChampionSpell } from "@/types";
import type { NormalizedItem } from "@/types/combatNormalized";
import { StatKey } from "@/types/combatStats";

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
}

export function resistanceMultiplier(resistance: number): number {
  return resistance >= 0
    ? 100 / (100 + resistance)
    : 2 - 100 / (100 - resistance);
}

/**
 * 실질 체력 = 체력 × (1 + 저항력 / 100)
 *
 * 감쇄식을 체력 쪽에서 뒤집어 쓴 값이다. 방어 아이템과 체력 아이템 중
 * 어느 쪽이 더 버티는지 견줄 때 이 숫자를 본다.
 */
export function effectiveHealth(health: number, resistance: number): number {
  return health / resistanceMultiplier(resistance);
}

/** 저항력에 걸리는 감소·관통 (백과사전 "저항력 감소와 관통" 항목과 같은 규칙) */
export interface ResistanceModifiers {
  /** ① 고정 감소 — 합연산, 저항력을 음수까지 내릴 수 있다 */
  flatReduction?: number;
  /** ② 비율 감소 — 곱연산 (0 ~ 1) */
  percentReduction?: number;
  /** ③ 비율 관통 — 곱연산 (0 ~ 1) */
  percentPenetration?: number;
  /** ④ 고정 관통 — 합연산, 0 밑으로는 내리지 못한다 */
  flatPenetration?: number;
}

/**
 * 적용 저항력 = (저항력 − 고정 감소) × (1 − 감소%) × (1 − 관통%) − 고정 관통
 *
 * 네 단계는 순서가 정해져 있고 각 단계마다 제약이 다르다.
 * - 비율 감소와 비율 관통은 저항력이 0 이하면 건너뛴다
 * - 고정 관통은 저항력을 0 밑으로 내리지 못한다
 * - 저항력을 음수로 만들 수 있는 건 고정 감소뿐이다
 *
 * 마지막 제약을 빼먹으면 방어력이 낮은 대상에게 관통을 들었을 때
 * 음수 방어력 구간으로 넘어가 실제로는 없는 추가 피해가 붙는다.
 */
export function effectiveResistance(
  resistance: number,
  modifiers: ResistanceModifiers = {},
): number {
  const afterFlatReduction = resistance - (modifiers.flatReduction ?? 0);
  if (afterFlatReduction <= 0) return afterFlatReduction;

  const afterPercent =
    afterFlatReduction *
    (1 - (modifiers.percentReduction ?? 0)) *
    (1 - (modifiers.percentPenetration ?? 0));

  return Math.max(0, afterPercent - (modifiers.flatPenetration ?? 0));
}

export function applyDamageMitigation(
  rawDamage: number,
  damageType: DamageType,
  target: { armor: number; magicResist: number; damageReductionPercent: number },
  attacker?: Pick<SimpleStats, "lethality" | "armorPenFlat" | "armorPenPercent" | "magicPenFlat" | "magicPenPercent">,
): number | null {
  if (!Number.isFinite(rawDamage) || rawDamage < 0 || damageType === "unknown") {
    return null;
  }
  if (damageType === "true") return rawDamage;
  const resistance = damageType === "physical"
    ? effectiveResistance(target.armor, {
        percentPenetration: attacker?.armorPenPercent ?? 0,
        // V14.1 부터 물리 관통력(치명적 일격)은 고정 방어구 관통과 1:1 이라
        // 둘을 더해 한 값으로 쓴다
        flatPenetration:
          (attacker?.armorPenFlat ?? 0) + (attacker?.lethality ?? 0),
      })
    : effectiveResistance(target.magicResist, {
        percentPenetration: attacker?.magicPenPercent ?? 0,
        flatPenetration: attacker?.magicPenFlat ?? 0,
      });
  const reduction = Math.min(Math.max(target.damageReductionPercent, 0), 100) / 100;
  return rawDamage * resistanceMultiplier(resistance) * (1 - reduction);
}

export function computeChampionStatsAtLevel(
  champion: Champion,
  level: number
): SimpleStats | null {
  if (!champion.stats) return null;
  const stats = champion.stats;
  const boundedLevel = Math.min(Math.max(level, 1), 18);
  const levelsGained = boundedLevel - 1;
  const factor = levelsGained * (0.7025 + 0.0175 * levelsGained);
  const attackDamage =
    (stats.attackdamage ?? 0) + (stats.attackdamageperlevel ?? 0) * factor;
  const bonusAttackSpeed = ((stats.attackspeedperlevel ?? 0) * factor) / 100;
  return {
    level: boundedLevel,
    health: (stats.hp ?? 0) + (stats.hpperlevel ?? 0) * factor,
    bonusHealth: 0,
    mana: (stats.mp ?? 0) + (stats.mpperlevel ?? 0) * factor,
    bonusMana: 0,
    armor: (stats.armor ?? 0) + (stats.armorperlevel ?? 0) * factor,
    bonusArmor: 0,
    magicResist:
      (stats.spellblock ?? 0) + (stats.spellblockperlevel ?? 0) * factor,
    bonusMagicResist: 0,
    attackDamage,
    baseAttackDamage: attackDamage,
    bonusAttackDamage: 0,
    abilityPower: 0,
    attackSpeed: (stats.attackspeed ?? 0) * (1 + bonusAttackSpeed),
    bonusAttackSpeed,
    movespeed: stats.movespeed ?? 0,
    critChance: 0,
    critDamage: 1.75,
    bonusCritDamage: 0,
    lifeSteal: 0,
    lethality: 0,
    armorPenFlat: 0,
    armorPenPercent: 0,
    magicPenFlat: 0,
    magicPenPercent: 0,
  };
}

function applyPercentStat(stats: SimpleStats, key: StatKey, value: number): void {
  const multiplier = 1 + value;
  if (key === StatKey.MAX_HEALTH) stats.health *= multiplier;
  else if (key === StatKey.MAX_MANA) stats.mana *= multiplier;
  else if (key === StatKey.ARMOR) stats.armor *= multiplier;
  else if (key === StatKey.MAGIC_RESIST) stats.magicResist *= multiplier;
  else if (key === StatKey.MOVE_SPEED) stats.movespeed *= multiplier;
  else if (key === StatKey.ATTACK_DAMAGE) stats.attackDamage *= multiplier;
  else if (key === StatKey.ABILITY_POWER) stats.abilityPower *= multiplier;
  else if (key === StatKey.ATTACK_SPEED) {
    stats.attackSpeed *= multiplier;
    stats.bonusAttackSpeed += value;
  }
  else if (key === StatKey.CRIT_CHANCE) stats.critChance += value;
  else if (key === StatKey.CRIT_DAMAGE) {
    stats.critDamage += value;
    stats.bonusCritDamage += value;
  }
  else if (key === StatKey.LIFE_STEAL) stats.lifeSteal += value;
}

function applyFlatStat(stats: SimpleStats, key: StatKey, value: number): void {
  if (key === StatKey.MAX_HEALTH) stats.health += value;
  else if (key === StatKey.MAX_MANA) stats.mana += value;
  else if (key === StatKey.ARMOR) stats.armor += value;
  else if (key === StatKey.MAGIC_RESIST) stats.magicResist += value;
  else if (key === StatKey.ATTACK_DAMAGE) stats.attackDamage += value;
  else if (key === StatKey.ABILITY_POWER) stats.abilityPower += value;
  else if (key === StatKey.MOVE_SPEED) stats.movespeed += value;
  else if (key === StatKey.LETHALITY) stats.lethality += value;
  else if (key === StatKey.ARMOR_PEN_FLAT) stats.armorPenFlat += value;
  else if (key === StatKey.MAGIC_PEN_FLAT) stats.magicPenFlat += value;
}

export function applyNormalizedItemsToStats(
  base: SimpleStats,
  items: NormalizedItem[]
): SimpleStats {
  const result = { ...base };
  const percentStats = new Map<StatKey, number>();
  for (const item of items) {
    for (const contribution of item.stats) {
      if (contribution.valueType === "percent") {
        percentStats.set(
          contribution.stat,
          (percentStats.get(contribution.stat) ?? 0) + contribution.value,
        );
      } else {
        applyFlatStat(result, contribution.stat, contribution.value);
      }
    }
  }
  for (const [stat, value] of percentStats) {
    if (stat === StatKey.ATTACK_SPEED) {
      const baseAttackSpeed = base.attackSpeed / (1 + base.bonusAttackSpeed);
      result.bonusAttackSpeed += value;
      result.attackSpeed = Math.min(baseAttackSpeed * (1 + result.bonusAttackSpeed), 2.5);
    } else if (stat === StatKey.ARMOR_PEN_PERCENT) {
      result.armorPenPercent = 1 - (1 - result.armorPenPercent) * (1 - value);
    } else if (stat === StatKey.MAGIC_PEN_PERCENT) {
      result.magicPenPercent = 1 - (1 - result.magicPenPercent) * (1 - value);
    } else {
      applyPercentStat(result, stat, value);
    }
  }
  result.bonusHealth = result.health - base.health;
  result.bonusMana = result.mana - base.mana;
  result.bonusArmor = result.armor - base.armor;
  result.bonusMagicResist = result.magicResist - base.magicResist;
  result.bonusAttackDamage = result.attackDamage - base.attackDamage;
  return result;
}

export function computeAbilityHasteFromNormalizedItems(
  items: NormalizedItem[]
): number {
  return items.reduce(
    (total, item) =>
      total + item.stats.reduce(
        (itemTotal, contribution) =>
          contribution.stat === StatKey.ABILITY_HASTE &&
          contribution.valueType === "flat"
            ? itemTotal + contribution.value
            : itemTotal,
        0
      ),
    0
  );
}

export function computeSkillSummaries(
  champion: Champion,
  abilityHaste: number
): SkillSummary[] {
  if (!champion.spells) return [];
  const hasteFactor = 1 + Math.max(abilityHaste, 0) / 100;
  return champion.spells.map((spell: ChampionSpell) => {
    const cooldowns = spell.cooldown ?? [];
    return {
      id: spell.id,
      name: spell.name,
      maxrank: spell.maxrank,
      cooldowns,
      cooldownsWithAbilityHaste: cooldowns.map((cooldown) =>
        typeof cooldown === "number" ? cooldown / hasteFactor : Number(cooldown)
      ),
    };
  });
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
