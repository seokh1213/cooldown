import type { ProductOfSubPartsCalculationPart, StatPart, Value } from "./types";
import { logger } from "@/lib/logger";
import { mul } from "./valueUtils";

/** 계산 파트 하나의 평가 결과 */
export interface PartResult {
  base: Value;
  statParts: StatPart[];
  /** base 가 [1레벨값, 18레벨값] 범위인지 여부 */
  isLevelRange?: boolean;
  /** base 를 퍼센트로 적어야 하는지 여부 (참조한 계산식의 mDisplayAsPercent) */
  isPercent?: boolean;
}

export type PartEvaluator = (part: unknown) => PartResult | null;

/** 아이템·룬 없이는 값이 0 인 스탯 (치명타 확률, 생명력 흡수, 물리 관통력) */
const ZERO_WITHOUT_ITEMS_STATS = new Set([8, 18, 29]);

const STAT_PART_TYPES = new Set([
  "StatByCoefficientCalculationPart",
  "StatByNamedDataValueCalculationPart",
  "StatBySubPartCalculationPart",
]);

/**
 * 상수항 없이 스탯에만 비례해서, 기본 스탯만으로는 0 이 되는 항인지 본다.
 *
 * 합(Sum)이 끼면 `치명타 피해량 - 1` 처럼 상수가 섞여 0 이 아니게 되므로
 * 스탯 파트와 그 곱만 인정한다.
 */
function isZeroWithoutItems(part: unknown): boolean {
  if (typeof part !== "object" || part === null) return false;
  const record = part as Record<string, unknown>;
  const type = record.__type;

  if (type === "ProductOfSubPartsCalculationPart") {
    return isZeroWithoutItems(record.mPart1) || isZeroWithoutItems(record.mPart2);
  }
  if (typeof type !== "string" || !STAT_PART_TYPES.has(type)) return false;

  // mStatFormula 2 는 "추가" 스탯이라 기본값이 0 이다.
  if (record.mStatFormula === 2) return true;
  return (
    typeof record.mStat === "number" && ZERO_WITHOUT_ITEMS_STATS.has(record.mStat)
  );
}

/**
 * mPart1 × mPart2
 *
 * 서브 파트에 Sum/Clamp 같은 중첩 파트도 오므로 평가를 호출부에 위임한다.
 * (a + Σsa)(b + Σsb) 는 스탯끼리의 곱을 표기할 수 없어
 * a·b + Σ(sa·b) + Σ(sb·a) 까지만 전개한다.
 */
export function evaluateProductPart(
  part: ProductOfSubPartsCalculationPart,
  evaluatePart: PartEvaluator,
): PartResult | null {
  const left = evaluatePart(part.mPart1);
  const right = evaluatePart(part.mPart2);
  if (!left || !right) return null;

  // 스탯 × 스탯은 교차항을 버리면 부호까지 틀어진다. 표기 불가로 둔다.
  if (left.statParts.length > 0 && right.statParts.length > 0) {
    // 다만 한쪽이 아이템 없이는 0인 스탯(치명타 확률 등)이면 곱도 0이다.
    // 루시안 R 의 `1 + 치명타확률 × (치명타피해량 - 1)` 같은 기댓값 항이
    // 여기 해당한다. 0 으로 확정할 수 있으니 계산 전체를 버리지 않는다.
    if (isZeroWithoutItems(part.mPart1) || isZeroWithoutItems(part.mPart2)) {
      return { base: 0, statParts: [] };
    }
    logger.debug("ProductOfSubPartsCalculationPart: 스탯끼리의 곱은 표기 불가", part);
    return null;
  }

  try {
    return {
      base: mul(left.base, right.base),
      statParts: [
        ...left.statParts.map((sp) => ({ ...sp, ratio: mul(sp.ratio, right.base) })),
        ...right.statParts.map((sp) => ({ ...sp, ratio: mul(sp.ratio, left.base) })),
      ],
    };
  } catch (error) {
    logger.debug("ProductOfSubPartsCalculationPart: 곱셈 실패", error);
    return null;
  }
}
