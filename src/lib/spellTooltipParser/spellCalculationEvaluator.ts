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
import { add, mul } from "./valueUtils";
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

function evaluateGameCalculation(
  calc: GameCalculation,
  ctx: EvaluatorContext,
  visited: Set<string>,
): CalcResult {
  const range = evaluateRange(calc);
  if (range) return range;

  let base: Value = 0;
  const statParts: StatPart[] = [];
  const extraRanges: Value[] = [];
  let hasLevelRange = false;

  for (const part of calc.mFormulaParts ?? []) {
    const evaluated = evaluatePart(part, ctx, visited);
    if (!evaluated) {
      // 해석 못 한 항은 그 항만 비우고 나머지 수치는 그대로 보여준다
      logger.debug("GameCalculation: 해석 못 한 항 생략", (part as { __type?: string }).__type);
      continue;
    }
    try {
      base = add(base, evaluated.base);
      if (evaluated.isLevelRange) hasLevelRange = true;
    } catch (error) {
      // 랭크 벡터와 레벨 범위는 길이가 달라 못 더한다. 버리지 말고 옆에 붙인다.
      if (evaluated.isLevelRange) {
        extraRanges.push(evaluated.base);
        statParts.push(...evaluated.statParts);
        continue;
      }
      logger.debug("GameCalculation: 항 합산 실패", error);
      continue;
    }
    statParts.push(...evaluated.statParts);
  }

  let statMultiplier: PartResult | undefined;
  const multiplier = resolveMultiplier(calc.mMultiplier, ctx, visited);
  if (multiplier && multiplier.statParts.length > 0) {
    // 스탯 의존 배율은 스탯 0 을 가정한 숫자로 접지 않고 따로 노출한다
    statMultiplier = multiplier;
  } else if (multiplier) {
    try {
      const scale = multiplier.base;
      base = mul(base, scale);
      for (const statPart of statParts) {
        statPart.ratio = mul(statPart.ratio, scale);
      }
    } catch (error) {
      logger.debug("GameCalculation: multiplier 적용 실패", error);
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
      return evaluateGameCalculation(raw, ctx, visited);
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

      try {
        return {
          ...inner,
          base: mul(inner.base, multiplier.base),
          statParts: inner.statParts.map((part) => ({
            name: part.name,
            ratio: mul(part.ratio, multiplier.base),
          })),
        };
      } catch (error) {
        // 랭크 벡터와 레벨 범위처럼 길이가 다르면 배율만 생략한다
        logger.debug("GameCalculationModified: multiplier 적용 실패", error);
        return inner;
      }
    }

    throw new Error(`Unsupported mSpellCalculation type: ${rawType}`);
  }

  return evaluate(input.key);
}
