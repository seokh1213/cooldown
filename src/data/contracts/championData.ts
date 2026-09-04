import type {
  ChampionBaseStats,
  NormalizedSpellScaling,
} from "@/types/combatNormalized";
import type { StatContribution } from "@/types/combatStats";
import type { DataLocale, StaticDataSources } from "./staticData";

export type AbilitySlot = "P" | "Q" | "W" | "E" | "R";

export interface AbilityRankValue {
  label: string;
  values: string;
}

export interface AbilityResourceCost {
  values: number[];
  resource: string;
}

export type AbilitySimulationStat =
  | "abilityPower"
  | "totalAttackDamage"
  | "baseAttackDamage"
  | "bonusAttackDamage"
  | "maxHealth"
  | "bonusHealth"
  | "armor"
  | "bonusArmor"
  | "magicResist"
  | "bonusMagicResist"
  | "maxMana"
  | "bonusMana"
  | "attackSpeed"
  | "bonusAttackSpeed"
  | "moveSpeed"
  | "critChance"
  | "critDamage"
  | "bonusCritDamage"
  | "lifeSteal"
  | "lethality";

export interface AbilitySimulationTerm {
  stat: AbilitySimulationStat;
  coefficientsByRank?: number[];
  coefficientsByLevel?: number[];
  coefficientsByRankAndLevel?: number[][];
}

export interface AbilitySimulationCalculation {
  id: string;
  kind: "damage";
  damageType: "physical" | "magical" | "true" | "unknown";
  targetHealthScaling?: "max" | "current" | "missing";
  baseByRank?: number[];
  baseByLevel?: number[];
  baseByRankAndLevel?: number[][];
  terms: AbilitySimulationTerm[];
}

export interface AbilitySimulation {
  status: "complete" | "unsupported" | "unavailable";
  primary?: AbilitySimulationCalculation;
  unsupportedPartTypes: string[];
}

export interface AbilityV2 {
  slot: AbilitySlot;
  id: string;
  name: string;
  maxRank: number;
  summary: string;
  bodyHtml: string;
  iconFile: string;
  cooldownSeconds: number[];
  rechargeSeconds?: number[];
  maxCharges?: number;
  cost?: AbilityResourceCost;
  range: number[];
  rankValues: AbilityRankValue[];
  scalings: NormalizedSpellScaling[];
  simulation: AbilitySimulation;
  conditions: string[];
  source: "communitydragon" | "ddragon";
  diagnostics: {
    unresolvedTokens: string[];
  };
}

export interface ChampionDetailV2 {
  schemaVersion: 2;
  patchVersion: string;
  locale: DataLocale;
  sources: StaticDataSources;
  champion: {
    id: string;
    key: string;
    name: string;
    title: string;
    tags: string[];
    baseStats: ChampionBaseStats;
    baseStatContributions: StatContribution[];
    abilities: Record<AbilitySlot, AbilityV2>;
  };
}

export interface ChampionIndexEntryV2 {
  id: string;
  key: string;
  name: string;
  title: string;
  iconFile: string;
}

export interface ChampionIndexV2 {
  schemaVersion: 2;
  patchVersion: string;
  locale: DataLocale;
  sources: StaticDataSources;
  champions: ChampionIndexEntryV2[];
}
