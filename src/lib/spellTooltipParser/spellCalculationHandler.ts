import { ChampionSpell } from "@/types";
import {
  ParseResult,
  CommunityDragonSpellData,
  CalcResult,
  StatPart,
  GameCalculationModified,
  GameCalculation,
  NamedDataValueCalculationPart,
  StatByNamedDataValueCalculationPart,
  StatByCoefficientCalculationPart,
  AbilityResourceByCoefficientCalculationPart,
  EffectValueCalculationPart,
  NumberCalculationPart,
  ByCharLevelBreakpointsCalculationPart,
  ByCharLevelInterpolationCalculationPart,
  ProductOfSubPartsCalculationPart,
  SpellCalculation,
  TooltipLocale,
} from "./types";
import { getDataValueByName } from "./dataValueUtils";
import { Value } from "./types";
import { getTranslations } from "@/i18n";
import { add, mul, getStatName, getAbilityResourceName } from "./valueUtils";
import { logger } from "@/lib/logger";
import { formatCalculationResult } from "./calculationResultFormatter";
import { evaluateProductPart } from "./productPartEvaluator";

/**
 * mSpellCalculations를 사용하여 변수 치환
 */
export function replaceCalculateData(
  parseResult: ParseResult,
  spell: ChampionSpell,
  communityDragonData?: CommunityDragonSpellData,
  lang: TooltipLocale = "ko_KR"
): string | null {
  const spellCalcs = communityDragonData?.mSpellCalculations;
  const dataValues = communityDragonData?.DataValues;
  if (!spellCalcs) return null;

  const entry = Object.entries(spellCalcs).find(
    ([k]) => k != null && k.toLowerCase() === parseResult.variable.toLowerCase()
  );
  if (!entry) return null;

  const [calcKey] = entry;

  function evalDataValue(name: string): Value | null {
    if (!name || typeof name !== "string") {
      logger.debug(`DataValue name is invalid: ${name}`);
      return null;
    }
    if (!dataValues) {
      logger.debug("dataValues is undefined");
      return null;
    }
    const v = getDataValueByName(dataValues, name, spell.maxrank);
    if (v == null) {
      logger.debug(`DataValue "${name}" missing`);
      return null;
    }
    return v;
  }

  function evalCalc(key: string, visited: Set<string> = new Set()): CalcResult {
    if (!spellCalcs) throw new Error("spellCalcs is undefined");
    const raw = spellCalcs[key] as SpellCalculation | undefined;
    if (!raw) throw new Error(`SpellCalculation "${key}" not found`);

    if (visited.has(key))
      throw new Error(`Circular reference in mSpellCalculations: ${key}`);
    visited.add(key);

    const rawType = raw && typeof raw === "object" && "__type" in raw ? raw.__type : "unknown";

    // GameCalculationModified: 내부 계산 결과(base, statParts)를 multiplier로 스케일
    if (raw.__type === "GameCalculationModified") {
      const modified = raw as GameCalculationModified;
      if (!modified.mModifiedGameCalculation) {
        throw new Error(`mModifiedGameCalculation is missing`);
      }
      const inner = evalCalc(modified.mModifiedGameCalculation, visited);
      if (!modified.mMultiplier) {
        return inner;
      }

      let mult: Value | null = null;
      if (modified.mMultiplier.mDataValue) {
        mult = evalDataValue(modified.mMultiplier.mDataValue);
        if (mult == null) {
          // DataValue가 없으면 multiplier를 무시하고 내부 결과만 반환
          return inner;
        }
      } else if (modified.mMultiplier.mNumber != null) {
        mult = modified.mMultiplier.mNumber;
      }

      if (mult == null) {
        return inner;
      }

      const newBase = mul(inner.base, mult);
      const newStatParts: StatPart[] = inner.statParts.map((sp) => ({
        name: sp.name,
        ratio: mul(sp.ratio, mult),
      }));

      return {
        base: newBase,
        statParts: newStatParts,
        isPercent: inner.isPercent,
        precision: inner.precision,
      };
    }

    // GameCalculation: mFormulaParts를 숫자 base + 스탯 비율(statParts)로 분리
    if (raw.__type === "GameCalculation") {
      const calc = raw as GameCalculation;
      const parts = calc.mFormulaParts ?? [];
      let base: Value = 0;
      const statParts: StatPart[] = [];
      const isPercent: boolean = !!calc.mDisplayAsPercent;

      // === 특수 케이스: 브레이크포인트 기반 단순 범위 (예: "(12 ~ 8)") ===
      // mFormulaParts 가 단 하나이고, ByCharLevelBreakpointsCalculationPart 이며
      // mSimpleTooltipCalculationDisplay 가 6인 경우를 "(시작값 ~ 끝값)" 형태로 표현
      if (
        parts.length === 1 &&
        parts[0] &&
        typeof parts[0] === "object" &&
        "__type" in parts[0] &&
        parts[0].__type === "ByCharLevelBreakpointsCalculationPart" &&
        calc.mSimpleTooltipCalculationDisplay === 6
      ) {
        const breakPart = parts[0] as ByCharLevelBreakpointsCalculationPart;

        const startValue = breakPart.mLevel1Value ?? 0;
        let current = startValue;

        for (const bp of breakPart.mBreakpoints ?? []) {
          if (typeof bp.mAdditionalBonusAtThisLevel === "number") {
            current += bp.mAdditionalBonusAtThisLevel;
          }
        }

        const endValue = current;
        const rangeBase: Value = [startValue, endValue];

        return {
          base: rangeBase,
          statParts: [],
          isPercent,
          isBreakpointRange: true,
          precision: undefined,
        };
      }

      // === 특수 케이스: 챔피언 레벨당 선형 증가 퍼센트 (예: 40% ~ 100%) ===
      // mFormulaParts 가 단 하나이고, ByCharLevelBreakpointsCalculationPart 이며
      // mDisplayAsPercent 가 true 인 경우를 범위 형태 "(A% ~ B%)" 로 표현
      if (
        parts.length === 1 &&
        parts[0] &&
        typeof parts[0] === "object" &&
        "__type" in parts[0] &&
        parts[0].__type === "ByCharLevelBreakpointsCalculationPart" &&
        isPercent
      ) {
        const breakPart = parts[0] as ByCharLevelBreakpointsCalculationPart & {
          mInitialBonusPerLevel?: number;
        };

        const level1Value = breakPart.mLevel1Value ?? 0;
        const perLevel = breakPart.mInitialBonusPerLevel ?? 0;
        const firstBreakpoint = (breakPart.mBreakpoints ?? [])[0] as
          | { mLevel?: number }
          | undefined;

        if (perLevel !== 0 && firstBreakpoint?.mLevel) {
          // 예시:
          // - 1레벨: 0.40 (나중에 ×100 해서 40%)
          // - perLevel: 0.04 (나중에 ×100 해서 4%)
          // - breakpoint mLevel: 17 → 16레벨까지 적용
          const lastLevel = firstBreakpoint.mLevel - 1;
          const steps = Math.max(lastLevel - 1, 0);
          const endValue = level1Value + steps * perLevel;

          // 여기서는 "생(raw) 값"만 저장하고, 퍼센트 변환(×100)은
          // 아래 공통 로직(scaleBy100 / ×100) 에 맡긴다.
          // → 이 로직에서 100을 한 번 더 곱하지 않도록 하기 위함.
          const rangeBase: Value = [level1Value, endValue];

          return {
            base: rangeBase,
            statParts: [],
            isPercent: true,
            isCharLevelRange: true,
            precision: undefined,
          };
        }
        // perLevel 정보가 없으면 아래 일반 로직으로 폴백
      }

      // === 특수 케이스: 챔피언 레벨 선형 보간 범위 ===
      // 예: 방어력 6~10, 또는 mDisplayAsPercent=true인 80%~95%
      if (
        parts.length === 1 &&
        parts[0] &&
        typeof parts[0] === "object" &&
        "__type" in parts[0] &&
        parts[0].__type === "ByCharLevelInterpolationCalculationPart"
      ) {
        const interpPart = parts[0] as ByCharLevelInterpolationCalculationPart;
        const start = interpPart.mStartValue ?? 0;
        const end = interpPart.mEndValue ?? start;
        const rangeBase: Value = [start, end];

        return {
          base: rangeBase,
          statParts: [],
          isPercent,
          isCharLevelRange: true,
          precision: undefined,
        };
      }

      for (const part of parts) {
        const partType = part.__type as string;

        if (partType === "NamedDataValueCalculationPart") {
          // BaseDamage, BasePercentMaxHPDmgPerSec 등의 순수 값
          const namedPart = part as NamedDataValueCalculationPart;
          if (!namedPart.mDataValue) {
            logger.debug(`NamedDataValueCalculationPart missing mDataValue`, part);
            continue;
          }
          const v = evalDataValue(namedPart.mDataValue);
          if (v == null) {
            // DataValue가 없으면 이 part를 건너뛰고 계속 진행
            continue;
          }
          base = add(base, v);
        } else if (partType === "EffectValueCalculationPart") {
          // spell.effectBurn / effect 에서 값 가져오기
          const effectPart = part as EffectValueCalculationPart;
          const idx = effectPart.mEffectIndex ?? 0;
          const effectBurn = spell.effectBurn?.[idx] ?? null;
          if (!effectBurn) {
            logger.debug(`EffectValueCalculationPart: effectBurn[${idx}] is missing`, {
              spellId: spell.id,
            });
          } else {
            // 예: "80/100/120/140/160" → [80,100,120,140,160]
            const nums = effectBurn
              .split("/")
              .map((s) => parseFloat(s))
              .filter((v) => !Number.isNaN(v));
            if (nums.length > 0) {
              const sliced =
                nums.length > spell.maxrank ? nums.slice(0, spell.maxrank) : nums;
              base = add(base, sliced);
            }
          }
        } else if (partType === "StatByNamedDataValueCalculationPart") {
          // ADRatioPerSecond, ADRatio 등: 스탯 계수 → 나중에 50% AD 같은 텍스트로 사용
          const statPart = part as StatByNamedDataValueCalculationPart;
          if (!statPart.mDataValue) {
            logger.debug(`StatByNamedDataValueCalculationPart missing mDataValue`, part);
            continue;
          }
          const ratio = evalDataValue(statPart.mDataValue); // 0.5 or 벡터
          if (ratio == null) {
            // DataValue가 없으면 이 part를 건너뛰고 계속 진행
            continue;
          }
          const name = getStatName(statPart.mStat, statPart.mStatFormula, lang);
          statParts.push({ name, ratio });
        } else if (partType === "StatByCoefficientCalculationPart") {
          // mCoefficient 기반 스탯/계수 (예: 1 → 100%)
          const coeffPart = part as StatByCoefficientCalculationPart;
          if (coeffPart.mCoefficient == null) {
            logger.debug(`StatByCoefficientCalculationPart missing mCoefficient`, part);
            continue;
          }
          // mStat/mStatFormula 규칙에 따라 스탯 이름 결정
          // (둘 다 생략 시 AP, 2=AD, 12=Health 등)
          const name = getStatName(coeffPart.mStat, coeffPart.mStatFormula, lang);
          // 계수 자체(0.3, 1 등)를 ratio 로 두고, 나중에 ×100(+버림)해서 %로 표기
          const ratio: Value = coeffPart.mCoefficient;
          statParts.push({ name, ratio, isCoefficient: true });
        } else if (partType === "AbilityResourceByCoefficientCalculationPart") {
          // 스킬 자원(마나/기력 등)에 비례하는 계수
          const resPart = part as AbilityResourceByCoefficientCalculationPart;
          if (resPart.mCoefficient == null) {
            logger.debug(
              `AbilityResourceByCoefficientCalculationPart missing mCoefficient`,
              part
            );
            continue;
          }

          const resourceName = getAbilityResourceName(spell, lang);
          // mStatFormula: 2 → bonus 자원
          const isBonus = resPart.mStatFormula === 2;
          const bonus = getTranslations(lang).common.bonus;
          const name = isBonus ? `${bonus} ${resourceName}` : resourceName;

          const ratio: Value = resPart.mCoefficient;
          statParts.push({ name, ratio, isCoefficient: true });
        } else if (partType === "NumberCalculationPart") {
          // 고정 숫자 상수는 base 에 더한다.
          const numPart = part as NumberCalculationPart;
          const n = numPart.mNumber ?? 0;
          base = add(base, n);
        } else if (partType === "ByCharLevelBreakpointsCalculationPart") {
          const breakPart = part as ByCharLevelBreakpointsCalculationPart;
          let b = (breakPart.mLevel1Value as number) || 0;
          for (const bp of breakPart.mBreakpoints ?? []) {
            // 일부 데이터에서는 추가 보너스를 mAdditionalBonusAtThisLevel 로 제공
            if (bp.mAdditionalBonusAtThisLevel != null) {
              b += bp.mAdditionalBonusAtThisLevel;
            }
          }
          base = add(base, b);
        } else if (partType === "ProductOfSubPartsCalculationPart") {
          const prodPart = part as ProductOfSubPartsCalculationPart;
          base = add(base, evaluateProductPart(prodPart, spell, evalDataValue));
        }
      }

      // === 공통 multiplier 처리 (GameCalculation 전용) ===
      // 일부 계산식은 mFormulaParts 로 만든 값 전체에 mMultiplier 를 곱한다.
      // 예: (EffectValue * 0.01) 같은 형태 → 나중에 mDisplayAsPercent 에 의해 ×100 되어
      // 최종적으로 "EffectValue%" 가 되도록 함.
      let finalBase: Value = base;
      let finalStatParts: StatPart[] = statParts;

      if (calc.mMultiplier) {
        let mult: Value | null = null;
        if (calc.mMultiplier.mDataValue) {
          mult = evalDataValue(calc.mMultiplier.mDataValue);
          if (mult == null) {
            // DataValue가 없으면 multiplier를 무시하고 계속 진행
            mult = null;
          }
        } else if (calc.mMultiplier.mNumber != null) {
          mult = calc.mMultiplier.mNumber;
        }

        if (mult != null) {
          finalBase = mul(finalBase, mult);
          finalStatParts = finalStatParts.map((sp) => ({
            ...sp,
            ratio: mul(sp.ratio, mult),
          }));
        }
      }

      // mPrecision 해석:
      // - 0 이상인 경우에만 유효한 소수 자릿수 힌트로 취급한다.
      //   (예: 0 → 1자리, 1 → 2자리, ...)
      // - 음수(-1 등)는 "특별한 정밀도 지정 없음"으로 간주하고 무시한다.
      let effectivePrecision: number | undefined;
      if (typeof calc.mPrecision === "number" && calc.mPrecision >= 0) {
        // 실제 표시 자릿수는 항상 +1 해서 사용
        // 예: mPrecision=1 → 소수점 2자리, mPrecision=2 → 소수점 3자리
        effectivePrecision = calc.mPrecision + 1;
      } else {
        effectivePrecision = undefined;
      }

      return {
        base: finalBase,
        statParts: finalStatParts,
        isPercent,
        precision: effectivePrecision,
      };
    }

    throw new Error(`Unsupported mSpellCalculation type: ${rawType}`);
  }

  let result: CalcResult;
  try {
    result = evalCalc(calcKey);
  } catch (e) {
    logger.error("Failed to evaluate calculation:", e);
    return null;
  }

  return formatCalculationResult(result);
}
