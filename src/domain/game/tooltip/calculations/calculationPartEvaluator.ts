import { logger } from "@/shared/lib/logger";
import type { CalculationPart, SpellCalculationSubPart } from "./contracts";
import type { EvaluatorContext } from "./partContext";
import { type PartResult } from "./productPartEvaluator";

import {
  evaluateClampSubParts,
  evaluateProductOfSubParts,
  evaluateStatBySubPart,
  evaluateSumOfSubParts,
} from "./compositeParts";
import {
  evaluateByCharLevelBreakpoints,
  evaluateByCharLevelFormula,
  evaluateByCharLevelInterpolation,
  readLevelPair,
  readNamedBreakpoints,
} from "./levelParts";
import {
  evaluateAbilityResourceByCoefficient,
  evaluateBuffCounterByCoefficient,
  evaluateBuffCounterByNamedDataValue,
  evaluateCooldownMultiplier,
  evaluateEffectValue,
  evaluateNamedDataValue,
  evaluateNumber,
  evaluateStatByCoefficient,
  evaluateStatByNamedDataValue,
} from "./primitiveParts";

function evaluateReference(referenceKey: string, ctx: EvaluatorContext, visited: Set<string>): PartResult | null {
  try {
    const inner = ctx.evaluateCalculation(referenceKey, new Set(visited));
    if (inner.extraRanges?.length || inner.statMultiplier || inner.extraMultipliers?.length || inner.groupedParts?.length) {
      return { base: 0, statParts: [], groupedParts: [inner] };
    }
    return {
      base: inner.base,
      statParts: inner.statParts,
      isPercent: inner.isPercent,
      // 참조한 계산식이 레벨 범위면 그 표시를 잃지 않게 넘긴다 (유미 R 의 AllyHealingPerc)
      isLevelRange:
        Boolean(inner.isBreakpointRange || inner.isCharLevelRange) || undefined,
    };
  } catch (error) {
    logger.debug(`SpellCalculation reference "${referenceKey}" failed`, error);
    ctx.reportDrop?.({ reason: "unresolved-reference", detail: referenceKey });
    return null;
  }
}

export function evaluatePart(part: CalculationPart | undefined, ctx: EvaluatorContext, visited: Set<string>): PartResult | null {
  if (!part || typeof part !== "object" || !("__type" in part)) return null;
  const type = part.__type;
  if (!type) return null;
  const referenceKey = (part as SpellCalculationSubPart).mSpellCalculationKey;
  if (typeof referenceKey === "string" && referenceKey.length > 0) return evaluateReference(referenceKey, ctx, visited);
  if (type === "NamedDataValueCalculationPart") return evaluateNamedDataValue(part, ctx);
  if (type === "EffectValueCalculationPart") return evaluateEffectValue(part, ctx);
  if (type === "StatByNamedDataValueCalculationPart") return evaluateStatByNamedDataValue(part, ctx);
  if (type === "StatByCoefficientCalculationPart") return evaluateStatByCoefficient(part, ctx);
  if (type === "AbilityResourceByCoefficientCalculationPart") return evaluateAbilityResourceByCoefficient(part, ctx);
  if (type === "NumberCalculationPart") return evaluateNumber(part);
  if (type === "ByCharLevelBreakpointsCalculationPart") return evaluateByCharLevelBreakpoints(part);

  const levelPair = readLevelPair(part, ctx);
  if (levelPair) return levelPair;
  const namedBreakpoints = readNamedBreakpoints(part, ctx);
  if (namedBreakpoints) return namedBreakpoints;

  switch (type) {
    case "ByCharLevelFormulaCalculationPart": return evaluateByCharLevelFormula(part);
    case "ByCharLevelInterpolationCalculationPart": return evaluateByCharLevelInterpolation(part);
    case "SumOfSubPartsCalculationPart": return evaluateSumOfSubParts(part, ctx, sub => evaluatePart(sub, ctx, visited));
    case "ProductOfSubPartsCalculationPart": return evaluateProductOfSubParts(part, ctx, sub => evaluatePart(sub, ctx, visited));
    case "ClampSubPartsCalculationPart": return evaluateClampSubParts(part, ctx, sub => evaluatePart(sub, ctx, visited));
    case "StatBySubPartCalculationPart": return evaluateStatBySubPart(part, ctx, sub => evaluatePart(sub, ctx, visited));
    case "BuffCounterByNamedDataValueCalculationPart": return evaluateBuffCounterByNamedDataValue(part, ctx);
    case "BuffCounterByCoefficientCalculationPart": return evaluateBuffCounterByCoefficient(part);
    case "CooldownMultiplierCalculationPart": return evaluateCooldownMultiplier();
  }
  logger.debug(`Unsupported calculation part type "${type}"`, part);
  ctx.reportDrop?.({ reason: "unsupported-part", detail: type });
  return null;
}
