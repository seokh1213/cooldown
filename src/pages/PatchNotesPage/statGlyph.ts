import type { PatchChange } from "@/data/contracts/patchNotes";
import { STAT_DEFINITIONS, StatKey } from "@/types/combatStats";

const CHAMPION_STATS: Record<string, StatKey> = {
  hp: StatKey.MAX_HEALTH, hpperlevel: StatKey.MAX_HEALTH,
  hpregen: StatKey.HEALTH_REGEN, hpregenperlevel: StatKey.HEALTH_REGEN,
  mp: StatKey.MAX_MANA, mpperlevel: StatKey.MAX_MANA,
  mpregen: StatKey.MANA_REGEN, mpregenperlevel: StatKey.MANA_REGEN,
  armor: StatKey.ARMOR, armorperlevel: StatKey.ARMOR,
  spellblock: StatKey.MAGIC_RESIST, spellblockperlevel: StatKey.MAGIC_RESIST,
  attackdamage: StatKey.ATTACK_DAMAGE, attackdamageperlevel: StatKey.ATTACK_DAMAGE,
  attackspeed: StatKey.ATTACK_SPEED, attackspeedperlevel: StatKey.ATTACK_SPEED,
  movespeed: StatKey.MOVE_SPEED, attackrange: StatKey.ATTACK_RANGE,
};

const ITEM_STATS: Record<string, StatKey> = {
  mFlatHPPoolMod: StatKey.MAX_HEALTH, mFlatPhysicalDamageMod: StatKey.ATTACK_DAMAGE,
  mFlatMagicDamageMod: StatKey.ABILITY_POWER, mFlatArmorMod: StatKey.ARMOR,
  mFlatSpellBlockMod: StatKey.MAGIC_RESIST, mPercentBaseHPRegenMod: StatKey.HEALTH_REGEN,
  percentBaseMPRegenMod: StatKey.MANA_REGEN, AbilityHasteMod: StatKey.ABILITY_HASTE,
  mFlatMovementSpeedMod: StatKey.MOVE_SPEED, mPercentAttackSpeedMod: StatKey.ATTACK_SPEED,
};

export function patchStatGlyph(change: Pick<PatchChange, "id" | "section">): string | undefined {
  const parts = change.id.split("/");
  const stat = parts[0] === "stats" ? CHAMPION_STATS[parts[1]] :
    parts[0] === "Items" ? ITEM_STATS[parts[2]] : undefined;
  return stat ? STAT_DEFINITIONS[stat].icon : undefined;
}
