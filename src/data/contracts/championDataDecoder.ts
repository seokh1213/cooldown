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
const SIMULATION_STATS = new Set([
  "abilityPower",
  "totalAttackDamage",
  "baseAttackDamage",
  "bonusAttackDamage",
  "maxHealth",
  "bonusHealth",
  "armor",
  "bonusArmor",
  "magicResist",
  "bonusMagicResist",
  "maxMana",
  "bonusMana",
  "attackSpeed",
  "bonusAttackSpeed",
  "moveSpeed",
  "critChance",
  "critDamage",
  "bonusCritDamage",
  "lifeSteal",
  "lethality",
]);

function assertFiniteNumbers(value: unknown, field: string): asserts value is number[] {
  if (!Array.isArray(value) || !value.every(Number.isFinite)) {
    throw new Error(`Invalid ability simulation ${field}`);
  }
}

function assertSimulationSeries(
  value: Record<string, unknown>,
  fields: readonly string[],
  label: string,
): void {
  const present = fields.filter((field) => value[field] !== undefined);
  if (present.length !== 1) throw new Error(`Invalid ability simulation ${label}`);
  const series = value[present[0]];
  if (present[0].endsWith("AndLevel")) {
    if (!Array.isArray(series) || series.length === 0) {
      throw new Error(`Invalid ability simulation ${label}`);
    }
    for (const row of series) assertFiniteNumbers(row, label);
  } else {
    assertFiniteNumbers(series, label);
  }
}

function assertSimulation(value: unknown): void {
  if (
    !isRecord(value) ||
    !["complete", "unsupported", "unavailable"].includes(String(value.status)) ||
    !Array.isArray(value.unsupportedPartTypes)
  ) {
    throw new Error("Invalid ability simulation status");
  }
  if (value.status !== "complete") return;
  if (
    !isRecord(value.primary) ||
    typeof value.primary.id !== "string" ||
    value.primary.kind !== "damage" ||
    !["physical", "magical", "true", "unknown"].includes(String(value.primary.damageType)) ||
    (value.primary.targetHealthScaling !== undefined &&
      !["max", "current", "missing"].includes(String(value.primary.targetHealthScaling))) ||
    !Array.isArray(value.primary.terms)
  ) {
    throw new Error("Invalid complete ability simulation");
  }
  assertSimulationSeries(
    value.primary,
    ["baseByRank", "baseByLevel", "baseByRankAndLevel"],
    "base values",
  );
  for (const term of value.primary.terms) {
    if (!isRecord(term) || !SIMULATION_STATS.has(String(term.stat))) {
      throw new Error("Invalid ability simulation stat");
    }
    assertSimulationSeries(
      term,
      ["coefficientsByRank", "coefficientsByLevel", "coefficientsByRankAndLevel"],
      "coefficients",
    );
  }
}

function assertAbility(value: unknown, slot: AbilitySlot): void {
  if (
    !isRecord(value) ||
    value.slot !== slot ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.maxRank !== "number" ||
    typeof value.bodyHtml !== "string" ||
    !Array.isArray(value.cooldownSeconds) ||
    !Array.isArray(value.rankValues) ||
    !isRecord(value.diagnostics) ||
    !Array.isArray(value.diagnostics.unresolvedTokens)
  ) {
    throw new Error(`Invalid ${slot} ability data`);
  }
  assertSimulation(value.simulation);
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
