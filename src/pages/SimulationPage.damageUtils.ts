import type { Champion, ChampionSpell, Item } from "@/types";

export interface SimpleStats {
  level: number;
  health: number;
  mana: number;
  armor: number;
  magicResist: number;
  attackDamage: number;
  movespeed: number;
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


