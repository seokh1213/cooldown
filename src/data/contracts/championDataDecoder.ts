import type {
  AbilitySlot,
  ChampionDetailV2,
  ChampionIndexV2,
} from "./championData";
import {
  decodeStaticDataMetadata,
  isRecord,
} from "./staticDataDecoder";

const ABILITY_SLOTS: AbilitySlot[] = ["P", "Q", "W", "E", "R"];

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
  decodeStaticDataMetadata(value);
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
  decodeStaticDataMetadata(value);
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
