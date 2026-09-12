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

const CURVE_FIELDS = ["byRank", "byLevel", "byRankAndLevel"] as const;

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

function assertExprCurve(value: unknown, label: string): void {
  // null 이나 숫자가 오면 필드 접근 자체가 터지므로 먼저 막는다.
  if (!isRecord(value)) throw new Error(`Invalid ability simulation ${label}`);
  assertSimulationSeries(value, CURVE_FIELDS, label);
}

function assertExprNode(value: unknown): void {
  if (!isRecord(value)) throw new Error("Invalid ability simulation expression");
  if (value.kind === "sum" || value.kind === "product") {
    if (!Array.isArray(value.parts) || value.parts.length === 0) {
      throw new Error("Invalid ability simulation expression");
    }
    for (const part of value.parts) assertExprNode(part);
    return;
  }
  if (value.kind === "value") {
    assertExprCurve(value.value, "expression value");
    return;
  }
  if (value.kind === "stat") {
    if (!SIMULATION_STATS.has(String(value.stat))) {
      throw new Error("Invalid ability simulation stat");
    }
    assertExprCurve(value.coefficient, "expression coefficient");
    return;
  }
  if (value.kind === "buffStacks") {
    if (typeof value.buff !== "string") throw new Error("Invalid ability simulation expression");
    if (
      value.stackSource !== undefined &&
      !["P", "Q", "W", "E", "R"].includes(String(value.stackSource))
    ) {
      throw new Error("Invalid ability simulation stack source");
    }
    assertExprCurve(value.coefficient, "expression coefficient");
    return;
  }
  throw new Error("Invalid ability simulation expression");
}

function assertExpression(value: unknown): void {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    value.kind !== "damage" ||
    !["physical", "magical", "true", "unknown"].includes(String(value.damageType)) ||
    (value.targetHealthScaling !== undefined &&
      !["max", "current", "missing"].includes(String(value.targetHealthScaling))) ||
    typeof value.requiresBuffStacks !== "boolean"
  ) {
    throw new Error("Invalid ability simulation expression");
  }
  assertExprNode(value.root);
}

function assertSimulation(value: unknown): void {
  if (
    !isRecord(value) ||
    !["complete", "expression", "unsupported", "unavailable"].includes(String(value.status)) ||
    !Array.isArray(value.unsupportedPartTypes)
  ) {
    throw new Error("Invalid ability simulation status");
  }
  if (value.status === "expression") {
    assertExpression(value.expression);
    return;
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
  if (value.forms !== undefined) assertAbilityForms(value.forms);
}

function assertAbilityForms(value: unknown): void {
  if (!Array.isArray(value) || value.length !== 2) throw new Error("Invalid ability forms");
  for (const [index, form] of value.entries()) {
    if (!isRecord(form) || form.key !== (index === 0 ? "A" : "B") ||
        typeof form.label !== "string" || typeof form.id !== "string" || typeof form.name !== "string" ||
        typeof form.bodyHtml !== "string" || typeof form.iconPath !== "string" ||
        typeof form.iconVersion !== "string" || !/^\d+\.\d+(?:\.\d+)?$/.test(form.iconVersion) ||
        !/^assets\/characters\/[a-z0-9_/.-]+\.png$/.test(form.iconPath) || form.iconPath.includes("..") ||
        !ABILITY_SLOTS.includes(form.tooltipRankSource as AbilitySlot) ||
        !isRecord(form.diagnostics) || !Array.isArray(form.diagnostics.unresolvedTokens)) {
      throw new Error("Invalid ability form");
    }
    assertFiniteNumbers(form.cooldownSeconds, "form cooldown");
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
