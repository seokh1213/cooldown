import type { ProductOfSubPartsCalculationPart, StatPart, Value } from "./types";
import { logger } from "@/lib/logger";
import { mul } from "./valueUtils";

/** 계산 파트 하나의 평가 결과 */
export interface PartResult {
  base: Value;
  statParts: StatPart[];
  /** base 가 [1레벨값, 18레벨값] 범위인지 여부 */
  isLevelRange?: boolean;
}

export type PartEvaluator = (part: unknown) => PartResult | null;

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
