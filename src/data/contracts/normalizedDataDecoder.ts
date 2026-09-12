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

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function assertItemEffect(value: unknown): void {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string" || typeof value.description !== "string" || !["passive", "active", "mythicPassive", "aura"].includes(String(value.kind))) {
    throw new Error("Invalid normalized item effect description");
  }
  if (value.cooldownSeconds !== undefined && (!finiteNumber(value.cooldownSeconds) || value.cooldownSeconds < 0)) {
    throw new Error("Invalid normalized item effect cooldown");
  }
  if (value.healthDamage !== undefined) {
    const health = value.healthDamage;
    if (!isRecord(health) || health.health !== "current" || !["physical", "magical", "true"].includes(String(health.damageType)) || !finiteNumber(health.melee) || !finiteNumber(health.ranged) || health.melee < 0 || health.ranged < 0) {
      throw new Error("Invalid normalized item health damage");
    }
  }
  if (value.damage === undefined) return;
  const damage = value.damage;
  if (!isRecord(damage) || !["physical", "magical", "true"].includes(String(damage.damageType)) || !Array.isArray(damage.valuesByLevel) || !damage.valuesByLevel.every(finiteNumber)) {
    throw new Error("Invalid normalized item effect damage");
  }
  if (damage.durationSeconds !== undefined && (!finiteNumber(damage.durationSeconds) || damage.durationSeconds < 0)) {
    throw new Error("Invalid normalized item effect duration");
  }
  if (damage.conditions !== undefined && (!Array.isArray(damage.conditions) || !damage.conditions.every((condition) => typeof condition === "string"))) {
    throw new Error("Invalid normalized item effect conditions");
  }
  if (damage.scalings !== undefined && (!Array.isArray(damage.scalings) || !damage.scalings.every((scaling) => isRecord(scaling) && ["baseAttackDamage", "attackDamage", "abilityPower", "targetMaxHealth"].includes(String(scaling.stat)) && finiteNumber(scaling.coefficient)))) {
    throw new Error("Invalid normalized item effect scalings");
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
    if (record.statDescriptions !== undefined && (!Array.isArray(record.statDescriptions) || !record.statDescriptions.every((line) => typeof line === "string"))) {
      throw new Error("Invalid normalized item stat descriptions");
    }
    for (const effect of record.effects as unknown[]) {
      assertItemEffect(effect);
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
