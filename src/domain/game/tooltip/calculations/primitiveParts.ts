import type { ChampionSpell } from "@/domain/game/types";
import { getTranslations } from "@/shared/i18n";
import { logger } from "@/shared/lib/logger";
import type { CommunityDragonSpellData } from "../contracts";
import { getAbilityResourceName, getStatIcon, getStatName } from "../formatting/statNames";
import type {
  AbilityResourceByCoefficientCalculationPart,
  BuffCounterByCoefficientCalculationPart,
  BuffCounterByNamedDataValueCalculationPart,
  CalculationPart,
  EffectValueCalculationPart,
  NamedDataValueCalculationPart,
  NumberCalculationPart,
  StatByCoefficientCalculationPart,
  StatByNamedDataValueCalculationPart,
  Value,
} from "./contracts";
import type { EvaluatorContext } from "./partContext";
import { type PartResult } from "./productPartEvaluator";

function effectValue(
  spell: ChampionSpell,
  index: number,
  data?: CommunityDragonSpellData,
  reportDrop?: EvaluatorContext["reportDrop"],
): Value | null {
  // CDragon 템플릿은 CDragon 단위를 기대한다. DDragon 값과 단위가 다를 수 있어
  // CDragon 쪽이 있으면 그것을 먼저 쓴다.
  const source = data?.effectBurn?.[index] ?? spell.effectBurn?.[index];
  if (!source) {
    logger.debug(`EffectValueCalculationPart: effectBurn[${index}] is missing`, {
      spellId: spell.id,
    });
    reportDrop?.({ reason: "missing-effect-burn", detail: String(index) });
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
export function evaluateNamedDataValue(part: CalculationPart, ctx: EvaluatorContext): PartResult | null {
  const name = (part as NamedDataValueCalculationPart).mDataValue;
  if (!name) {
    logger.debug("NamedDataValueCalculationPart missing mDataValue", part);
    return null;
  }
  const value = ctx.evaluateDataValue(name);
  return value == null ? null : { base: value, statParts: [] };
}

export function evaluateEffectValue(part: CalculationPart, ctx: EvaluatorContext): PartResult | null {
  const index = (part as EffectValueCalculationPart).mEffectIndex ?? 0;
  const value = effectValue(ctx.spell, index, ctx.data, ctx.reportDrop);
  return value == null ? null : { base: value, statParts: [] };
}

export function evaluateStatByNamedDataValue(part: CalculationPart, ctx: EvaluatorContext): PartResult | null {
  const stat = part as StatByNamedDataValueCalculationPart;
  if (!stat.mDataValue) {
    logger.debug("Stat part missing mDataValue", part);
    return null;
  }
  const ratio = ctx.evaluateDataValue(stat.mDataValue);
  if (ratio == null) return null;
  return {
    base: 0,
    statParts: [
      {
        name: getStatName(stat.mStat, stat.mStatFormula, ctx.lang),
        icon: getStatIcon(stat.mStat),
        ratio,
      },
    ],
  };
}

export function evaluateStatByCoefficient(part: CalculationPart, ctx: EvaluatorContext): PartResult | null {
  const stat = part as StatByCoefficientCalculationPart;
  if (stat.mCoefficient == null) return null;
  return {
    base: 0,
    statParts: [
      {
        name: getStatName(stat.mStat, stat.mStatFormula, ctx.lang),
        icon: getStatIcon(stat.mStat),
        ratio: stat.mCoefficient,
        isCoefficient: true,
      },
    ],
  };
}

export function evaluateAbilityResourceByCoefficient(part: CalculationPart, ctx: EvaluatorContext): PartResult | null {
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

export function evaluateNumber(part: CalculationPart): PartResult | null {
  const value = (part as NumberCalculationPart).mNumber;
  if (value == null) {
    // 값이 빈 NumberCalculationPart 를 0 으로 취급하면
    // multiplier 자리에서 결과 전체가 0 이 된다.
    logger.debug("NumberCalculationPart missing mNumber", part);
    return null;
  }
  return { base: value, statParts: [] };
}

export function evaluateBuffCounterByNamedDataValue(part: CalculationPart, ctx: EvaluatorContext): PartResult | null {
  const name = (part as BuffCounterByNamedDataValueCalculationPart).mDataValue;
  if (!name) {
    logger.debug("BuffCounterByNamedDataValueCalculationPart missing mDataValue", part);
    return null;
  }
  const value = ctx.evaluateDataValue(name);
  return value == null ? null : { base: value, statParts: [] };
}

export function evaluateBuffCounterByCoefficient(part: CalculationPart): PartResult | null {
  const coefficient = (part as BuffCounterByCoefficientCalculationPart).mCoefficient;
  if (coefficient == null) {
    logger.debug("BuffCounterByCoefficientCalculationPart missing mCoefficient", part);
    return null;
  }
  return { base: coefficient, statParts: [] };
}

export function evaluateCooldownMultiplier(): PartResult | null {
  return { base: 1, statParts: [] };
}
