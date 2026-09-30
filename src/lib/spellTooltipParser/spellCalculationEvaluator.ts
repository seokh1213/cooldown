import type { ChampionSpell } from "@/types";
import { logger } from "@/lib/logger";
import { binHashKey } from "./binHash";
import { getDataValueByName } from "./dataValueUtils";
import type { PartResult } from "./productPartEvaluator";
import type {
  CalcMultiplier,
  CalcResult,
  CalculationPart,
  CommunityDragonSpellData,
  GameCalculation,
  GameCalculationConditional,
  GameCalculationModified,
  SpellCalculation,
  StatPart,
  TooltipLocale,
  Value,
} from "./types";
import { add, isVector, mul } from "./valueUtils";
import {
  evaluatePart,
  evaluateRange,
  type DataValueEvaluator,
  type EvaluatorContext,
} from "./calculationPartEvaluator";

function createDataValueEvaluator(
  dataValues: CommunityDragonSpellData["DataValues"],
  maxRank: number,
): DataValueEvaluator {
  return (name) => {
    if (!name || typeof name !== "string") {
      logger.debug(`DataValue name is invalid: ${name}`);
      return null;
    }
    if (!dataValues) {
      logger.debug("dataValues is undefined");
      return null;
    }
    const value = getDataValueByName(dataValues, name, maxRank);
    if (value == null) logger.debug(`DataValue "${name}" missing`);
    return value;
  };
}

/**
 * 레벨 브레이크포인트를 1~18레벨 값으로 펼친다.
 * - mAdditionalBonusAtThisLevel: 그 레벨에서 한 번 더해지는 값
 * - mBonusPerLevelAtAndAfter: 그 레벨부터 레벨당 붙는 증가량.
 *   이 필드가 없는 브레이크포인트는 "증가 종료" 를 뜻해 0 으로 덮어쓴다.
 */
function resolveMultiplier(
  multiplier: CalcMultiplier | undefined,
  ctx: EvaluatorContext,
  visited: Set<string>,
): PartResult | null {
  if (!multiplier) return null;
  if (multiplier.__type) {
    return evaluatePart(multiplier as unknown as CalculationPart, ctx, visited);
  }
  if (multiplier.mDataValue) {
    const value = ctx.evaluateDataValue(multiplier.mDataValue);
    return value == null ? null : { base: value, statParts: [] };
  }
  if (multiplier.mNumber != null) {
    return { base: multiplier.mNumber, statParts: [] };
  }
  return null;
}

interface ScaleTarget {
  base: Value;
  statParts: StatPart[];
  extraRanges?: Value[];
  /** base 가 [1레벨값, 18레벨값] 범위인지 여부 */
  isLevelRange?: boolean;
}

/**
 * 숫자 배율을 base·스탯 계수·레벨 범위 항에 곱해 접는다.
 *
 * 랭크 벡터(길이 = 최대 랭크)와 레벨 범위(길이 2, [1레벨, 18레벨])는 축이 달라
 * 원소끼리 곱하면 안 된다. 한쪽이 랭크, 다른 쪽이 레벨이면 접지 않고 null 을 돌려
 * 호출부가 "× 배율" 로 따로 적게 한다. 길이가 우연히 같아도(최대 랭크 2) 섞지 않는다.
 */
function scaleResult(
  target: ScaleTarget,
  multiplier: PartResult,
): { base: Value; statParts: StatPart[]; extraRanges?: Value[] } | null {
  const scale = multiplier.base;
  if (multiplier.isLevelRange) {
    // 레벨 범위 배율은 레벨 범위 base 나 상수에만 접는다.
    // 스탯 계수에 곱하면 "15.6/19.2% 주문력" 처럼 랭크 값으로 읽힌다.
    const baseIsRank = isVector(target.base) && !target.isLevelRange;
    if (baseIsRank || target.statParts.length > 0 || target.extraRanges) return null;
  } else if (isVector(scale)) {
    if (target.isLevelRange || target.extraRanges) return null;
  }
  try {
    return {
      base: mul(target.base, scale),
      statParts: target.statParts.map((part) => ({
        ...part,
        ratio: mul(part.ratio, scale),
      })),
      extraRanges: target.extraRanges?.map((range) => mul(range, scale)),
    };
  } catch (error) {
    logger.warn("multiplier 적용 실패", error);
    return null;
  }
}

function evaluateGameCalculation(
  key: string,
  calc: GameCalculation,
  ctx: EvaluatorContext,
  visited: Set<string>,
): CalcResult {
  const range = evaluateRange(calc);
  if (range) return range;

  // 랭크 값과 레벨 범위([1레벨, 18레벨])는 따로 모은다.
  // 한 줄로 더하면 항 순서에 따라 결과가 갈린다. 레벨 범위가 먼저 오면
  // 뒤에 오는 랭크 벡터가 길이 불일치로 버려졌다 (우디르 W 각성 보호막의 ShieldBase).
  let rankBase: Value = 0;
  let levelBase: Value = 0;
  const statParts: StatPart[] = [];
  let hasLevelRange = false;

  for (const part of calc.mFormulaParts ?? []) {
    const evaluated = evaluatePart(part, ctx, visited);
    if (!evaluated) {
      // 해석 못 한 항은 그 항만 비우고 나머지 수치는 그대로 보여준다
      logger.debug("GameCalculation: 해석 못 한 항 생략", (part as { __type?: string }).__type);
      continue;
    }
    try {
      if (evaluated.isLevelRange) {
        levelBase = add(levelBase, evaluated.base);
        hasLevelRange = true;
      } else {
        rankBase = add(rankBase, evaluated.base);
      }
    } catch (error) {
      logger.warn(`GameCalculation "${key}": 항 합산 실패`, error);
      continue;
    }
    statParts.push(...evaluated.statParts);
  }

  // 레벨 범위와 랭크 값은 길이가 다르면 못 더한다. 버리지 말고 옆에 붙인다.
  let base: Value = rankBase;
  const extraRanges: Value[] = [];
  if (hasLevelRange) {
    try {
      base = add(rankBase, levelBase);
    } catch {
      extraRanges.push(levelBase);
      hasLevelRange = false;
    }
  }

  let statMultiplier: PartResult | undefined;
  const multiplier = resolveMultiplier(calc.mMultiplier, ctx, visited);
  if (multiplier && multiplier.statParts.length > 0) {
    // 스탯 의존 배율은 스탯 0 을 가정한 숫자로 접지 않고 따로 노출한다
    statMultiplier = multiplier;
  } else if (multiplier) {
    const scaled = scaleResult(
      {
        base,
        statParts,
        extraRanges: extraRanges.length > 0 ? extraRanges : undefined,
        isLevelRange: hasLevelRange,
      },
      multiplier,
    );
    if (scaled) {
      base = scaled.base;
      statParts.splice(0, statParts.length, ...scaled.statParts);
      extraRanges.splice(0, extraRanges.length, ...(scaled.extraRanges ?? []));
      if (multiplier.isLevelRange && isVector(base)) hasLevelRange = true;
    } else {
      // 레벨 범위 × 랭크 배율처럼 한 벡터로 접을 수 없으면 "× 배율" 로 남긴다
      // (일라오이 Q 의 TentacleDamageTotal: (9 ~ 180) × (1 + 10/15/20/25/30%))
      statMultiplier = multiplier;
    }
  }

  return {
    base,
    statParts,
    isPercent: Boolean(calc.mDisplayAsPercent),
    isBreakpointRange: hasLevelRange || undefined,
    extraRanges: extraRanges.length > 0 ? extraRanges : undefined,
    statMultiplier,
    precision:
      typeof calc.mPrecision === "number" && calc.mPrecision >= 0
        ? calc.mPrecision + 1
        : undefined,
  };
}

export function evaluateSpellCalculation(input: {
  key: string;
  spell: ChampionSpell;
  data: CommunityDragonSpellData;
  lang: TooltipLocale;
}): CalcResult {
  if (!input.data.mSpellCalculations) {
    throw new Error("mSpellCalculations is undefined");
  }
  const calculations: Record<string, SpellCalculation> = input.data.mSpellCalculations;
  const evaluateDataValue = createDataValueEvaluator(
    input.data.DataValues,
    input.spell.maxrank,
  );

  const ctx: EvaluatorContext = {
    spell: input.spell,
    data: input.data,
    lang: input.lang,
    evaluateDataValue,
    evaluateCalculation: (key, visited) => evaluate(key, visited),
  };

  function evaluate(key: string, visited = new Set<string>()): CalcResult {
    // 이름이 지워지고 해시만 남은 계산식도 있다 (로크 R 의 ExecuteTooltipCalc)
    const raw = (calculations[key] ?? calculations[binHashKey(key)]) as
      | SpellCalculation
      | undefined;
    if (!raw) throw new Error(`SpellCalculation "${key}" not found`);
    const rawType: string = raw.__type;
    if (visited.has(key)) {
      throw new Error(`Circular reference in mSpellCalculations: ${key}`);
    }
    visited.add(key);

    if (raw.__type === "GameCalculation") {
      return evaluateGameCalculation(key, raw, ctx, visited);
    }

    // 버프 보유 등 런타임 조건으로 갈리는 계산식은 기본 쪽을 쓴다
    if (raw.__type === "GameCalculationConditional") {
      const conditional = raw as GameCalculationConditional;
      const target =
        conditional.mDefaultGameCalculation ?? conditional.mConditionalGameCalculation;
      if (!target) {
        throw new Error("GameCalculationConditional has no calculation to evaluate");
      }
      return evaluate(target, visited);
    }

    if (raw.__type === "GameCalculationModified") {
      const modified = raw as GameCalculationModified;
      if (!modified.mModifiedGameCalculation) {
        throw new Error("mModifiedGameCalculation is missing");
      }
      const inner = evaluate(modified.mModifiedGameCalculation, visited);
      const multiplier = resolveMultiplier(modified.mMultiplier, ctx, visited);
      if (!multiplier) return inner;

      if (multiplier.statParts.length > 0) {
        return { ...inner, statMultiplier: inner.statMultiplier ?? multiplier };
      }

      const innerIsLevelRange = Boolean(inner.isBreakpointRange || inner.isCharLevelRange);
      const scaled = scaleResult({ ...inner, isLevelRange: innerIsLevelRange }, multiplier);
      if (scaled) {
        return {
          ...inner,
          ...scaled,
          isBreakpointRange:
            inner.isBreakpointRange ||
            (multiplier.isLevelRange && isVector(scaled.base)) ||
            undefined,
        };
      }
      // 랭크 값 × 레벨 범위처럼 접을 수 없으면 "× 배율" 로 남긴다
      // (유미 R 의 EnhancedHealPerWave: (30/50/70 + 12% 주문력) × (1.3 ~ 1.6))
      if (!inner.statMultiplier) return { ...inner, statMultiplier: multiplier };
      logger.warn(
        `GameCalculationModified "${key}": 배율이 이미 있어 추가 배율 생략`,
      );
      return inner;
    }

    throw new Error(`Unsupported mSpellCalculation type: ${rawType}`);
  }

  return evaluate(input.key);
}
