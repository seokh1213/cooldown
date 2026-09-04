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

export interface AbilityV2 {
  slot: AbilitySlot;
  id: string;
  name: string;
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
