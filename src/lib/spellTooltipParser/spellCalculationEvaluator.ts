import type { ChampionSpell } from "@/types";
import { getTranslations } from "@/i18n";
import { logger } from "@/lib/logger";
import { getDataValueByName } from "./dataValueUtils";
import { evaluateProductPart } from "./productPartEvaluator";
import type {
  AbilityResourceByCoefficientCalculationPart,
  ByCharLevelBreakpointsCalculationPart,
  ByCharLevelInterpolationCalculationPart,
  CalcMultiplier,
  CalcResult,
  CalculationPart,
  CommunityDragonSpellData,
  EffectValueCalculationPart,
  GameCalculation,
  GameCalculationModified,
  NamedDataValueCalculationPart,
  NumberCalculationPart,
  ProductOfSubPartsCalculationPart,
  SpellCalculation,
  StatByCoefficientCalculationPart,
  StatByNamedDataValueCalculationPart,
  StatPart,
  TooltipLocale,
  Value,
} from "./types";
import { add, getAbilityResourceName, getStatName, mul } from "./valueUtils";

type DataValueEvaluator = (name: string) => Value | null;

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

function effectValue(spell: ChampionSpell, index: number): Value {
  const source = spell.effectBurn?.[index];
  if (!source) {
    logger.debug(`EffectValueCalculationPart: effectBurn[${index}] is missing`, {
      spellId: spell.id,
    });
    return 0;
  }
  const values = source
    .split("/")
    .map(Number.parseFloat)
    .filter((value) => !Number.isNaN(value));
  return values.length > spell.maxrank ? values.slice(0, spell.maxrank) : values;
}

function evaluatePart(
  part: CalculationPart,
  spell: ChampionSpell,
  lang: TooltipLocale,
  evaluateDataValue: DataValueEvaluator,
): { base: Value; statPart?: StatPart } {
  if (part.__type === "NamedDataValueCalculationPart") {
    const name = (part as NamedDataValueCalculationPart).mDataValue;
    if (!name) logger.debug("NamedDataValueCalculationPart missing mDataValue", part);
    return { base: name ? evaluateDataValue(name) ?? 0 : 0 };
  }
  if (part.__type === "EffectValueCalculationPart") {
    const index = (part as EffectValueCalculationPart).mEffectIndex ?? 0;
    return { base: effectValue(spell, index) };
  }
  if (part.__type === "StatByNamedDataValueCalculationPart") {
    const stat = part as StatByNamedDataValueCalculationPart;
    const ratio = stat.mDataValue ? evaluateDataValue(stat.mDataValue) : null;
    if (!stat.mDataValue) logger.debug("Stat part missing mDataValue", part);
    return ratio == null
      ? { base: 0 }
      : { base: 0, statPart: { name: getStatName(stat.mStat, stat.mStatFormula, lang), ratio } };
  }
  if (part.__type === "StatByCoefficientCalculationPart") {
    const stat = part as StatByCoefficientCalculationPart;
    if (stat.mCoefficient == null) return { base: 0 };
    return {
      base: 0,
      statPart: {
        name: getStatName(stat.mStat, stat.mStatFormula, lang),
        ratio: stat.mCoefficient,
        isCoefficient: true,
      },
    };
  }
  if (part.__type === "AbilityResourceByCoefficientCalculationPart") {
    const resource = part as AbilityResourceByCoefficientCalculationPart;
    if (resource.mCoefficient == null) return { base: 0 };
    const name = getAbilityResourceName(spell, lang);
    const bonus = getTranslations(lang).common.bonus;
    return {
      base: 0,
      statPart: {
        name: resource.mStatFormula === 2 ? `${bonus} ${name}` : name,
        ratio: resource.mCoefficient,
        isCoefficient: true,
      },
    };
  }
  if (part.__type === "NumberCalculationPart") {
    return { base: (part as NumberCalculationPart).mNumber ?? 0 };
  }
  if (part.__type === "ByCharLevelBreakpointsCalculationPart") {
    const breakpoint = part as ByCharLevelBreakpointsCalculationPart;
    const base = (breakpoint.mBreakpoints ?? []).reduce(
      (value, entry) => value + (entry.mAdditionalBonusAtThisLevel ?? 0),
      Number(breakpoint.mLevel1Value) || 0,
    );
    return { base };
  }
  if (part.__type === "ProductOfSubPartsCalculationPart") {
    return {
      base: evaluateProductPart(
        part as ProductOfSubPartsCalculationPart,
        spell,
        evaluateDataValue,
      ),
    };
  }
  return { base: 0 };
}

function resolveMultiplier(
  multiplier: CalcMultiplier | undefined,
  evaluateDataValue: DataValueEvaluator,
): Value | null {
  if (multiplier?.mDataValue) return evaluateDataValue(multiplier.mDataValue);
  return multiplier?.mNumber ?? null;
}

function evaluateGameCalculation(
  calc: GameCalculation,
  spell: ChampionSpell,
  lang: TooltipLocale,
  evaluateDataValue: DataValueEvaluator,
): CalcResult {
  const range = evaluateRange(calc);
  if (range) return range;

  let base: Value = 0;
  const statParts: StatPart[] = [];
  for (const part of calc.mFormulaParts ?? []) {
    const evaluated = evaluatePart(part, spell, lang, evaluateDataValue);
    base = add(base, evaluated.base);
    if (evaluated.statPart) statParts.push(evaluated.statPart);
  }

  const multiplier = resolveMultiplier(calc.mMultiplier, evaluateDataValue);
  if (multiplier !== null) {
    base = mul(base, multiplier);
    for (const statPart of statParts) {
      statPart.ratio = mul(statPart.ratio, multiplier);
    }
  }
  return {
    base,
    statParts,
    isPercent: Boolean(calc.mDisplayAsPercent),
    precision: typeof calc.mPrecision === "number" && calc.mPrecision >= 0
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

  function evaluate(key: string, visited = new Set<string>()): CalcResult {
    const raw = calculations[key] as SpellCalculation | undefined;
    if (!raw) throw new Error(`SpellCalculation "${key}" not found`);
    const rawType: string = raw.__type;
    if (visited.has(key)) {
      throw new Error(`Circular reference in mSpellCalculations: ${key}`);
    }
    visited.add(key);
    if (raw.__type === "GameCalculation") {
      return evaluateGameCalculation(raw, input.spell, input.lang, evaluateDataValue);
    }
    if (raw.__type === "GameCalculationModified") {
      const modified = raw as GameCalculationModified;
      if (!modified.mModifiedGameCalculation) {
        throw new Error("mModifiedGameCalculation is missing");
      }
      const inner = evaluate(modified.mModifiedGameCalculation, visited);
      const multiplier = resolveMultiplier(modified.mMultiplier, evaluateDataValue);
      if (multiplier === null) return inner;
      return {
        ...inner,
        base: mul(inner.base, multiplier),
        statParts: inner.statParts.map((part) => ({
          name: part.name,
          ratio: mul(part.ratio, multiplier),
        })),
      };
    }
    throw new Error(`Unsupported mSpellCalculation type: ${rawType}`);
  }

  return evaluate(input.key);
}
