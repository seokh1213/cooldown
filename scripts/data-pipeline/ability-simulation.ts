import type {
  AbilitySimulation,
  AbilitySimulationCalculation,
  AbilitySimulationExpression,
} from "../../src/data/contracts/championData";
import type { CommunityDragonSpellData } from "../../src/lib/spellTooltipParser/types";
import {
  compileMultiplier,
  compilePart,
  compressMatrix,
  multiplyFormula,
  UnsupportedFormulaError,
  type FormulaContext,
  type LinearFormula,
  type CompressedMatrix,
} from "./ability-simulation-formula";
import {
  compileExprMultiplier,
  compileExprPart,
  hasBuffStacks,
  productExpr,
  serializeExpr,
  sumExpr,
  type ExpressionContext,
  type RawExpr,
} from "./ability-simulation-expression";

type RawCalculation = Record<string, unknown>;
type DamageType = AbilitySimulationCalculation["damageType"];

const DAMAGE_KEY_PRIORITY = [
  "TotalDamage",
  "Damage",
  "TotalDmg",
  "SingleFireDamage",
  "QMissileDamage",
];

function isRecord(value: unknown): value is RawCalculation {
  return typeof value === "object" && value !== null;
}

function isDamageKey(key: string): boolean {
  return /(damage|dmg)/i.test(key) &&
    !/(reduction|taken|amplification|damageamp|dmgamp|percent|maxhealth|currenthealth|missinghealth|execute|minion|monster)/i.test(key);
}

function damageKeys(
  calculations: Record<string, unknown>,
  preferred: readonly string[] = [],
): string[] {
  const keys = Object.keys(calculations).filter(isDamageKey);
  const isPrimaryName = (key: string) => [
    "damage",
    "totaldamage",
    "dmg",
    "totaldmg",
  ].includes(key.toLowerCase().replace(/^calc_/, ""));
  return [
    ...preferred.filter((key) => keys.includes(key) && isPrimaryName(key)),
    ...preferred.filter((key) => keys.includes(key)),
    ...DAMAGE_KEY_PRIORITY.filter((key) => keys.includes(key)),
    ...keys.filter((key) => !DAMAGE_KEY_PRIORITY.includes(key)).sort(),
  ].filter((key, index, all) => all.indexOf(key) === index);
}

interface CompiledFormula {
  formula: LinearFormula;
  isPercent: boolean;
}

function addFormula(left: LinearFormula, right: LinearFormula): LinearFormula {
  const addMatrix = (a: number[][], b: number[][]) => a.map((row, rank) =>
    row.map((value, level) => value + b[rank][level]));
  const terms = new Map(left.terms);
  for (const [stat, values] of right.terms) {
    terms.set(stat, terms.has(stat) ? addMatrix(terms.get(stat)!, values) : values);
  }
  return { base: addMatrix(left.base, right.base), terms };
}

function serializeBase(curve: CompressedMatrix): Pick<
  AbilitySimulationCalculation,
  "baseByRank" | "baseByLevel" | "baseByRankAndLevel"
> {
  if (curve.axis === "rank") return { baseByRank: curve.values };
  if (curve.axis === "level") return { baseByLevel: curve.values };
  return { baseByRankAndLevel: curve.values };
}

function serializeCoefficients(curve: CompressedMatrix) {
  if (curve.axis === "rank") return { coefficientsByRank: curve.values };
  if (curve.axis === "level") return { coefficientsByLevel: curve.values };
  return { coefficientsByRankAndLevel: curve.values };
}

function compileFormula(
  calculations: Record<string, unknown>,
  source: CommunityDragonSpellData,
  maxRank: number,
  key: string,
  visited = new Set<string>(),
): CompiledFormula {
  if (visited.has(key)) throw new UnsupportedFormulaError("circular-calculation-reference");
  const raw = calculations[key];
  if (!isRecord(raw)) throw new UnsupportedFormulaError("invalid-calculation");
  const nextVisited = new Set(visited).add(key);
  const ctx: FormulaContext = {
    source,
    maxRank,
    compileCalculation: (reference, references) =>
      compileFormula(calculations, source, maxRank, reference, references).formula,
  };

  if (raw.__type === "GameCalculationConditional") {
    const target = raw.mDefaultGameCalculation ?? raw.mConditionalGameCalculation;
    if (typeof target !== "string") throw new UnsupportedFormulaError("GameCalculationConditional");
    return compileFormula(calculations, source, maxRank, target, nextVisited);
  }
  if (raw.__type === "GameCalculationModified") {
    if (typeof raw.mModifiedGameCalculation !== "string") {
      throw new UnsupportedFormulaError("GameCalculationModified");
    }
    const inner = compileFormula(
      calculations,
      source,
      maxRank,
      raw.mModifiedGameCalculation,
      nextVisited,
    );
    return {
      formula: multiplyFormula(
        inner.formula,
        compileMultiplier(raw.mMultiplier, ctx, nextVisited),
      ),
      isPercent: inner.isPercent,
    };
  }
  if (raw.__type !== "GameCalculation" || !Array.isArray(raw.mFormulaParts)) {
    throw new UnsupportedFormulaError(String(raw.__type ?? "missing-calculation-type"));
  }
  let formula: LinearFormula = {
    base: Array.from({ length: maxRank }, () => Array(18).fill(0)),
    terms: new Map(),
  };
  for (const part of raw.mFormulaParts) {
    formula = addFormula(formula, compilePart(part, ctx, nextVisited));
  }
  return {
    formula: multiplyFormula(formula, compileMultiplier(raw.mMultiplier, ctx, nextVisited)),
    isPercent: raw.mDisplayAsPercent === true,
  };
}

interface CompiledExpression {
  expr: RawExpr;
  isPercent: boolean;
}

/**
 * compileFormula 와 같은 트리를 돌지만 선형으로 접지 않고 모양을 보존한다.
 * 곱이 양쪽에 스탯을 물고 있어도 거부하지 않는 것이 유일한 차이다.
 */
function compileExpression(
  calculations: Record<string, unknown>,
  source: CommunityDragonSpellData,
  maxRank: number,
  key: string,
  visited = new Set<string>(),
): CompiledExpression {
  if (visited.has(key)) throw new UnsupportedFormulaError("circular-calculation-reference");
  const raw = calculations[key];
  if (!isRecord(raw)) throw new UnsupportedFormulaError("invalid-calculation");
  const nextVisited = new Set(visited).add(key);
  const ctx: ExpressionContext = {
    source,
    maxRank,
    compileCalculation: (reference, references) =>
      compileExpression(calculations, source, maxRank, reference, references).expr,
  };

  if (raw.__type === "GameCalculationConditional") {
    const target = raw.mDefaultGameCalculation ?? raw.mConditionalGameCalculation;
    if (typeof target !== "string") throw new UnsupportedFormulaError("GameCalculationConditional");
    return compileExpression(calculations, source, maxRank, target, nextVisited);
  }
  if (raw.__type === "GameCalculationModified") {
    if (typeof raw.mModifiedGameCalculation !== "string") {
      throw new UnsupportedFormulaError("GameCalculationModified");
    }
    const inner = compileExpression(
      calculations,
      source,
      maxRank,
      raw.mModifiedGameCalculation,
      nextVisited,
    );
    const multiplier = compileExprMultiplier(raw.mMultiplier, ctx, nextVisited);
    return {
      expr: multiplier ? productExpr([inner.expr, multiplier], maxRank) : inner.expr,
      isPercent: inner.isPercent,
    };
  }
  if (raw.__type !== "GameCalculation" || !Array.isArray(raw.mFormulaParts)) {
    throw new UnsupportedFormulaError(String(raw.__type ?? "missing-calculation-type"));
  }
  const body = sumExpr(
    raw.mFormulaParts.map((part) => compileExprPart(part, ctx, nextVisited)),
    maxRank,
  );
  const multiplier = compileExprMultiplier(raw.mMultiplier, ctx, nextVisited);
  return {
    expr: multiplier ? productExpr([body, multiplier], maxRank) : body,
    isPercent: raw.mDisplayAsPercent === true,
  };
}

function buildExpression(
  id: string,
  compiled: CompiledExpression,
  damageType: DamageType,
  healthScaling: AbilitySimulationCalculation["targetHealthScaling"] | null,
): AbilitySimulationExpression {
  if (compiled.isPercent && !healthScaling) {
    throw new UnsupportedFormulaError("percent-calculation");
  }
  return {
    id,
    kind: "damage",
    damageType,
    ...(compiled.isPercent ? { targetHealthScaling: healthScaling! } : {}),
    root: serializeExpr(compiled.expr),
    requiresBuffStacks: hasBuffStacks(compiled.expr),
  };
}

function targetHealthScaling(
  tooltip: string,
): AbilitySimulationCalculation["targetHealthScaling"] | null {
  const text = tooltip.replace(/<[^>]*>/g, " ").toLowerCase();
  if (/(missing health|잃은 체력|已损失生命值)/i.test(text)) return "missing";
  if (/(current health|현재 체력|当前生命值)/i.test(text)) return "current";
  if (/(max(?:imum)? health|최대 체력|最大生命值)/i.test(text)) return "max";
  return null;
}

function buildCalculation(
  id: string,
  compiled: CompiledFormula,
  damageType: DamageType,
  healthScaling: AbilitySimulationCalculation["targetHealthScaling"] | null,
): AbilitySimulationCalculation {
  if (compiled.isPercent && !healthScaling) {
    throw new UnsupportedFormulaError("percent-calculation");
  }
  return {
    id,
    kind: "damage",
    damageType,
    ...(compiled.isPercent ? { targetHealthScaling: healthScaling! } : {}),
    ...serializeBase(compressMatrix(compiled.formula.base)),
    terms: [...compiled.formula.terms].map(([stat, coefficients]) => ({
      stat,
      ...serializeCoefficients(compressMatrix(coefficients)),
    })),
  };
}

export function compileAbilitySimulation(
  source: CommunityDragonSpellData | undefined,
  maxRank: number,
  damageType: DamageType = "unknown",
  tooltip = "",
): AbilitySimulation {
  const calculations = source?.mSpellCalculations;
  if (!source || !calculations || maxRank <= 0) {
    return { status: "unavailable", unsupportedPartTypes: [] };
  }
  const candidates = damageKeys(
    calculations,
    source.preferredSimulationCalculationKeys,
  );
  if (candidates.length === 0) return { status: "unavailable", unsupportedPartTypes: [] };
  const unsupported = new Set<string>();
  const healthScaling = targetHealthScaling(tooltip);
  for (const candidate of candidates) {
    try {
      const compiled = compileFormula(calculations, source, maxRank, candidate);
      return {
        status: "complete",
        primary: buildCalculation(
          candidate,
          compiled,
          source.simulationCalculationDamageTypes?.[candidate] ?? damageType,
          healthScaling,
        ),
        unsupportedPartTypes: [],
      };
    } catch (error) {
      unsupported.add(error instanceof UnsupportedFormulaError
        ? error.reason
        : "invalid-calculation");
    }
  }
  // 선형으로 접히지 않는다. 게임이 하듯 공식 트리를 그대로 싣고 평가는 뒤로 미룬다.
  for (const candidate of candidates) {
    try {
      const compiled = compileExpression(calculations, source, maxRank, candidate);
      return {
        status: "expression",
        expression: buildExpression(
          candidate,
          compiled,
          source.simulationCalculationDamageTypes?.[candidate] ?? damageType,
          healthScaling,
        ),
        unsupportedPartTypes: [...unsupported].sort(),
      };
    } catch {
      // 다음 후보를 본다. 사유는 이미 선형 시도에서 모았다.
    }
  }
  return { status: "unsupported", unsupportedPartTypes: [...unsupported].sort() };
}
