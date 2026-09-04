import type {
  ChampionBaseStats,
  LevelScaledScalar,
} from "../../../src/types/combatNormalized";
import { StatKey, type StatContribution } from "../../../src/types/combatStats";

function createLevelScaledScalar(
  stats: Record<string, number | undefined>,
  baseKey: string,
  perLevelKey: string,
): LevelScaledScalar {
  return {
    base: stats[baseKey] ?? 0,
    perLevel: stats[perLevelKey] ?? 0,
  };
}

export function buildChampionBaseStats(
  stats: Record<string, number | undefined>,
): ChampionBaseStats {
  const hasMana = stats.mp !== undefined || stats.mpperlevel !== undefined;
  const hasManaRegen =
    stats.mpregen !== undefined || stats.mpregenperlevel !== undefined;

  return {
    health: createLevelScaledScalar(stats, "hp", "hpperlevel"),
    healthRegen: createLevelScaledScalar(stats, "hpregen", "hpregenperlevel"),
    mana: hasMana ? createLevelScaledScalar(stats, "mp", "mpperlevel") : undefined,
    manaRegen: hasManaRegen
      ? createLevelScaledScalar(stats, "mpregen", "mpregenperlevel")
      : undefined,
    energy: undefined,
    energyRegen: undefined,
    attackDamage: createLevelScaledScalar(
      stats,
      "attackdamage",
      "attackdamageperlevel",
    ),
    attackSpeed: createLevelScaledScalar(
      stats,
      "attackspeed",
      "attackspeedperlevel",
    ),
    armor: createLevelScaledScalar(stats, "armor", "armorperlevel"),
    magicResist: createLevelScaledScalar(
      stats,
      "spellblock",
      "spellblockperlevel",
    ),
    moveSpeed: { base: stats.movespeed ?? 0, perLevel: 0 },
    attackRange: { base: stats.attackrange ?? 0, perLevel: 0 },
  };
}

export function buildBaseStatContributions(
  baseStats: ChampionBaseStats,
): StatContribution[] {
  const result: StatContribution[] = [];
  const add = (stat: StatKey, scalar: LevelScaledScalar | undefined) => {
    if (!scalar) return;
    result.push({
      stat,
      value: scalar.perLevel,
      valueType: "perLevel",
      source: "base",
      scope: "champion-base",
    });
  };

  add(StatKey.MAX_HEALTH, baseStats.health);
  add(StatKey.HEALTH_REGEN, baseStats.healthRegen);
  add(StatKey.MAX_MANA, baseStats.mana);
  add(StatKey.MANA_REGEN, baseStats.manaRegen);
  add(StatKey.ATTACK_DAMAGE, baseStats.attackDamage);
  add(StatKey.ATTACK_SPEED, baseStats.attackSpeed);
  add(StatKey.ARMOR, baseStats.armor);
  add(StatKey.MAGIC_RESIST, baseStats.magicResist);

  return result;
}
