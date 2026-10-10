import type { ParseResult } from "../contracts";
import type { CalcResult } from "./contracts";
import { add, mul } from "./values";

function numericOnly(result: CalcResult): boolean {
  return result.statParts.length === 0 && !result.extraRanges?.length && !result.groupedParts?.length;
}

/** 배율은 합의 각 항에 곱하고, 이미 붙어 있는 스탯 배율은 그대로 둔다. */
export function scaleCalculationResult(result: CalcResult, factor: number): CalcResult {
  if (factor === 0) return { base: 0, statParts: [], isPercent: result.isPercent, showZero: true };
  return {
    ...result,
    base: mul(result.base, factor),
    statParts: result.statParts.map((part) => ({ ...part, ratio: mul(part.ratio, factor) })),
    showZero: result.showZero || numericOnly(result),
    ...(result.extraRanges ? { extraRanges: result.extraRanges.map((range) => mul(range, factor)) } : {}),
    ...(result.groupedParts ? { groupedParts: result.groupedParts.map((part) => scaleCalculationResult(part, factor)) } : {}),
  };
}

export function applyCalculationFormula(result: CalcResult, parsed: ParseResult): CalcResult | null {
  if (parsed.type !== "formula" || !parsed.operator || parsed.operand == null) return result;
  const { operator, operand } = parsed;
  if (!Number.isFinite(operand) || (operator === "/" && operand === 0)) return null;
  if (operator === "*" || operator === "/") {
    return scaleCalculationResult(result, operator === "*" ? operand : 1 / operand);
  }
  const offset = operator === "+" ? operand : -operand;
  // (a × 배율) + b의 b를 안쪽 base에 더하면 b까지 배율이 붙는다.
  if (result.statMultiplier || result.extraMultipliers?.length) {
    return {
      base: offset,
      statParts: [],
      groupedParts: [result],
      isPercent: result.isPercent,
    };
  }
  return { ...result, base: add(result.base, offset), showZero: result.showZero || numericOnly(result) };
}
