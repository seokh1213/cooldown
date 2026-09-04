import {
  runeIconUrl,
  itemIconUrl,
  summonerSpellIconUrl,
} from "@/data/assets/riotAssetUrls";
import type {
  NormalizedDamageEffect,
  NormalizedRune,
  NormalizedItem,
  NormalizedSummonerSpell,
} from "@/types/combatNormalized";
import type { DamageType, SimpleStats } from "./SimulationPage.damageUtils";

export interface SimulationExternalAction {
  id: string;
  name: string;
  rawDamage: number;
  damageType: DamageType;
  iconUrl: string;
}

function effectDamage(
  effect: NormalizedDamageEffect,
  level: number,
  attackerStats: SimpleStats | null,
  targetStats: SimpleStats | null,
): number {
  const index = Math.min(Math.max(level, 1), 18) - 1;
  const base = effect.valuesByLevel[index] ?? 0;
  return base + (effect.scalings ?? []).reduce((total, scaling) => {
    const source = scaling.stat === "targetMaxHealth" ? targetStats : attackerStats;
    return total + (source?.[scaling.stat === "targetMaxHealth" ? "health" : scaling.stat] ?? 0) * scaling.coefficient;
  }, 0);
}

export function buildExternalActions(input: {
  summoners: NormalizedSummonerSpell[];
  selectedSummonerIds: string[];
  rune: NormalizedRune | null;
  items: NormalizedItem[];
  attackerStats: SimpleStats | null;
  targetStats: SimpleStats | null;
  level: number;
  ddragonVersion: string;
}): SimulationExternalAction[] {
  const summonerActions = input.selectedSummonerIds.flatMap((id) => {
    const spell = input.summoners.find((candidate) => candidate.id === id);
    if (!spell) return [];
    return spell.damageEffects
      .filter((effect) => effect.target === "champion")
      .map((effect) => ({
        id: `summoner:${spell.id}:${effect.id}`,
        name: spell.name,
        rawDamage: effectDamage(effect, input.level, input.attackerStats, input.targetStats),
        damageType: effect.damageType,
        iconUrl: summonerSpellIconUrl(input.ddragonVersion, spell.iconPath),
      }));
  });
  const runeActions = input.rune?.damageEffects.map((effect) => ({
    id: `rune:${input.rune!.id}:${effect.id}`,
    name: input.rune!.name,
    rawDamage: effectDamage(effect, input.level, input.attackerStats, input.targetStats),
    damageType: effect.damageType,
    iconUrl: runeIconUrl(input.rune!.iconPath ?? ""),
  })) ?? [];
  const itemActions = input.items.flatMap((item) => (item.damageEffects ?? []).map((effect) => ({
    id: `item:${item.id}:${effect.id}`,
    name: item.name,
    rawDamage: effectDamage(effect, input.level, input.attackerStats, input.targetStats),
    damageType: effect.damageType,
    iconUrl: itemIconUrl(input.ddragonVersion, item.id),
  })));
  return [...summonerActions, ...runeActions, ...itemActions];
}
