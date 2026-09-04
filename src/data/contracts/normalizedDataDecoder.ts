import type {
  NormalizedItemDataFile,
  NormalizedRuneDataFile,
  NormalizedSummonerDataFile,
} from "@/types/combatNormalized";
import {
  decodeStaticDataMetadata,
  isRecord,
} from "./staticDataDecoder";

function assertEntity(
  value: unknown,
  expectedType: "item" | "rune" | "statShard"
): void {
  if (
    !isRecord(value) ||
    value.type !== expectedType ||
    typeof value.id !== "string" ||
    typeof value.name !== "string"
  ) {
    throw new Error(`Invalid normalized ${expectedType}`);
  }
}


function assertArrayFields(
  value: Record<string, unknown>,
  fields: string[],
  entity: string
): void {
  for (const field of fields) {
    if (!Array.isArray(value[field])) {
      throw new Error(`Invalid ${entity} ${field}`);
    }
  }
}

export function decodeNormalizedItems(value: unknown): NormalizedItemDataFile {
  if (!isRecord(value)) throw new Error("Invalid normalized item data");
  decodeStaticDataMetadata(value);
  if (!Array.isArray(value.items)) {
    throw new Error("Invalid normalized item collection");
  }
  for (const item of value.items) {
    assertEntity(item, "item");
    const record = item as Record<string, unknown>;
    if (
      typeof record.price !== "number" ||
      typeof record.priceTotal !== "number"
    ) {
      throw new Error("Invalid normalized item prices");
    }
    assertArrayFields(
      record,
      ["tags", "buildsFrom", "buildsInto", "stats", "effects"],
      "normalized item"
    );
    if (record.damageEffects !== undefined && !Array.isArray(record.damageEffects)) {
      throw new Error("Invalid normalized item damage effects");
    }
  }
  return value as unknown as NormalizedItemDataFile;
}

export function decodeNormalizedRunes(value: unknown): NormalizedRuneDataFile {
  if (!isRecord(value)) throw new Error("Invalid normalized rune data");
  decodeStaticDataMetadata(value);
  if (!Array.isArray(value.runes) || !Array.isArray(value.statShards)) {
    throw new Error("Invalid normalized rune collections");
  }
  for (const rune of value.runes) {
    assertEntity(rune, "rune");
    const record = rune as Record<string, unknown>;
    if (
      typeof record.pathId !== "number" ||
      typeof record.slotIndex !== "number" ||
      !Array.isArray(record.stats) ||
      !Array.isArray(record.damageEffects)
    ) {
      throw new Error("Invalid normalized rune fields");
    }
  }
  for (const shard of value.statShards) {
    assertEntity(shard, "statShard");
    const record = shard as Record<string, unknown>;
    if (
      typeof record.rowIndex !== "number" ||
      typeof record.columnIndex !== "number" ||
      !Array.isArray(record.stats)
    ) {
      throw new Error("Invalid normalized stat shard fields");
    }
  }
  return value as unknown as NormalizedRuneDataFile;
}

export function decodeNormalizedSummoners(
  value: unknown
): NormalizedSummonerDataFile {
  if (!isRecord(value)) throw new Error("Invalid normalized summoner data");
  decodeStaticDataMetadata(value);
  if (!Array.isArray(value.spells)) {
    throw new Error("Invalid normalized summoner collection");
  }
  for (const spell of value.spells) {
    if (
      !isRecord(spell) ||
      typeof spell.id !== "string" ||
      typeof spell.key !== "string" ||
      typeof spell.name !== "string" ||
      typeof spell.tooltip !== "string" ||
      typeof spell.iconPath !== "string" ||
      !Array.isArray(spell.cooldown) ||
      !Array.isArray(spell.modes) ||
      !Array.isArray(spell.damageEffects)
    ) {
      throw new Error("Invalid normalized summoner spell");
    }
  }
  return value as unknown as NormalizedSummonerDataFile;
}
