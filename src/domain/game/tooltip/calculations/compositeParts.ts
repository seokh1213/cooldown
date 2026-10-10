import { logger } from "@/shared/lib/logger";
import { getStatIcon, getStatName } from "../formatting/statNames";
import type {
  CalculationPart,
  ClampSubPartsCalculationPart,
  ProductOfSubPartsCalculationPart,
  StatBySubPartCalculationPart,
  SumOfSubPartsCalculationPart,
  Value,
} from "./contracts";
import type { EvaluatorContext } from "./partContext";
import { evaluateProductPart, type PartResult } from "./productPartEvaluator";
import { add, isVector } from "./values";

/**
 * 하위 결과의 base 를 더한다. 레벨 범위 항은 따로 모아 끝에서 더하고, 결과가 레벨 범위인지 알린다.
 * 랭크 벡터와 레벨 범위는 축이 달라 더할 수 없으므로 던진다.
 */
function sumBases(results: readonly PartResult[]): { base: Value; isLevelRange: boolean } {
  let rankBase: Value = 0;
  let levelBase: Value = 0;
  let hasLevelRange = false;
  for (const result of results) {
    if (result.isLevelRange) {
      levelBase = add(levelBase, result.base);
      hasLevelRange = true;
    } else {
      rankBase = add(rankBase, result.base);
    }
  }
  if (!hasLevelRange) return { base: rankBase, isLevelRange: false };
  if (isVector(rankBase)) throw new Error("rank values and a level range cannot be summed");
  const base = add(rankBase, levelBase);
  return { base, isLevelRange: isVector(base) };
}
export function evaluateSumOfSubParts(part: CalculationPart, ctx: EvaluatorContext, evaluate: (part: CalculationPart | undefined) => PartResult | null): PartResult | null {
  const subparts = (part as SumOfSubPartsCalculationPart).mSubparts ?? [];
  if (subparts.length === 0) return null;

  const results: PartResult[] = [];
  for (const sub of subparts) {
    const result = evaluate(sub);
    // 항 하나라도 못 구하면 합 자체가 틀린다
    if (!result) return null;
    results.push(result);
  }
  try {
    const { base, isLevelRange } = sumBases(results);
    return {
      base,
      statParts: results.flatMap((result) => result.statParts),
      groupedParts: results.flatMap((result) => result.groupedParts ?? []),
      ...(isLevelRange ? { isLevelRange: true } : {}),
    };
  } catch (error) {
    logger.debug("SumOfSubPartsCalculationPart: 합산 실패", error);
    ctx.reportDrop?.({ reason: "sub-sum-mismatch" });
    return null;
  }
}

export function evaluateProductOfSubParts(part: CalculationPart, ctx: EvaluatorContext, evaluate: (part: CalculationPart | undefined) => PartResult | null): PartResult | null {
  return evaluateProductPart(
    part as ProductOfSubPartsCalculationPart,
    (sub) => evaluate(sub as CalculationPart),
    ctx.reportDrop,
  );
}

export function evaluateClampSubParts(part: CalculationPart, ctx: EvaluatorContext, evaluate: (part: CalculationPart | undefined) => PartResult | null): PartResult | null {
  const clamp = part as ClampSubPartsCalculationPart;
  const results: PartResult[] = [];
  for (const sub of clamp.mSubparts ?? []) {
    const result = evaluate(sub);
    if (!result) return null;
    if (result.groupedParts?.length) {
      ctx.reportDrop?.({ reason: "unsupported-part", detail: part.__type });
      return null;
    }
    // 스탯 비율은 런타임 스탯 없이 clamp 할 수 없어 버린다
    if (result.statParts.length > 0) {
      logger.debug("ClampSubPartsCalculationPart: 스탯 항 제외 (clamp 불가)", sub);
      ctx.reportDrop?.({ reason: "clamp-stat-dropped" });
    }
    results.push(result);
  }
  if (results.length === 0) return null;
  let summed: { base: Value; isLevelRange: boolean };
  try {
    summed = sumBases(results);
  } catch (error) {
    logger.debug("ClampSubPartsCalculationPart: 합산 실패", error);
    ctx.reportDrop?.({ reason: "sub-sum-mismatch" });
    return null;
  }
  const { base } = summed;

  const limit = (value: number): number => {
    let next = value;
    if (typeof clamp.mFloor === "number") next = Math.max(next, clamp.mFloor);
    if (typeof clamp.mCeiling === "number") next = Math.min(next, clamp.mCeiling);
    return next;
  };
  return {
    base: isVector(base) ? base.map(limit) : limit(base as number),
    statParts: [],
    ...(summed.isLevelRange ? { isLevelRange: true } : {}),
  };
}

export function evaluateStatBySubPart(part: CalculationPart, ctx: EvaluatorContext, evaluate: (part: CalculationPart | undefined) => PartResult | null): PartResult | null {
  const statSubPart = part as StatBySubPartCalculationPart;
  const inner = evaluate(statSubPart.mSubpart);
  if (!inner) return null;
  if (inner.groupedParts?.length) {
    ctx.reportDrop?.({ reason: "unsupported-part", detail: part.__type });
    return null;
  }
  if (inner.statParts.length > 0) {
    logger.debug("StatBySubPartCalculationPart: 내부 스탯 비율은 표기 불가", part);
    ctx.reportDrop?.({ reason: "stat-subpart-dropped" });
  }
  return {
    base: 0,
    statParts: [
      {
        name: getStatName(statSubPart.mStat, statSubPart.mStatFormula, ctx.lang),
        icon: getStatIcon(statSubPart.mStat),
        ratio: inner.base,
        isCoefficient: true,
        ...(inner.isLevelRange ? { isLevelRange: true } : {}),
      },
    ],
  };
}
