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
  movespeed: number;
}

export interface SkillSummary {
  id: string;
  name?: string;
  maxrank: number;
  cooldowns: (number | string)[];
  cooldownsWithAbilityHaste: number[];
}

export type DamageType = AbilitySimulationCalculation["damageType"];

export function resistanceMultiplier(resistance: number): number {
  return resistance >= 0
    ? 100 / (100 + resistance)
    : 2 - 100 / (100 - resistance);
}

export function applyDamageMitigation(
  rawDamage: number,
  damageType: DamageType,
  target: { armor: number; magicResist: number; damageReductionPercent: number },
): number | null {
  if (!Number.isFinite(rawDamage) || rawDamage < 0 || damageType === "unknown") {
    return null;
  }
  if (damageType === "true") return rawDamage;
  const resistance = damageType === "physical" ? target.armor : target.magicResist;
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
    attackSpeed:
      (stats.attackspeed ?? 0) *
      (1 + ((stats.attackspeedperlevel ?? 0) * factor) / 100),
    movespeed: stats.movespeed ?? 0,
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
  else if (key === StatKey.ATTACK_SPEED) stats.attackSpeed *= multiplier;
}

function applyFlatStat(stats: SimpleStats, key: StatKey, value: number): void {
  if (key === StatKey.MAX_HEALTH) stats.health += value;
  else if (key === StatKey.MAX_MANA) stats.mana += value;
  else if (key === StatKey.ARMOR) stats.armor += value;
  else if (key === StatKey.MAGIC_RESIST) stats.magicResist += value;
  else if (key === StatKey.ATTACK_DAMAGE) stats.attackDamage += value;
  else if (key === StatKey.ABILITY_POWER) stats.abilityPower += value;
  else if (key === StatKey.MOVE_SPEED) stats.movespeed += value;
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
  for (const [stat, value] of percentStats) applyPercentStat(result, stat, value);
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
  };
  return values[stat];
}

export function evaluateAbilitySimulation(
  simulation: AbilitySimulation | undefined,
  abilityRank: number,
  stats: SimpleStats
): number | null {
  if (simulation?.status !== "complete" || !simulation.primary) return null;
  const rankIndex = Math.min(
    Math.max(Math.trunc(abilityRank) - 1, 0),
    simulation.primary.baseByRank.length - 1
  );
  if (rankIndex < 0) return null;
  let total = simulation.primary.baseByRank[rankIndex];
  if (!Number.isFinite(total)) return null;
  for (const term of simulation.primary.terms) {
    const coefficient = term.coefficientsByRank[rankIndex];
    if (!Number.isFinite(coefficient)) return null;
    total += coefficient * simulationStatValue(term.stat, stats);
  }
  return Number.isFinite(total) ? total : null;
}
