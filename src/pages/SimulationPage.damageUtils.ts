import type { Champion, ChampionSpell } from "@/types";
import type { NormalizedItem } from "@/types/combatNormalized";
import type {
  NormalizedChampion,
  NormalizedItem,
  NormalizedRune,
  NormalizedStatShard,
  ChampionSpellSlot,
} from "@/types/combatNormalized";
import { StatKey } from "@/types/combatStats";

export interface SimpleStats {
  level: number;
  health: number;
  mana: number;
  armor: number;
  magicResist: number;
  attackDamage: number;
  movespeed: number;
}

export type StatVector = Partial<Record<StatKey, number>>;

export interface NormalizedSimulationSelection {
  champion: NormalizedChampion;
  level: number;
  items: NormalizedItem[];
  runes: NormalizedRune[];
  statShards: NormalizedStatShard[];
}

export interface NormalizedSimulationResult {
  level: number;
  stats: StatVector;
}

export interface SkillSummary {
  id: string;
  name?: string;
  maxrank: number;
  cooldowns: (number | string)[];
  cooldownsWithAbilityHaste: number[];
}

export interface SimpleComboResult {
  sequence: string;
  estimatedHits: number;
  estimatedDamage: number | null;
}

function computeChampionBaseStatsFromNormalized(
  champion: NormalizedChampion,
  level: number
): StatVector {
  const lvl = Math.min(Math.max(level, 1), 18);
  const factor = lvl - 1;
  const bs = champion.baseStats;

  const stats: StatVector = {};

  const apply = (key: StatKey, base: number, perLevel: number) => {
    stats[key] = (stats[key] ?? 0) + base + perLevel * factor;
  };

  apply(StatKey.MAX_HEALTH, bs.health.base, bs.health.perLevel);
  apply(StatKey.HEALTH_REGEN, bs.healthRegen.base, bs.healthRegen.perLevel);
  if (bs.mana) {
    apply(StatKey.MAX_MANA, bs.mana.base, bs.mana.perLevel);
  }
  if (bs.manaRegen) {
    apply(
      StatKey.MANA_REGEN,
      bs.manaRegen.base,
      bs.manaRegen.perLevel
    );
  }
  apply(
    StatKey.ATTACK_DAMAGE,
    bs.attackDamage.base,
    bs.attackDamage.perLevel
  );
  apply(
    StatKey.ATTACK_SPEED,
    bs.attackSpeed.base,
    bs.attackSpeed.perLevel
  );
  apply(StatKey.ARMOR, bs.armor.base, bs.armor.perLevel);
  apply(
    StatKey.MAGIC_RESIST,
    bs.magicResist.base,
    bs.magicResist.perLevel
  );
  apply(StatKey.MOVE_SPEED, bs.moveSpeed.base, bs.moveSpeed.perLevel);
  apply(
    StatKey.ATTACK_RANGE,
    bs.attackRange.base,
    bs.attackRange.perLevel
  );

  return stats;
}

export function computeNormalizedSimulationStats(
  selection: NormalizedSimulationSelection
): NormalizedSimulationResult {
  const { champion, level, items, runes, statShards } = selection;

  const stats: StatVector = computeChampionBaseStatsFromNormalized(
    champion,
    level
  );
  const percentModifiers: Partial<Record<StatKey, number>> = {};

  const applyContribution = (contrib: import("@/types/combatStats").StatContribution) => {
    const { stat, value, valueType } = contrib;
    if (valueType === "percent") {
      percentModifiers[stat] = (percentModifiers[stat] ?? 0) + value;
    } else {
      stats[stat] = (stats[stat] ?? 0) + value;
    }
  };

  for (const item of items) {
    for (const contrib of item.stats) {
      applyContribution(contrib);
    }
  }

  for (const rune of runes) {
    for (const contrib of rune.stats) {
      applyContribution(contrib);
    }
  }

  for (const shard of statShards) {
    for (const contrib of shard.stats) {
      applyContribution(contrib);
    }
  }

  for (const [key, percent] of Object.entries(percentModifiers)) {
    const statKey = key as StatKey;
    const base = stats[statKey] ?? 0;
    stats[statKey] = base * (1 + (percent ?? 0) / 100);
  }

  return {
    level,
    stats,
  };
}

export function computeChampionStatsAtLevel(
  champion: Champion,
  level: number
): SimpleStats | null {
  if (!champion.stats) return null;
  const s = champion.stats as any;
  const lvl = Math.min(Math.max(level, 1), 18);
  const factor = lvl - 1;
  return {
    level: lvl,
    health: (s.hp ?? 0) + (s.hpperlevel ?? 0) * factor,
    mana: (s.mp ?? 0) + (s.mpperlevel ?? 0) * factor,
    armor: (s.armor ?? 0) + (s.armorperlevel ?? 0) * factor,
    magicResist:
      (s.spellblock ?? 0) + (s.spellblockperlevel ?? 0) * factor,
    attackDamage:
      (s.attackdamage ?? 0) + (s.attackdamageperlevel ?? 0) * factor,
    movespeed: s.movespeed ?? 0,
  };
}

export function applyItemsToStats(base: SimpleStats, items: Item[]): SimpleStats {
  // 매우 단순한 근사치: 대표 스탯만 더해줌
  let result = { ...base };

  for (const item of items) {
    const stats = item.stats;
    if (!stats) continue;

    for (const [key, value] of Object.entries(stats)) {
      switch (key) {
        case "FlatHPPoolMod":
          result.health += value;
          break;
        case "FlatMPPoolMod":
          result.mana += value;
          break;
        case "FlatPhysicalDamageMod":
          result.attackDamage += value;
          break;
        case "FlatArmorMod":
          result.armor += value;
          break;
        case "FlatSpellBlockMod":
          result.magicResist += value;
          break;
        case "FlatMovementSpeedMod":
          result.movespeed += value;
          break;
        default:
          break;
      }
    }
  }

  return result;
}

export function computeAbilityHasteFromItems(items: Item[]): number {
  let haste = 0;
  for (const item of items) {
    const stats = item.stats;
    if (!stats) continue;
    // Data Dragon 아이템의 AbilityHaste 필드 사용
    if (typeof (stats as any).AbilityHaste === "number") {
      haste += (stats as any).AbilityHaste;
    }
  }
  return haste;
}

export function applyNormalizedItemsToStats(
  base: SimpleStats,
  items: NormalizedItem[]
): SimpleStats {
  let result = { ...base };

  for (const item of items) {
    const stats = item.stats;
    if (!stats || stats.length === 0) continue;

    for (const contrib of stats) {
      const { stat, value, valueType } = contrib;
      if (valueType === "percent") {
        // 간단한 근사치: 체력/마나/방어/마저/이속/공격력에 대해서만 퍼센트 적용
        switch (stat) {
          case StatKey.MAX_HEALTH:
            result.health *= 1 + value / 100;
            break;
          case StatKey.MAX_MANA:
            result.mana *= 1 + value / 100;
            break;
          case StatKey.ARMOR:
            result.armor *= 1 + value / 100;
            break;
          case StatKey.MAGIC_RESIST:
            result.magicResist *= 1 + value / 100;
            break;
          case StatKey.MOVE_SPEED:
            result.movespeed *= 1 + value / 100;
            break;
          case StatKey.ATTACK_DAMAGE:
            result.attackDamage *= 1 + value / 100;
            break;
          default:
            break;
        }
      } else {
        switch (stat) {
          case StatKey.MAX_HEALTH:
            result.health += value;
            break;
          case StatKey.MAX_MANA:
            result.mana += value;
            break;
          case StatKey.ARMOR:
            result.armor += value;
            break;
          case StatKey.MAGIC_RESIST:
            result.magicResist += value;
            break;
          case StatKey.ATTACK_DAMAGE:
            result.attackDamage += value;
            break;
          case StatKey.MOVE_SPEED:
            result.movespeed += value;
            break;
          default:
            break;
        }
      }
    }
  }

  return result;
}

export function computeAbilityHasteFromNormalizedItems(
  items: NormalizedItem[]
): number {
  let haste = 0;
  for (const item of items) {
    const stats = item.stats;
    if (!stats) continue;
    for (const contrib of stats) {
      if (contrib.stat === StatKey.ABILITY_HASTE && contrib.valueType === "flat") {
        haste += contrib.value;
      }
    }
  }
  return haste;
}

export function computeSkillSummaries(
  champion: Champion,
  _cdragonSpellData: Record<string, any> | null,
  abilityHaste: number
): SkillSummary[] {
  if (!champion.spells) return [];
  const hasteFactor = abilityHaste > 0 ? 1 + abilityHaste / 100 : 1;

  return champion.spells.map((spell: ChampionSpell) => {
    const baseCd = spell.cooldown ?? [];
    const cooldownsWithHaste =
      hasteFactor > 0
        ? baseCd.map((cd) =>
            typeof cd === "number" ? cd / hasteFactor : cd
          )
        : baseCd.map((cd) =>
            typeof cd === "number" ? cd : cd
          );

    return {
      id: spell.id,
      name: spell.name,
      maxrank: spell.maxrank,
      cooldowns: baseCd,
      cooldownsWithAbilityHaste: cooldownsWithHaste as number[],
    };
  });
}

export interface SpellDamageEstimate {
  baseDamage: number | null;
  ratio: number | null;
  totalDamage: number | null;
}

/**
 * CommunityDragon spellDataMap을 사용해 매우 단순한 피해량 근사를 계산한다.
 * - BaseDamage + (계수 × 현재 공격력)을 사용
 * - AP/AD 구분 없이 공격력에 모두 더하는 근사치
 */
export function estimateSpellDamageFromCDragon(
  spellDataMap: Record<string, any> | null,
  spellIndex: number,
  abilityRank: number,
  stats: SimpleStats
): SpellDamageEstimate {
  if (!spellDataMap) {
    return { baseDamage: null, ratio: null, totalDamage: null };
  }

  const key = String(spellIndex);
  const spell = spellDataMap[key];
  if (!spell || !spell.DataValues) {
    return { baseDamage: null, ratio: null, totalDamage: null };
  }

  const dataValues = spell.DataValues as Record<string, any>;
  const baseArray = Array.isArray(dataValues.BaseDamage)
    ? dataValues.BaseDamage
    : null;
  const rankIndex = Math.max(
    0,
    Math.min(
      abilityRank - 1,
      baseArray ? baseArray.length - 1 : abilityRank - 1
    )
  );

  let baseDamage: number | null = null;
  if (baseArray && typeof baseArray[rankIndex] === "number") {
    baseDamage = baseArray[rankIndex];
  }

  let ratio: number | null = null;

  const calculations = spell.mSpellCalculations as
    | Record<string, any>
    | undefined;

  const preferredCalc =
    calculations?.TotalDamage ||
    calculations?.SingleFireDamage ||
    Object.values(calculations ?? {})[0];

  if (preferredCalc && Array.isArray(preferredCalc.mFormulaParts)) {
    for (const part of preferredCalc.mFormulaParts as any[]) {
      if (
        part.__type === "StatByCoefficientCalculationPart" &&
        typeof part.mCoefficient === "number"
      ) {
        ratio = (ratio ?? 0) + part.mCoefficient;
      } else if (
        part.__type === "StatByNamedDataValueCalculationPart" &&
        typeof part.mDataValue === "string"
      ) {
        const arr = dataValues[part.mDataValue];
        if (Array.isArray(arr) && typeof arr[rankIndex] === "number") {
          ratio = (ratio ?? 0) + arr[rankIndex];
        }
      }
    }
  }

  const scaling = ratio != null ? ratio * stats.attackDamage : null;
  const totalDamage =
    baseDamage != null || scaling != null
      ? (baseDamage ?? 0) + (scaling ?? 0)
      : null;

  return { baseDamage, ratio, totalDamage };
}

export function estimateSpellDamageFromNormalized(
  selection: NormalizedSimulationSelection,
  slot: ChampionSpellSlot,
  abilityRank: number,
  spellDataMap: Record<string, any> | null
): SpellDamageEstimate | null {
  const { champion, level } = selection;
  const sim = computeNormalizedSimulationStats(selection);

  const simpleStats: SimpleStats = {
    level,
    health: sim.stats[StatKey.MAX_HEALTH] ?? 0,
    mana: sim.stats[StatKey.MAX_MANA] ?? 0,
    armor: sim.stats[StatKey.ARMOR] ?? 0,
    magicResist: sim.stats[StatKey.MAGIC_RESIST] ?? 0,
    attackDamage: sim.stats[StatKey.ATTACK_DAMAGE] ?? 0,
    movespeed: sim.stats[StatKey.MOVE_SPEED] ?? 0,
  };

  const indexBySlot: Record<ChampionSpellSlot, number> = {
    P: -1,
    Q: 0,
    W: 1,
    E: 2,
    R: 3,
  };

  const spellIndex = indexBySlot[slot];
  if (spellIndex < 0) {
    return null;
  }

  return estimateSpellDamageFromCDragon(
    spellDataMap,
    spellIndex,
    abilityRank,
    simpleStats
  );
}

export function computeSimpleComboResult(
  champion: Champion | null,
  stats: SimpleStats | null,
  comboSequence: string,
  spellDataMap: Record<string, any> | null
): SimpleComboResult | null {
  if (!champion || !stats) return null;

  const seq = comboSequence.replace(/[^QWERqwer]/g, "").toUpperCase();
  if (!seq) return null;

  // 이전 버전과 유사한 매우 단순 근사치:
  // 각 스킬이 현재 공격력의 약 1.2배 피해를 준다고 가정
  const perSkillDamage = stats.attackDamage * 1.2;
  const hits = seq.length;
  const totalDamage = perSkillDamage * hits;

  return {
    sequence: seq,
    estimatedHits: hits,
    estimatedDamage: totalDamage,
  };
}


