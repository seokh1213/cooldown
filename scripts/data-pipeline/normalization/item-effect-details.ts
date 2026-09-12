import type {
  NormalizedDamageEffect,
  NormalizedItemEffect,
} from "../../../src/types/combatNormalized";

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function namedValue(
  source: Record<string, unknown>,
  name: string,
): number | undefined {
  const values = Array.isArray(source.mDataValues) ? source.mDataValues : [];
  const value = values
    .map(record)
    .find((entry) => entry?.mName === name)?.mValue;
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function percentCalculation(
  source: Record<string, unknown>,
  key: string,
  valueName: string,
): number | undefined {
  const calculation = record(record(source.mItemCalculations)?.[key]);
  const parts = calculation?.mFormulaParts;
  if (calculation?.mMultiplier !== undefined) return;
  if (
    calculation?.__type !== "GameCalculation" ||
    calculation.mDisplayAsPercent !== true ||
    !Array.isArray(parts) ||
    parts.length !== 1
  )
    return;
  const part = record(parts[0]);
  if (
    part?.__type !== "NamedDataValueCalculationPart" ||
    part.mDataValue !== valueName
  )
    return;
  return namedValue(source, valueName);
}

export function attachItemEffectDetails(input: {
  id: string;
  effects: NormalizedItemEffect[];
  damage: NormalizedDamageEffect[];
  calculation: unknown;
}): NormalizedItemEffect[] {
  const source = record(input.calculation);
  if (!source) return input.effects;
  const effects = input.effects.map((effect) => ({ ...effect }));
  // These item sources describe the compiled damage as their first named effect.
  const first = effects.find((effect) => effect.name);
  if (first && input.damage.length === 1) first.damage = input.damage[0];
  if (first && ["3057", "3078", "3100"].includes(input.id)) {
    first.cooldownSeconds = namedValue(source, "SpellbladeCooldown");
  }
  if (input.id === "3153" && first) {
    const melee = percentCalculation(
      source,
      "MeleeItemCalcValue",
      "MeleeValue",
    );
    const ranged = percentCalculation(
      source,
      "RangedItemCalcValue",
      "RangedValue",
    );
    if (melee !== undefined && ranged !== undefined)
      first.healthDamage = {
        damageType: "physical",
        health: "current",
        melee,
        ranged,
      };
    const slow = effects.filter((effect) => effect.name)[1];
    if (slow) slow.cooldownSeconds = namedValue(source, "Cooldown");
  }
  return effects;
}
