import type {
  AbilitySimulationStat,
} from "../../src/data/contracts/championData";
import type { CommunityDragonSpellData } from "../../src/lib/spellTooltipParser/types";

type RawPart = Record<string, unknown>;
type Matrix = number[][];

export interface LinearFormula {
  base: Matrix;
  terms: Map<AbilitySimulationStat, Matrix>;
}

export interface FormulaContext {
  source: CommunityDragonSpellData;
  maxRank: number;
  compileCalculation: (key: string, visited: Set<string>) => LinearFormula;
}

export class UnsupportedFormulaError extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

const LEVELS = 18;

function isRecord(value: unknown): value is RawPart {
  return typeof value === "object" && value !== null;
}

function matrix(maxRank: number, value = 0): Matrix {
  return Array.from({ length: maxRank }, () => Array(LEVELS).fill(value));
}

function rankValues(value: unknown, maxRank: number): number[] {
  if (typeof value === "number" && Number.isFinite(value)) return Array(maxRank).fill(value);
  if (!Array.isArray(value)) throw new UnsupportedFormulaError("invalid-rank-values");
  const numeric = value.map(Number);
  if (!numeric.every(Number.isFinite)) throw new UnsupportedFormulaError("invalid-rank-values");
  if (numeric.length === maxRank) return numeric;
  if (numeric.length > maxRank) return numeric.slice(1, maxRank + 1);
  if (numeric.length === 1) return Array(maxRank).fill(numeric[0]);
  throw new UnsupportedFormulaError("invalid-rank-values");
}

function rankMatrix(values: number[]): Matrix {
  return values.map((value) => Array(LEVELS).fill(value));
}

function levelMatrix(values: number[], maxRank: number): Matrix {
  return Array.from({ length: maxRank }, () => [...values]);
}

function valueFormula(values: Matrix): LinearFormula {
  return { base: values, terms: new Map() };
}

function dataValue(ctx: FormulaContext, name: unknown): Matrix {
  if (typeof name !== "string") throw new UnsupportedFormulaError("NamedDataValueCalculationPart");
  const entries = Object.entries(ctx.source.DataValues ?? {});
  const value = ctx.source.DataValues?.[name] ?? entries.find(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  )?.[1];
  return rankMatrix(rankValues(value, ctx.maxRank));
}

function effectValue(ctx: FormulaContext, index: unknown): Matrix {
  if (typeof index !== "number") throw new UnsupportedFormulaError("EffectValueCalculationPart");
  const raw = ctx.source.effectBurn?.[index];
  if (typeof raw !== "string") throw new UnsupportedFormulaError("EffectValueCalculationPart");
  return rankMatrix(rankValues(raw.split("/").map(Number), ctx.maxRank));
}

function statForPart(part: RawPart): AbilitySimulationStat {
  const stat = part.mStat;
  const formula = part.mStatFormula;
  if (stat === undefined && formula === undefined) return "abilityPower";
  if (stat === undefined && formula === 1) return "armor";
  if (stat === undefined && formula === 2) return "totalAttackDamage";
  if (stat === undefined && formula === 6) return "magicResist";
  if (stat === 2) {
    if (formula === 1) return "baseAttackDamage";
    return formula === 2 ? "bonusAttackDamage" : "totalAttackDamage";
  }
  if (stat === 4) return formula === 2 ? "bonusAttackSpeed" : "attackSpeed";
  if (stat === 7) return "moveSpeed";
  if (stat === 8) return "critChance";
  if (stat === 9) return formula === 2 ? "bonusCritDamage" : "critDamage";
  if (stat === 18) return "lifeSteal";
  if (stat === 29) return "lethality";
  if (formula === 1) throw new UnsupportedFormulaError("unsupported-stat-formula");
  if (stat === 12) return formula === 2 ? "bonusHealth" : "maxHealth";
  if (stat === 1) return formula === 2 ? "bonusArmor" : "armor";
  if (stat === 6) return formula === 2 ? "bonusMagicResist" : "magicResist";
  throw new UnsupportedFormulaError("unsupported-stat");
}

function levelBreakpoints(part: RawPart): number[] {
  const result = [Number(part.mLevel1Value) || 0];
  const breakpoints = Array.isArray(part.mBreakpoints)
    ? part.mBreakpoints.filter(isRecord)
    : [];
  for (let level = 2; level <= LEVELS; level += 1) {
    let value = result[level - 2];
    const active = breakpoints
      .filter((entry) => typeof entry.mLevel === "number" && level >= entry.mLevel)
      .sort((left, right) => Number(right.mLevel) - Number(left.mLevel))[0];
    value += typeof active?.mBonusPerLevelAtAndAfter === "number"
      ? active.mBonusPerLevelAtAndAfter
      : Number(part.mInitialBonusPerLevel) || 0;
    for (const entry of breakpoints) {
      if (typeof entry.mAdditionalBonusAtThisLevel !== "number") continue;
      if (entry.mLevel == null || entry.mLevel === level) value += entry.mAdditionalBonusAtThisLevel;
    }
    result.push(value);
  }
  return result;
}

function levelInterpolation(part: RawPart): number[] {
  const start = Number(part.mStartValue);
  const end = Number(part.mEndValue);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw new UnsupportedFormulaError("ByCharLevelInterpolationCalculationPart");
  }
  return Array.from({ length: LEVELS }, (_, index) =>
    start + ((end - start) * index) / (LEVELS - 1));
}

function addMatrix(left: Matrix, right: Matrix): Matrix {
  return left.map((row, rank) => row.map((value, level) => value + right[rank][level]));
}

function multiplyMatrix(left: Matrix, right: Matrix): Matrix {
  return left.map((row, rank) => row.map((value, level) => value * right[rank][level]));
}

function addFormula(left: LinearFormula, right: LinearFormula): LinearFormula {
  const terms = new Map(left.terms);
  for (const [stat, values] of right.terms) {
    terms.set(stat, terms.has(stat) ? addMatrix(terms.get(stat)!, values) : values);
  }
  return { base: addMatrix(left.base, right.base), terms };
}

function scaleFormula(formula: LinearFormula, factor: Matrix): LinearFormula {
  return {
    base: multiplyMatrix(formula.base, factor),
    terms: new Map([...formula.terms].map(([stat, values]) => [stat, multiplyMatrix(values, factor)])),
  };
}

function productFormula(left: LinearFormula, right: LinearFormula): LinearFormula {
  if (left.terms.size > 0 && right.terms.size > 0) {
    throw new UnsupportedFormulaError("nonlinear-product");
  }
  if (left.terms.size > 0) return scaleFormula(left, right.base);
  return scaleFormula(right, left.base);
}

function sumParts(parts: unknown[], ctx: FormulaContext, visited: Set<string>): LinearFormula {
  return parts.reduce<LinearFormula>(
    (total, part) => addFormula(total, compilePart(part, ctx, visited)),
    valueFormula(matrix(ctx.maxRank)),
  );
}

export function compilePart(
  value: unknown,
  ctx: FormulaContext,
  visited: Set<string>,
): LinearFormula {
  if (!isRecord(value)) throw new UnsupportedFormulaError("invalid-part");
  const reference = value.mSpellCalculationKey;
  if (typeof reference === "string") return ctx.compileCalculation(reference, new Set(visited));
  const type = String(value.__type ?? "missing-part-type");
  if (type === "NamedDataValueCalculationPart") return valueFormula(dataValue(ctx, value.mDataValue));
  if (type === "NumberCalculationPart") {
    return valueFormula(rankMatrix(rankValues(value.mNumber, ctx.maxRank)));
  }
  if (type === "EffectValueCalculationPart") return valueFormula(effectValue(ctx, value.mEffectIndex));
  if (type === "ByCharLevelBreakpointsCalculationPart") {
    return valueFormula(levelMatrix(levelBreakpoints(value), ctx.maxRank));
  }
  if (type === "ByCharLevelInterpolationCalculationPart") {
    return valueFormula(levelMatrix(levelInterpolation(value), ctx.maxRank));
  }
  if (type === "ByCharLevelFormulaCalculationPart") {
    if (!Array.isArray(value.values) || value.values.length < LEVELS) {
      throw new UnsupportedFormulaError(type);
    }
    return valueFormula(levelMatrix(value.values.slice(0, LEVELS).map(Number), ctx.maxRank));
  }
  if (type === "StatByNamedDataValueCalculationPart" || type === "StatByCoefficientCalculationPart") {
    const coefficients = type === "StatByNamedDataValueCalculationPart"
      ? dataValue(ctx, value.mDataValue)
      : rankMatrix(rankValues(value.mCoefficient, ctx.maxRank));
    return { base: matrix(ctx.maxRank), terms: new Map([[statForPart(value), coefficients]]) };
  }
  if (type === "AbilityResourceByCoefficientCalculationPart") {
    const stat = value.mStatFormula === 2 ? "bonusMana" : "maxMana";
    return {
      base: matrix(ctx.maxRank),
      terms: new Map([[stat, rankMatrix(rankValues(value.mCoefficient, ctx.maxRank))]]),
    };
  }
  if (type === "StatBySubPartCalculationPart") {
    const inner = compilePart(value.mSubpart, ctx, visited);
    if (inner.terms.size > 0) throw new UnsupportedFormulaError("nonlinear-stat-coefficient");
    return { base: matrix(ctx.maxRank), terms: new Map([[statForPart(value), inner.base]]) };
  }
  if (type === "SumOfSubPartsCalculationPart") {
    if (!Array.isArray(value.mSubparts)) throw new UnsupportedFormulaError(type);
    return sumParts(value.mSubparts, ctx, visited);
  }
  if (type === "ProductOfSubPartsCalculationPart") {
    return productFormula(
      compilePart(value.mPart1, ctx, visited),
      compilePart(value.mPart2, ctx, visited),
    );
  }
  throw new UnsupportedFormulaError(type);
}

export function compileMultiplier(value: unknown, ctx: FormulaContext, visited: Set<string>): Matrix {
  if (value === undefined) return matrix(ctx.maxRank, 1);
  if (!isRecord(value)) throw new UnsupportedFormulaError("unsupported-multiplier");
  const formula = compilePart(value, ctx, visited);
  if (formula.terms.size > 0) throw new UnsupportedFormulaError("nonlinear-multiplier");
  return formula.base;
}

function allRowsEqual(value: Matrix): boolean {
  return value.every((row) => row.every((cell, index) => cell === value[0][index]));
}

function allColumnsEqual(value: Matrix): boolean {
  return value.every((row) => row.every((cell) => cell === row[0]));
}

export type CompressedMatrix =
  | { axis: "rank"; values: number[] }
  | { axis: "level"; values: number[] }
  | { axis: "rankLevel"; values: number[][] };

export function compressMatrix(value: Matrix): CompressedMatrix {
  if (allColumnsEqual(value)) return { axis: "rank", values: value.map((row) => row[0]) };
  if (allRowsEqual(value)) return { axis: "level", values: [...value[0]] };
  return { axis: "rankLevel", values: value };
}

export function multiplyFormula(formula: LinearFormula, factor: Matrix): LinearFormula {
  return scaleFormula(formula, factor);
}
