import type { ChampionSpell } from "@/types";
import { getTranslations } from "@/i18n";
import { logger } from "@/lib/logger";
import { getDataValueByName } from "./dataValueUtils";
import {
  evaluateProductPart,
  type PartResult,
} from "./productPartEvaluator";
import type {
  AbilityResourceByCoefficientCalculationPart,
  BuffCounterByCoefficientCalculationPart,
  BuffCounterByNamedDataValueCalculationPart,
  ByCharLevelBreakpointsCalculationPart,
  ByCharLevelFormulaCalculationPart,
  ByCharLevelInterpolationCalculationPart,
  CalcMultiplier,
  CalcResult,
  CalculationPart,
  ClampSubPartsCalculationPart,
  CommunityDragonSpellData,
  EffectValueCalculationPart,
  GameCalculation,
  GameCalculationConditional,
  GameCalculationModified,
  NamedDataValueCalculationPart,
  NumberCalculationPart,
  ProductOfSubPartsCalculationPart,
  SpellCalculation,
  SpellCalculationSubPart,
  StatByCoefficientCalculationPart,
  StatByNamedDataValueCalculationPart,
  StatBySubPartCalculationPart,
  StatPart,
  SumOfSubPartsCalculationPart,
  TooltipLocale,
  Value,
} from "./types";
import { add, getAbilityResourceName, getStatName, isVector, mul } from "./valueUtils";

type DataValueEvaluator = (name: string) => Value | null;

/** 챔피언 최대 레벨 */
const MAX_CHAMPION_LEVEL = 18;

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
function expandLevelBreakpoints(part: ByCharLevelBreakpointsCalculationPart): {
  level1: number;
  maxLevel: number;
  hasPerLevel: boolean;
} {
  const level1 = Number(part.mLevel1Value) || 0;
  const breakpoints = part.mBreakpoints ?? [];
  const hasPerLevel = breakpoints.some(
    (entry) => typeof entry.mBonusPerLevelAtAndAfter === "number",
  );

  let value = level1;
  for (let level = 2; level <= MAX_CHAMPION_LEVEL; level += 1) {
    let perLevel = 0;
    let perLevelFrom = -1;
    for (const entry of breakpoints) {
      if (typeof entry.mLevel !== "number" || level < entry.mLevel) continue;
      if (entry.mLevel < perLevelFrom) continue;
      perLevelFrom = entry.mLevel;
      perLevel = entry.mBonusPerLevelAtAndAfter ?? 0;
    }
    value += perLevel;

    for (const entry of breakpoints) {
      if (typeof entry.mAdditionalBonusAtThisLevel !== "number") continue;
      if (entry.mLevel == null || entry.mLevel === level) {
        value += entry.mAdditionalBonusAtThisLevel;
      }
    }
  }

  return { level1, maxLevel: value, hasPerLevel };
}

function evaluateRange(calc: GameCalculation): CalcResult | null {
  const parts = calc.mFormulaParts ?? [];
  if (parts.length !== 1) return null;
  const part = parts[0];
  const isPercent = Boolean(calc.mDisplayAsPercent);

  if (part.__type === "ByCharLevelInterpolationCalculationPart") {
    const interpolation = part as ByCharLevelInterpolationCalculationPart;
    const start = interpolation.mStartValue ?? 0;
    return {
      base: [start, interpolation.mEndValue ?? start],
      statParts: [],
      isPercent,
      isCharLevelRange: true,
    };
  }

  // 레벨별 값을 통째로 나열한 파트 (values[0] = 1레벨)
  if (part.__type === "ByCharLevelFormulaCalculationPart") {
    const values = (part as ByCharLevelFormulaCalculationPart).values ?? [];
    if (values.length >= 2) {
      const last = Math.min(values.length - 1, MAX_CHAMPION_LEVEL - 1);
      return {
        base: [values[0], values[last]],
        statParts: [],
        isPercent,
        isBreakpointRange: true,
      };
    }
    return null;
  }

  if (part.__type !== "ByCharLevelBreakpointsCalculationPart") return null;

  const breakpoint = part as ByCharLevelBreakpointsCalculationPart & {
    mInitialBonusPerLevel?: number;
  };
  const start = breakpoint.mLevel1Value ?? 0;
  if (calc.mSimpleTooltipCalculationDisplay === 6) {
    const end = (breakpoint.mBreakpoints ?? []).reduce(
      (value, entry) => value + (entry.mAdditionalBonusAtThisLevel ?? 0),
      start,
    );
    return {
      base: [start, end],
      statParts: [],
      isPercent,
      isBreakpointRange: true,
    };
  }
  if (!isPercent || !breakpoint.mInitialBonusPerLevel) return null;

  const finalLevel = breakpoint.mBreakpoints?.[0]?.mLevel;
  if (!finalLevel) return null;
  const steps = Math.max(finalLevel - 2, 0);
  return {
    base: [start, start + steps * breakpoint.mInitialBonusPerLevel],
    statParts: [],
    isPercent: true,
    isCharLevelRange: true,
  };
}

function effectValue(
  spell: ChampionSpell,
  index: number,
  data?: CommunityDragonSpellData,
): Value | null {
  // CDragon 템플릿은 CDragon 단위를 기대한다. DDragon 값과 단위가 다를 수 있어
  // CDragon 쪽이 있으면 그것을 먼저 쓴다.
  const source = data?.effectBurn?.[index] ?? spell.effectBurn?.[index];
  if (!source) {
    logger.debug(`EffectValueCalculationPart: effectBurn[${index}] is missing`, {
      spellId: spell.id,
    });
    return null;
  }
  const values = source
    .split("/")
    .map(Number.parseFloat)
    .filter((value) => !Number.isNaN(value));
  if (values.length === 0) return null;
  if (values.length === 1) return values[0];
  return values.length > spell.maxrank ? values.slice(0, spell.maxrank) : values;
}

interface EvaluatorContext {
  spell: ChampionSpell;
  data: CommunityDragonSpellData;
  lang: TooltipLocale;
  evaluateDataValue: DataValueEvaluator;
  /** 다른 계산식 참조용 */
  evaluateCalculation: (key: string, visited: Set<string>) => CalcResult;
}

/**
 * 계산 파트 하나를 { 숫자 base, 스탯 비율 } 로 평가한다.
 *
 * mFormulaParts 최상위뿐 아니라 Sum/Product/Clamp/StatBySubPart 의 서브 파트,
 * mMultiplier 자리에도 같은 파트 타입이 오므로 재귀로 처리한다.
 * 해석하지 못한 타입은 null 을 돌려주고 호출부에서 그 항만 건너뛴다.
 */
function evaluatePart(
  part: CalculationPart | undefined,
  ctx: EvaluatorContext,
  visited: Set<string>,
): PartResult | null {
  if (!part || typeof part !== "object" || !("__type" in part)) return null;
  const type = (part as { __type?: string }).__type;
  if (!type) return null;

  // 다른 계산식 참조 (CommunityDragon 에서 타입명이 해시로 남아 있어 키로 식별)
  const referenceKey = (part as SpellCalculationSubPart).mSpellCalculationKey;
  if (typeof referenceKey === "string" && referenceKey.length > 0) {
    try {
      const inner = ctx.evaluateCalculation(referenceKey, new Set(visited));
      return { base: inner.base, statParts: inner.statParts };
    } catch (error) {
      logger.debug(`SpellCalculation reference "${referenceKey}" failed`, error);
      return null;
    }
  }

  if (type === "NamedDataValueCalculationPart") {
    const name = (part as NamedDataValueCalculationPart).mDataValue;
    if (!name) {
      logger.debug("NamedDataValueCalculationPart missing mDataValue", part);
      return null;
    }
    const value = ctx.evaluateDataValue(name);
    return value == null ? null : { base: value, statParts: [] };
  }

  if (type === "EffectValueCalculationPart") {
    const index = (part as EffectValueCalculationPart).mEffectIndex ?? 0;
    const value = effectValue(ctx.spell, index, ctx.data);
    return value == null ? null : { base: value, statParts: [] };
  }

  if (type === "StatByNamedDataValueCalculationPart") {
    const stat = part as StatByNamedDataValueCalculationPart;
    if (!stat.mDataValue) {
      logger.debug("Stat part missing mDataValue", part);
      return null;
    }
    const ratio = ctx.evaluateDataValue(stat.mDataValue);
    if (ratio == null) return null;
    return {
      base: 0,
      statParts: [{ name: getStatName(stat.mStat, stat.mStatFormula, ctx.lang), ratio }],
    };
  }

  if (type === "StatByCoefficientCalculationPart") {
    const stat = part as StatByCoefficientCalculationPart;
    if (stat.mCoefficient == null) return null;
    return {
      base: 0,
      statParts: [
        {
          name: getStatName(stat.mStat, stat.mStatFormula, ctx.lang),
          ratio: stat.mCoefficient,
          isCoefficient: true,
        },
      ],
    };
  }

  if (type === "AbilityResourceByCoefficientCalculationPart") {
    const resource = part as AbilityResourceByCoefficientCalculationPart;
    if (resource.mCoefficient == null) return null;
    const name = getAbilityResourceName(ctx.spell, ctx.lang);
    const bonus = getTranslations(ctx.lang).common.bonus;
    return {
      base: 0,
      statParts: [
        {
          name: resource.mStatFormula === 2 ? `${bonus} ${name}` : name,
          ratio: resource.mCoefficient,
          isCoefficient: true,
        },
      ],
    };
  }

  if (type === "NumberCalculationPart") {
    const value = (part as NumberCalculationPart).mNumber;
    if (value == null) {
      // 값이 빈 NumberCalculationPart 를 0 으로 취급하면
      // multiplier 자리에서 결과 전체가 0 이 된다.
      logger.debug("NumberCalculationPart missing mNumber", part);
      return null;
    }
    return { base: value, statParts: [] };
  }

  if (type === "ByCharLevelBreakpointsCalculationPart") {
    const { level1, maxLevel, hasPerLevel } = expandLevelBreakpoints(
      part as ByCharLevelBreakpointsCalculationPart,
    );
    // 레벨당 증가가 있으면 단일 값으로 접지 않고 1~18레벨 범위로 노출한다
    if (hasPerLevel && maxLevel !== level1) {
      return { base: [level1, maxLevel], statParts: [], isLevelRange: true };
    }
    return { base: maxLevel, statParts: [] };
  }

  if (type === "SumOfSubPartsCalculationPart") {
    const subparts = (part as SumOfSubPartsCalculationPart).mSubparts ?? [];
    if (subparts.length === 0) return null;

    let base: Value = 0;
    const statParts: StatPart[] = [];
    for (const sub of subparts) {
      const result = evaluatePart(sub, ctx, visited);
      // 항 하나라도 못 구하면 합 자체가 틀린다
      if (!result) return null;
      try {
        base = add(base, result.base);
      } catch (error) {
        logger.debug("SumOfSubPartsCalculationPart: 합산 실패", error);
        return null;
      }
      statParts.push(...result.statParts);
    }
    return { base, statParts };
  }

  if (type === "ProductOfSubPartsCalculationPart") {
    return evaluateProductPart(part as ProductOfSubPartsCalculationPart, (sub) =>
      evaluatePart(sub as CalculationPart, ctx, visited),
    );
  }

  if (type === "ClampSubPartsCalculationPart") {
    const clamp = part as ClampSubPartsCalculationPart;
    let base: Value = 0;
    let resolved = 0;
    for (const sub of clamp.mSubparts ?? []) {
      const result = evaluatePart(sub, ctx, visited);
      if (!result) return null;
      // 스탯 비율은 런타임 스탯 없이 clamp 할 수 없어 버린다
      if (result.statParts.length > 0) {
        logger.debug("ClampSubPartsCalculationPart: 스탯 항 제외 (clamp 불가)", sub);
      }
      try {
        base = add(base, result.base);
        resolved += 1;
      } catch (error) {
        logger.debug("ClampSubPartsCalculationPart: 합산 실패", error);
      }
    }
    if (resolved === 0) return null;

    const limit = (value: number): number => {
      let next = value;
      if (typeof clamp.mFloor === "number") next = Math.max(next, clamp.mFloor);
      if (typeof clamp.mCeiling === "number") next = Math.min(next, clamp.mCeiling);
      return next;
    };
    return {
      base: isVector(base) ? base.map(limit) : limit(base as number),
      statParts: [],
    };
  }

  if (type === "StatBySubPartCalculationPart") {
    const statSubPart = part as StatBySubPartCalculationPart;
    const inner = evaluatePart(statSubPart.mSubpart, ctx, visited);
    if (!inner) return null;
    if (inner.statParts.length > 0) {
      logger.debug("StatBySubPartCalculationPart: 내부 스탯 비율은 표기 불가", part);
    }
    return {
      base: 0,
      statParts: [
        {
          name: getStatName(statSubPart.mStat, statSubPart.mStatFormula, ctx.lang),
          ratio: inner.base,
          isCoefficient: true,
        },
      ],
    };
  }

  // 버프 중첩 기반 값: 런타임 중첩 수를 모르므로 "중첩당 값" 을 그대로 노출한다.
  // 원문이 "처치할 때마다", "중첩당" 같은 맥락을 이미 주고 있다.
  if (type === "BuffCounterByNamedDataValueCalculationPart") {
    const name = (part as BuffCounterByNamedDataValueCalculationPart).mDataValue;
    if (!name) {
      logger.debug("BuffCounterByNamedDataValueCalculationPart missing mDataValue", part);
      return null;
    }
    const value = ctx.evaluateDataValue(name);
    return value == null ? null : { base: value, statParts: [] };
  }

  if (type === "BuffCounterByCoefficientCalculationPart") {
    const coefficient = (part as BuffCounterByCoefficientCalculationPart).mCoefficient;
    if (coefficient == null) {
      logger.debug("BuffCounterByCoefficientCalculationPart missing mCoefficient", part);
      return null;
    }
    return { base: coefficient, statParts: [] };
  }

  // 스킬 쿨다운 자체가 값이 된다 (주로 mMultiplier 자리)
  if (type === "CooldownMultiplierCalculationPart") {
    const cooldown = ctx.spell.cooldown;
    if (!Array.isArray(cooldown) || cooldown.length === 0) {
      logger.debug("CooldownMultiplierCalculationPart: cooldown 배열 없음", {
        spellId: ctx.spell.id,
      });
      return null;
    }
    const values = cooldown
      .map((entry) => (typeof entry === "number" ? entry : Number.parseFloat(String(entry))))
      .filter((value) => !Number.isNaN(value));
    if (values.length === 0) return null;
    return {
      base:
        values.length > ctx.spell.maxrank ? values.slice(0, ctx.spell.maxrank) : values,
      statParts: [],
    };
  }

  logger.debug(`Unsupported calculation part type "${type}"`, part);
  return null;
}

/**
 * mMultiplier 자리를 평가한다.
 * {mDataValue} / {mNumber} 형태와 계산 파트 형태를 모두 받는다.
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
  let hasLevelRange = false;

  for (const part of calc.mFormulaParts ?? []) {
    const evaluated = evaluatePart(part, ctx, visited);
    if (!evaluated) {
      // 해석 못 한 항은 그 항만 비우고 나머지 수치는 그대로 보여준다
      logger.debug("GameCalculation: 해석 못 한 항 생략", (part as { __type?: string }).__type);
      continue;
    }
    if (evaluated.isLevelRange) hasLevelRange = true;
    try {
      base = add(base, evaluated.base);
    } catch (error) {
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
    const raw = calculations[key] as SpellCalculation | undefined;
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
