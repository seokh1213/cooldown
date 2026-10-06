import type { ChampionSpell } from "@/types";
import { logger } from "@/lib/logger";
import { binHashKey } from "./binHash";
import { scaleCalculationResult } from "./calculationOperations";
import { getDataValueByName } from "./dataValueUtils";
import type { PartResult } from "./productPartEvaluator";
import type {
  CalcMultiplier,
  CalcResult,
  CalculationPart,
  CommunityDragonSpellData,
  DroppedCalculation,
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
  firstRank: 0 | 1,
  reportDrop?: EvaluatorContext["reportDrop"],
): DataValueEvaluator {
  return (name, options) => {
    if (!name || typeof name !== "string") {
      logger.debug(`DataValue name is invalid: ${name}`);
      return null;
    }
    if (!dataValues) {
      logger.debug("dataValues is undefined");
      if (!options?.optional) reportDrop?.({ reason: "missing-data-value", detail: name });
      return null;
    }
    const value = getDataValueByName(dataValues, name, maxRank, firstRank);
    if (value == null && !options?.optional) {
      logger.debug(`DataValue "${name}" missing`);
      reportDrop?.({ reason: "missing-data-value", detail: name });
    }
    return value;
  };
}

/**
 * 레벨 브레이크포인트를 1~20레벨 값으로 펼친다.
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
  groupedParts?: CalcResult[];
  /** base 가 1~20레벨 값인 레벨 범위인지 여부 */
  isLevelRange?: boolean;
}

/**
 * 숫자 배율을 base·스탯 계수·레벨 범위 항에 곱해 접는다.
 *
 * 랭크 벡터(길이 = 최대 랭크)와 레벨 범위(길이 20, 1~20레벨)는 축이 달라
 * 원소끼리 곱하면 안 된다. 한쪽이 랭크, 다른 쪽이 레벨이면 접지 않고 null 을 돌려
 * 호출부가 "× 배율" 로 따로 적게 한다.
 */
function scaleResult(
  target: ScaleTarget,
  multiplier: PartResult,
): Pick<CalcResult, "base" | "statParts" | "extraRanges" | "groupedParts"> | null {
  const scale = multiplier.base;
  if (multiplier.groupedParts?.length || (target.groupedParts?.length && isVector(scale))) return null;
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
      groupedParts: target.groupedParts?.map((part) => scaleCalculationResult(part, scale as number)),
    };
  } catch {
    // 길이가 다른 랭크 벡터끼리처럼 접을 수 없으면 호출부가 "× 배율" 로 남긴다
    return null;
  }
}

/**
 * 계산 결과에 mMultiplier 를 적용한다.
 * 접을 수 있으면 접고, 접을 수 없으면 "× 배율" 로 남긴다. 배율을 풀지 못하면 진단에 남긴다.
 */
function applyMultiplier(
  key: string,
  result: CalcResult,
  rawMultiplier: CalcMultiplier | undefined,
  ctx: EvaluatorContext,
  visited: Set<string>,
): CalcResult {
  if (!rawMultiplier) return result;
  const multiplier = resolveMultiplier(rawMultiplier, ctx, visited);
  if (!multiplier) {
    ctx.reportDrop?.({ key, reason: "unresolved-multiplier" });
    return result;
  }
  if (multiplier.statParts.length === 0) {
    const isLevelRange = Boolean(result.isBreakpointRange || result.isCharLevelRange);
    const scaled = scaleResult({ ...result, isLevelRange }, multiplier);
    if (scaled) {
      return {
        ...result,
        ...scaled,
        extraRanges: scaled.extraRanges?.length ? scaled.extraRanges : undefined,
        isBreakpointRange:
          result.isBreakpointRange ||
          (multiplier.isLevelRange && isVector(scaled.base)) ||
          undefined,
      };
    }
  }
  // 스탯 의존 배율, 또는 랭크 값 × 레벨 범위처럼 접을 수 없는 배율은 "× 배율" 로 남긴다
  // (일라오이 Q TentacleDamageTotal: (9 ~ 180) × 1.1/…/1.3, 유미 R: 30/50/70 × (1.3 ~ 1.6))
  if (!result.statMultiplier) return { ...result, statMultiplier: multiplier };
  // 배율이 겹치면 뒤에 이어 곱한다 (아크샨 E CriticalCalc = DamageToDeal × 치명타 배율)
  return {
    ...result,
    extraMultipliers: [...(result.extraMultipliers ?? []), multiplier],
  };
}

function evaluateGameCalculation(
  key: string,
  calc: GameCalculation,
  ctx: EvaluatorContext,
  visited: Set<string>,
): CalcResult {
  const precision = typeof calc.mPrecision === "number" ? calc.mPrecision : undefined;

  // 레벨 범위 항 하나뿐인 계산식도 mMultiplier 는 적용한다
  // (가렌 P RegenCalc ×0.01, 람머스 Q MinimumMoveSpeed × MSMultiplier)
  const range = evaluateRange(calc);
  if (range) return applyMultiplier(key, { ...range, precision }, calc.mMultiplier, ctx, visited);

  // 랭크 값과 레벨 범위(1~20레벨 값)는 따로 모은다.
  // 한 줄로 더하면 항 순서에 따라 결과가 갈린다. 레벨 범위가 먼저 오면
  // 뒤에 오는 랭크 벡터가 길이 불일치로 버려졌다 (우디르 W 각성 보호막의 ShieldBase).
  let rankBase: Value = 0;
  let levelBase: Value = 0;
  const statParts: StatPart[] = [];
  const groupedParts: CalcResult[] = [];
  let hasLevelRange = false;

  for (const part of calc.mFormulaParts ?? []) {
    const evaluated = evaluatePart(part, ctx, visited);
    if (!evaluated) {
      // 해석 못 한 항은 그 항만 비우고 나머지 수치는 그대로 보여준다
      const partType = (part as { __type?: string }).__type;
      logger.debug(`GameCalculation "${key}": 해석 못 한 항 생략`, partType);
      ctx.reportDrop?.({ key, reason: "unresolved-part", detail: partType });
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
      logger.debug(`GameCalculation "${key}": 항 합산 실패`, error);
      ctx.reportDrop?.({
        key,
        reason: "sum-mismatch",
        detail: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    statParts.push(...evaluated.statParts);
    groupedParts.push(...(evaluated.groupedParts ?? []));
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

  return applyMultiplier(key, {
    base,
    statParts,
    isPercent: Boolean(calc.mDisplayAsPercent),
    isBreakpointRange: hasLevelRange || undefined,
    extraRanges: extraRanges.length > 0 ? extraRanges : undefined,
    groupedParts: groupedParts.length > 0 ? groupedParts : undefined,
    precision,
  }, calc.mMultiplier, ctx, visited);
}
export function evaluateSpellCalculation(input: {
  key: string;
  spell: ChampionSpell;
  data: CommunityDragonSpellData;
  lang: TooltipLocale;
  /** 값을 버린 자리를 알린다 (합산 실패·배율 생략 등). 툴팁 진단으로 모인다. */
  reportDrop?: (entry: DroppedCalculation) => void;
  /** 0 이면 DataValues 를 0랭크 값부터 읽는다 (getDataValueByName) */
  firstRank?: 0 | 1;
}): CalcResult {
  if (!input.data.mSpellCalculations) {
    throw new Error("mSpellCalculations is undefined");
  }
  const calculations: Record<string, SpellCalculation> = input.data.mSpellCalculations;
  // 값을 버린 자리를 어느 계산식에서 버렸는지 알 수 있게 평가 중인 키를 쌓아 둔다
  const keyStack: string[] = [];
  const report = input.reportDrop;
  const reportDrop: EvaluatorContext["reportDrop"] = report
    ? (entry) =>
        report({ ...entry, key: entry.key ?? keyStack[keyStack.length - 1] ?? input.key })
    : undefined;
  const evaluateDataValue = createDataValueEvaluator(
    input.data.DataValues,
    input.spell.maxrank,
    input.firstRank ?? 1,
    reportDrop,
  );

  const ctx: EvaluatorContext = {
    spell: input.spell,
    data: input.data,
    lang: input.lang,
    evaluateDataValue,
    evaluateCalculation: (key, visited) => evaluate(key, visited),
    reportDrop,
  };

  function evaluate(key: string, visited = new Set<string>()): CalcResult {
    keyStack.push(key);
    try {
      return evaluateOne(key, visited);
    } finally {
      keyStack.pop();
    }
  }

  function evaluateOne(key: string, visited: Set<string>): CalcResult {
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
      return applyMultiplier(key, inner, modified.mMultiplier, ctx, visited);
    }

    throw new Error(`Unsupported mSpellCalculation type: ${rawType}`);
  }

  return evaluate(input.key);
}
