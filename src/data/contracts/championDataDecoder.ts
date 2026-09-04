import type {
  AbilitySlot,
  ChampionDetailV2,
  ChampionIndexV2,
} from "./championData";
import { DATA_LOCALES, type DataLocale, type StaticDataSources } from "./staticData";

const ABILITY_SLOTS: AbilitySlot[] = ["P", "Q", "W", "E", "R"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function decodeHeader(value: Record<string, unknown>): {
  patchVersion: string;
  locale: DataLocale;
  sources: StaticDataSources;
} {
  if (value.schemaVersion !== 2 || typeof value.patchVersion !== "string") {
    throw new Error("Unsupported champion data schema");
  }
  if (!DATA_LOCALES.includes(value.locale as DataLocale)) {
    throw new Error("Unsupported champion data locale");
  }
  if (
    !isRecord(value.sources) ||
    typeof value.sources.ddragon !== "string" ||
    typeof value.sources.cdragon !== "string"
  ) {
    throw new Error("Invalid champion data source versions");
  }
  return {
    patchVersion: value.patchVersion,
    locale: value.locale as DataLocale,
    sources: {
      ddragon: value.sources.ddragon,
      cdragon: value.sources.cdragon,
    },
  };
}

function assertAbility(value: unknown, slot: AbilitySlot): void {
  if (
    !isRecord(value) ||
    value.slot !== slot ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.bodyHtml !== "string" ||
    !Array.isArray(value.cooldownSeconds) ||
    !Array.isArray(value.rankValues) ||
    !isRecord(value.diagnostics) ||
    !Array.isArray(value.diagnostics.unresolvedTokens)
  ) {
    throw new Error(`Invalid ${slot} ability data`);
  }
}

export function decodeChampionDetail(value: unknown): ChampionDetailV2 {
  if (!isRecord(value)) throw new Error("Invalid champion detail");
  decodeHeader(value);
  if (!isRecord(value.champion) || !isRecord(value.champion.abilities)) {
    throw new Error("Invalid champion detail payload");
  }
  if (
    typeof value.champion.id !== "string" ||
    typeof value.champion.name !== "string" ||
    !isRecord(value.champion.baseStats)
  ) {
    throw new Error("Invalid champion identity or stats");
  }
  for (const slot of ABILITY_SLOTS) {
    assertAbility(value.champion.abilities[slot], slot);
  }
  return value as unknown as ChampionDetailV2;
}

export function decodeChampionIndex(value: unknown): ChampionIndexV2 {
  if (!isRecord(value)) throw new Error("Invalid champion index");
  decodeHeader(value);
  if (!Array.isArray(value.champions)) {
    throw new Error("Invalid champion index payload");
  }
  for (const champion of value.champions) {
    if (
      !isRecord(champion) ||
      typeof champion.id !== "string" ||
      typeof champion.key !== "string" ||
      typeof champion.name !== "string" ||
      typeof champion.iconFile !== "string"
    ) {
      throw new Error("Invalid champion index entry");
    }
  }
  return value as unknown as ChampionIndexV2;
}
