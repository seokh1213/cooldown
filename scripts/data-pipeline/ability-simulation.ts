import type {
  AbilitySimulation,
  AbilitySimulationCalculation,
  AbilitySimulationStat,
  AbilitySimulationTerm,
} from "../../src/data/contracts/championData";
import type { CommunityDragonSpellData } from "../../src/lib/spellTooltipParser/types";

type RawPart = Record<string, unknown>;

const DAMAGE_KEY_PRIORITY = [
  "TotalDamage",
  "Damage",
  "TotalDmg",
  "SingleFireDamage",
  "QMissileDamage",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function rankValues(value: unknown, maxRank: number): number[] | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Array(maxRank).fill(value);
  }
  if (!Array.isArray(value)) return null;
  const numeric = value.map(Number);
  if (!numeric.every(Number.isFinite)) return null;
  if (numeric.length === maxRank) return numeric;
  if (numeric.length > maxRank) return numeric.slice(1, maxRank + 1);
  if (numeric.length === 1) return Array(maxRank).fill(numeric[0]);
  return null;
}

function addValues(target: number[], values: number[]): void {
  for (let index = 0; index < target.length; index += 1) {
    target[index] += values[index] ?? 0;
  }
}

function statForPart(part: RawPart): AbilitySimulationStat | null {
  const stat = part.mStat;
  const formula = part.mStatFormula;
  if (stat === undefined && formula === undefined) return "abilityPower";
  if (stat === 2) {
    if (formula === 1) return "baseAttackDamage";
    return formula === 2 ? "bonusAttackDamage" : "totalAttackDamage";
  }
  if (formula === 1) return null;
  if (stat === 12) return formula === 2 ? "bonusHealth" : "maxHealth";
  if (stat === 1) return formula === 2 ? "bonusArmor" : "armor";
  if (stat === 6) return formula === 2 ? "bonusMagicResist" : "magicResist";
  return null;
}

function dataValue(
  source: CommunityDragonSpellData,
  name: unknown,
  maxRank: number
): number[] | null {
  return typeof name === "string"
    ? rankValues(source.DataValues?.[name], maxRank)
    : null;
}

function effectValue(
  source: CommunityDragonSpellData,
  index: unknown,
  maxRank: number
): number[] | null {
  if (typeof index !== "number") return null;
  const raw = source.effectBurn?.[index];
  if (typeof raw !== "string") return null;
  return rankValues(raw.split("/").map(Number), maxRank);
}

function multiplierValues(
  source: CommunityDragonSpellData,
  multiplier: unknown,
  maxRank: number
): number[] | null {
  if (multiplier === undefined) return Array(maxRank).fill(1);
  if (!isRecord(multiplier)) return null;
  if (typeof multiplier.mNumber === "number") {
    return rankValues(multiplier.mNumber, maxRank);
  }
  return dataValue(source, multiplier.mDataValue, maxRank);
}

function addTerm(
  terms: Map<AbilitySimulationStat, number[]>,
  stat: AbilitySimulationStat,
  values: number[]
): void {
  const current = terms.get(stat) ?? Array(values.length).fill(0);
  addValues(current, values);
  terms.set(stat, current);
}

function compileCalculation(
  id: string,
  raw: Record<string, unknown>,
  source: CommunityDragonSpellData,
  maxRank: number
): { calculation?: AbilitySimulationCalculation; unsupported: string[] } {
  const unsupported = new Set<string>();
  if (raw.__type !== "GameCalculation" || !Array.isArray(raw.mFormulaParts)) {
    return { unsupported: [String(raw.__type ?? "missing-calculation-type")] };
  }
  if (raw.mDisplayAsPercent === true) {
    return { unsupported: ["percent-calculation"] };
  }
  const base = Array(maxRank).fill(0) as number[];
  const terms = new Map<AbilitySimulationStat, number[]>();
  for (const value of raw.mFormulaParts) {
    if (!isRecord(value)) {
      unsupported.add("invalid-part");
      continue;
    }
    const part = value as RawPart;
    const type = String(part.__type ?? "missing-part-type");
    if (type === "NamedDataValueCalculationPart") {
      const values = dataValue(source, part.mDataValue, maxRank);
      if (values) addValues(base, values);
      else unsupported.add(type);
    } else if (type === "NumberCalculationPart") {
      const values = rankValues(part.mNumber, maxRank);
      if (values) addValues(base, values);
      else unsupported.add(type);
    } else if (type === "EffectValueCalculationPart") {
      const values = effectValue(source, part.mEffectIndex, maxRank);
      if (values) addValues(base, values);
      else unsupported.add(type);
    } else if (
      type === "StatByNamedDataValueCalculationPart" ||
      type === "StatByCoefficientCalculationPart"
    ) {
      const stat = statForPart(part);
      const values = type === "StatByNamedDataValueCalculationPart"
        ? dataValue(source, part.mDataValue, maxRank)
        : rankValues(part.mCoefficient, maxRank);
      if (stat && values) addTerm(terms, stat, values);
      else unsupported.add(type);
    } else if (type === "AbilityResourceByCoefficientCalculationPart") {
      unsupported.add(type);
    } else {
      unsupported.add(type);
    }
  }

  const multiplier = multiplierValues(source, raw.mMultiplier, maxRank);
  if (!multiplier) unsupported.add("unsupported-multiplier");
  if (unsupported.size > 0 || !multiplier) {
    return { unsupported: [...unsupported].sort() };
  }
  for (let index = 0; index < maxRank; index += 1) base[index] *= multiplier[index];
  const compiledTerms: AbilitySimulationTerm[] = [...terms.entries()].map(
    ([stat, coefficientsByRank]) => ({
      stat,
      coefficientsByRank: coefficientsByRank.map(
        (coefficient, index) => coefficient * multiplier[index]
      ),
    })
  );
  return {
    calculation: { id, kind: "damage", baseByRank: base, terms: compiledTerms },
    unsupported: [],
  };
}

function isDamageKey(key: string): boolean {
  return /(damage|dmg)/i.test(key) &&
    !/(reduction|taken|amp|percent|maxhealth|currenthealth|missinghealth|execute)/i.test(key);
}

export function compileAbilitySimulation(
  source: CommunityDragonSpellData | undefined,
  maxRank: number
): AbilitySimulation {
  const calculations = source?.mSpellCalculations;
  if (!source || !calculations || maxRank <= 0) {
    return { status: "unavailable", unsupportedPartTypes: [] };
  }
  const keys = Object.keys(calculations).filter(isDamageKey);
  const selected = [
    ...DAMAGE_KEY_PRIORITY.filter((key) => keys.includes(key)),
    ...keys.filter((key) => !DAMAGE_KEY_PRIORITY.includes(key)).sort(),
  ][0];
  if (!selected) return { status: "unavailable", unsupportedPartTypes: [] };
  const raw = calculations[selected];
  if (!isRecord(raw)) {
    return { status: "unsupported", unsupportedPartTypes: ["invalid-calculation"] };
  }
  const compiled = compileCalculation(selected, raw, source, maxRank);
  return compiled.calculation
    ? { status: "complete", primary: compiled.calculation, unsupportedPartTypes: [] }
    : { status: "unsupported", unsupportedPartTypes: compiled.unsupported };
}
