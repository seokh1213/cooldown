import type {
  AbilitySlot,
  AbilitySimulationCurve,
  AbilitySimulationExpr,
  AbilitySimulationStat,
} from "../../src/data/contracts/championData";
import {
  compressMatrix,
  dataValue,
  effectValue,
  isRecord,
  levelBreakpoints,
  levelInterpolation,
  levelMatrix,
  matrix,
  rankMatrix,
  rankValues,
  statForPart,
  UnsupportedFormulaError,
  LEVELS,
  type LeafContext,
  type Matrix,
} from "./ability-simulation-formula";

/**
 * 선형 모델이 거부하는 공식을 원본 모양 그대로 옮긴 트리.
 * 잎의 값은 아직 [rank][level] 행렬이며, 내보낼 때 압축한다.
 */
export type RawExpr =
  | { kind: "value"; value: Matrix }
  | { kind: "stat"; stat: AbilitySimulationStat; coefficient: Matrix }
  | { kind: "buffStacks"; buff: string; coefficient: Matrix; stackSource?: AbilitySlot }
  | { kind: "sum"; parts: RawExpr[] }
  | { kind: "product"; parts: RawExpr[] };

export interface ExpressionContext extends LeafContext {
  compileCalculation: (key: string, visited: Set<string>) => RawExpr;
  /** 이 스킬이 쓰는 중첩의 소유 슬롯. 정해지지 않았으면 슬롯 없이 표기된다. */
  stackSource?: AbilitySlot;
}

function everyCell(value: Matrix, predicate: (cell: number) => boolean): boolean {
  return value.every((row) => row.every(predicate));
}

/** 합에서 0, 곱에서 1 인 상수항은 읽는 사람에게 아무것도 알려주지 않으므로 지운다. */
function isConstant(node: RawExpr, target: number): boolean {
  return node.kind === "value" && everyCell(node.value, (cell) => cell === target);
}

function flatten(kind: "sum" | "product", parts: RawExpr[]): RawExpr[] {
  return parts.flatMap((part) => (part.kind === kind ? part.parts : [part]));
}

/** 음수 상수가 맨 앞에 오면 `-1 + 치명타 피해량` 으로 읽힌다. 덧셈이므로 뒤로 미룬다. */
function isNegativeConstant(node: RawExpr): boolean {
  return node.kind === "value" && everyCell(node.value, (cell) => cell < 0);
}

function sum(parts: RawExpr[], maxRank: number): RawExpr {
  const kept = flatten("sum", parts).filter((part) => !isConstant(part, 0));
  if (kept.length === 0) return { kind: "value", value: matrix(maxRank) };
  const ordered = [
    ...kept.filter((part) => !isNegativeConstant(part)),
    ...kept.filter(isNegativeConstant),
  ];
  return ordered.length === 1 ? ordered[0] : { kind: "sum", parts: ordered };
}

function product(parts: RawExpr[], maxRank: number): RawExpr {
  const kept = flatten("product", parts).filter((part) => !isConstant(part, 1));
  if (kept.some((part) => isConstant(part, 0))) return { kind: "value", value: matrix(maxRank) };
  if (kept.length === 0) return { kind: "value", value: matrix(maxRank, 1) };
  return kept.length === 1 ? kept[0] : { kind: "product", parts: kept };
}

function buffName(part: Record<string, unknown>): string {
  const name = part.mBuffName;
  return typeof name === "string" ? name : "";
}

export function compileExprPart(
  value: unknown,
  ctx: ExpressionContext,
  visited: Set<string>,
): RawExpr {
  if (!isRecord(value)) throw new UnsupportedFormulaError("invalid-part");
  const reference = value.mSpellCalculationKey;
  if (typeof reference === "string") return ctx.compileCalculation(reference, new Set(visited));

  const type = String(value.__type ?? "missing-part-type");
  const constant = (values: Matrix): RawExpr => ({ kind: "value", value: values });
  const inner: LeafContext = { source: ctx.source, maxRank: ctx.maxRank };

  if (type === "NamedDataValueCalculationPart") return constant(dataValue(inner, value.mDataValue));
  if (type === "NumberCalculationPart") {
    return constant(rankMatrix(rankValues(value.mNumber, ctx.maxRank)));
  }
  if (type === "EffectValueCalculationPart") return constant(effectValue(inner, value.mEffectIndex));
  if (type === "ByCharLevelBreakpointsCalculationPart") {
    return constant(levelMatrix(levelBreakpoints(value), ctx.maxRank));
  }
  if (type === "ByCharLevelInterpolationCalculationPart") {
    return constant(levelMatrix(levelInterpolation(value), ctx.maxRank));
  }
  if (type === "ByCharLevelFormulaCalculationPart") {
    if (!Array.isArray(value.values) || value.values.length < LEVELS) {
      throw new UnsupportedFormulaError(type);
    }
    return constant(levelMatrix(value.values.slice(0, LEVELS).map(Number), ctx.maxRank));
  }
  if (type === "StatByNamedDataValueCalculationPart" || type === "StatByCoefficientCalculationPart") {
    const coefficient = type === "StatByNamedDataValueCalculationPart"
      ? dataValue(inner, value.mDataValue)
      : rankMatrix(rankValues(value.mCoefficient, ctx.maxRank));
    return { kind: "stat", stat: statForPart(value), coefficient };
  }
  if (type === "AbilityResourceByCoefficientCalculationPart") {
    return {
      kind: "stat",
      stat: value.mStatFormula === 2 ? "bonusMana" : "maxMana",
      coefficient: rankMatrix(rankValues(value.mCoefficient, ctx.maxRank)),
    };
  }
  if (type === "BuffCounterByCoefficientCalculationPart") {
    return {
      kind: "buffStacks",
      buff: buffName(value),
      coefficient: rankMatrix(rankValues(value.mCoefficient, ctx.maxRank)),
      ...(ctx.stackSource ? { stackSource: ctx.stackSource } : {}),
    };
  }
  if (type === "BuffCounterByNamedDataValueCalculationPart") {
    return {
      kind: "buffStacks",
      buff: buffName(value),
      coefficient: dataValue(inner, value.mDataValue),
      ...(ctx.stackSource ? { stackSource: ctx.stackSource } : {}),
    };
  }
  if (type === "StatBySubPartCalculationPart") {
    // 스탯 하나에 하위식 전체가 계수로 붙는다. 곱으로 풀어 쓰면 같은 값이다.
    return product([
      { kind: "stat", stat: statForPart(value), coefficient: matrix(ctx.maxRank, 1) },
      compileExprPart(value.mSubpart, ctx, visited),
    ], ctx.maxRank);
  }
  if (type === "SumOfSubPartsCalculationPart") {
    if (!Array.isArray(value.mSubparts)) throw new UnsupportedFormulaError(type);
    return sum(value.mSubparts.map((part) => compileExprPart(part, ctx, visited)), ctx.maxRank);
  }
  if (type === "ProductOfSubPartsCalculationPart") {
    return product([
      compileExprPart(value.mPart1, ctx, visited),
      compileExprPart(value.mPart2, ctx, visited),
    ], ctx.maxRank);
  }
  throw new UnsupportedFormulaError(type);
}

export function compileExprMultiplier(
  value: unknown,
  ctx: ExpressionContext,
  visited: Set<string>,
): RawExpr | null {
  if (value === undefined) return null;
  if (!isRecord(value)) throw new UnsupportedFormulaError("unsupported-multiplier");
  return compileExprPart(value, ctx, visited);
}

export function hasBuffStacks(node: RawExpr): boolean {
  if (node.kind === "buffStacks") return true;
  if (node.kind === "sum" || node.kind === "product") return node.parts.some(hasBuffStacks);
  return false;
}

function curve(value: Matrix): AbilitySimulationCurve {
  const compressed = compressMatrix(value);
  if (compressed.axis === "rank") return { byRank: compressed.values };
  if (compressed.axis === "level") return { byLevel: compressed.values };
  return { byRankAndLevel: compressed.values };
}

export function serializeExpr(node: RawExpr): AbilitySimulationExpr {
  if (node.kind === "value") return { kind: "value", value: curve(node.value) };
  if (node.kind === "stat") {
    return { kind: "stat", stat: node.stat, coefficient: curve(node.coefficient) };
  }
  if (node.kind === "buffStacks") {
    return {
      kind: "buffStacks",
      buff: node.buff,
      coefficient: curve(node.coefficient),
      ...(node.stackSource ? { stackSource: node.stackSource } : {}),
    };
  }
  return { kind: node.kind, parts: node.parts.map(serializeExpr) };
}

export { sum as sumExpr, product as productExpr };
