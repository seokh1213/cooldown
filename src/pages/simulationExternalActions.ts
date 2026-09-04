import {
  runeIconUrl,
  summonerSpellIconUrl,
} from "@/data/assets/riotAssetUrls";
import type {
  NormalizedDamageEffect,
  NormalizedRune,
  NormalizedSummonerSpell,
} from "@/types/combatNormalized";
import type { DamageType } from "./SimulationPage.damageUtils";

export interface SimulationExternalAction {
  id: string;
  name: string;
  rawDamage: number;
  damageType: DamageType;
  iconUrl: string;
}

function effectDamage(effect: NormalizedDamageEffect, level: number): number {
  const index = Math.min(Math.max(level, 1), 18) - 1;
  return effect.valuesByLevel[index] ?? 0;
}

export function buildExternalActions(input: {
  summoners: NormalizedSummonerSpell[];
  selectedSummonerIds: string[];
  rune: NormalizedRune | null;
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
        rawDamage: effectDamage(effect, input.level),
        damageType: effect.damageType,
        iconUrl: summonerSpellIconUrl(input.ddragonVersion, spell.iconPath),
      }));
  });
  const runeActions = input.rune?.damageEffects.map((effect) => ({
    id: `rune:${input.rune!.id}:${effect.id}`,
    name: input.rune!.name,
    rawDamage: effectDamage(effect, input.level),
    damageType: effect.damageType,
    iconUrl: runeIconUrl(input.rune!.iconPath ?? ""),
  })) ?? [];
  return [...summonerActions, ...runeActions];
}
