import type {
  NormalizedDamageEffect,
  NormalizedDamageScaling,
} from "../../../src/types/combatNormalized";

type DamageType = NormalizedDamageEffect["damageType"];

interface EffectSpec {
  calculation: string;
  damageType: DamageType;
  conditions: string[];
}

const EFFECT_SPECS: Record<string, EffectSpec> = {
  "3057": { calculation: "SpellbladeDamage", damageType: "physical", conditions: ["after-ability", "next-attack"] },
  "3078": { calculation: "SpellbladeDamage", damageType: "physical", conditions: ["after-ability", "next-attack"] },
  "3100": { calculation: "SpellbladeDamage", damageType: "magical", conditions: ["after-ability", "next-attack"] },
  "3115": { calculation: "TotalOnHitDamage", damageType: "magical", conditions: ["on-hit"] },
  "6655": { calculation: "Damage", damageType: "magical", conditions: ["damaging-ability", "one-echo"] },
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function dataValues(source: Record<string, unknown>): Map<string, number> {
  const result = new Map<string, number>();
  const values = Array.isArray(source.mDataValues) ? source.mDataValues : [];
  for (const value of values) {
    const entry = record(value);
    if (typeof entry?.mName === "string" && typeof entry.mValue === "number") {
      result.set(entry.mName, entry.mValue);
    }
  }
  return result;
}

function partValue(part: Record<string, unknown>, values: Map<string, number>): number | null {
  if (typeof part.mNumber === "number") return part.mNumber;
  if (typeof part.mCoefficient === "number") return part.mCoefficient;
  return typeof part.mDataValue === "string"
    ? values.get(part.mDataValue) ?? null
    : null;
}

function scalingStat(part: Record<string, unknown>): NormalizedDamageScaling["stat"] | null {
  if (part.__type !== "StatByCoefficientCalculationPart" &&
      part.__type !== "StatByNamedDataValueCalculationPart") return null;
  if (part.mStat === 2 && part.mStatFormula === 1) return "baseAttackDamage";
  if (part.mStat === 2) return "attackDamage";
  if (part.mStat === undefined || part.mStat === 0) return "abilityPower";
  return null;
}

export function compileItemDamageEffects(
  itemId: string,
  rawSource: unknown,
): NormalizedDamageEffect[] {
  const spec = EFFECT_SPECS[itemId];
  const source = record(rawSource);
  if (itemId === "6653" && source) {
    const values = dataValues(source);
    const duration = values.get("BurnDuration");
    const ratio = values.get("BurnPercentHealthDamage");
    if (duration !== undefined && ratio !== undefined) {
      return [{
        id: "item-6653-burn",
        damageType: "magical",
        target: "champion",
        valuesByLevel: Array(18).fill(0),
        scalings: [{ stat: "targetMaxHealth", coefficient: duration * ratio }],
        durationSeconds: duration,
        conditions: ["damaging-ability", "full-burn", "no-suffering-amplification"],
      }];
    }
  }
  const calculations = record(source?.mItemCalculations);
  const calculation = record(calculations?.[spec?.calculation]);
  if (!spec || !source || !calculation || !Array.isArray(calculation.mFormulaParts)) return [];

  const values = dataValues(source);
  let baseValue = 0;
  const scalings: NormalizedDamageScaling[] = [];
  for (const rawPart of calculation.mFormulaParts) {
    const part = record(rawPart);
    if (!part) return [];
    const value = partValue(part, values);
    if (value === null) return [];
    const stat = scalingStat(part);
    if (stat) scalings.push({ stat, coefficient: value });
    else if (part.__type === "NamedDataValueCalculationPart" ||
             part.__type === "NumberCalculationPart") baseValue += value;
    else return [];
  }
  return [{
    id: `item-${itemId}-${spec.calculation}`,
    damageType: spec.damageType,
    target: "champion",
    valuesByLevel: Array(18).fill(baseValue),
    scalings,
    conditions: spec.conditions,
  }];
}
