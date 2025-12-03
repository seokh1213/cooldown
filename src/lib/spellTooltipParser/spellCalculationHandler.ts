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
} from "./types";
import { getDataValueByName } from "./dataValueUtils";
import { Value } from "./types";
import type { Language } from "@/i18n";
import { getTranslations } from "@/i18n";
import {
  add,
  mul,
  scaleBy100,
  valueToTooltipString,
  getStatName,
  isVector,
  getAbilityResourceName,
} from "./valueUtils";
import { formatNumber } from "./formatters";
import { logger } from "@/lib/logger";

/**
 * mPrecision 이 지정된 경우, 값(Value)을 해당 소수점 자릿수까지 포맷팅
 */
function formatValueWithPrecision(value: Value, precision: number): string {
  const formatNumberWithPrecision = (num: number): string => {
    if (!Number.isFinite(num)) return String(num);
    const fixed = num.toFixed(precision);
    // 불필요한 0 및 소수점 제거 (예: "0.3000" → "0.3", "1.000" → "1")
    return fixed.replace(/\.?0+$/, "");
  };

  if (isVector(value)) {
    const formatted = value.map((v) => formatNumberWithPrecision(v));
    const first = formatted[0];
    const allSame = formatted.every((v) => v === first);
    return allSame ? first : formatted.join("/");
  }

  return formatNumberWithPrecision(value as number);
}

/**
 * mSpellCalculations를 사용하여 변수 치환
 */
export function replaceCalculateData(
  parseResult: ParseResult,
  spell: ChampionSpell,
  communityDragonData?: CommunityDragonSpellData,
  lang: Language = "ko_KR"
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
    const raw: any = spellCalcs[key];
    if (!raw) throw new Error(`SpellCalculation "${key}" not found`);

    if (visited.has(key))
      throw new Error(`Circular reference in mSpellCalculations: ${key}`);
    visited.add(key);

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
        (parts[0] as any).__type === "ByCharLevelBreakpointsCalculationPart" &&
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
        (parts[0] as any).__type === "ByCharLevelBreakpointsCalculationPart" &&
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

      // === 특수 케이스: 선형 보간 퍼센트 범위 (ByCharLevelInterpolationCalculationPart) ===
      // 예: mStartValue=0.8, mEndValue=0.95, mDisplayAsPercent=true
      //  → "(80% ~ 95%)"
      if (
        parts.length === 1 &&
        (parts[0] as any).__type === "ByCharLevelInterpolationCalculationPart" &&
        isPercent
      ) {
        const interpPart = parts[0] as ByCharLevelInterpolationCalculationPart;
        const start = interpPart.mStartValue ?? 0;
        const end = interpPart.mEndValue ?? start;
        const rangeBase: Value = [start, end];

        return {
          base: rangeBase,
          statParts: [],
          isPercent: true,
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
          const t = getTranslations(lang);

          // mStatFormula: 2 → bonus 자원
          const isBonus = resPart.mStatFormula === 2;
          const name = isBonus ? `${t.common.bonus} ${resourceName}` : resourceName;

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
          // mPart1 × mPart2 형태의 곱 연산
          // 예: HealthRefundOnHitChampionMonsterPercent × HealthCost
          const prodPart = part as any;

          const evalSimplePart = (p: any): Value => {
            if (!p || !p.__type) return 0;
            const t = p.__type as string;

            if (t === "NamedDataValueCalculationPart") {
              const named = p as NamedDataValueCalculationPart;
              if (!named.mDataValue) {
                logger.debug(
                  `ProductOfSubPartsCalculationPart: NamedDataValueCalculationPart missing mDataValue`,
                  p
                );
                return 0;
              }
              const v = evalDataValue(named.mDataValue);
              if (v == null) {
                // DataValue가 없으면 0 반환
                return 0;
              }
              return v;
            }

            if (t === "NumberCalculationPart") {
              const num = (p as NumberCalculationPart).mNumber ?? 0;
              return num;
            }

            if (t === "EffectValueCalculationPart") {
              const effect = p as EffectValueCalculationPart;
              const idx = effect.mEffectIndex ?? 0;
              const effectBurn = spell.effectBurn?.[idx] ?? null;

              if (!effectBurn) {
                logger.debug(
                  `ProductOfSubPartsCalculationPart: EffectValueCalculationPart missing effectBurn[${idx}]`,
                  {
                    spellId: spell.id,
                  }
                );
                return 0;
              }

              // "80/100/120" → [80, 100, 120]
              // "0.5" → 0.5
              let v: Value;
              if (effectBurn.includes("/")) {
                const nums = effectBurn
                  .split("/")
                  .map((s) => Number.parseFloat(s))
                  .filter((n) => !Number.isNaN(n));

                if (nums.length === 0) return 0;
                v = nums.length === 1 ? nums[0] : nums;
              } else {
                const num = Number.parseFloat(effectBurn);
                if (Number.isNaN(num)) return 0;
                v = num;
              }

              return v;
            }

            // 현재는 위 두 타입만 필요해서 지원하고,
            // 그 외 타입이 들어오면 0으로 취급 (경고 로그만 남김)
            logger.debug(
              `ProductOfSubPartsCalculationPart: unsupported sub part type "${t}"`,
              p
            );
            return 0;
          };

          const left = evalSimplePart(prodPart.mPart1);
          const right = evalSimplePart(prodPart.mPart2);
          const product = mul(left, right);
          base = add(base, product);
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

    throw new Error(`Unsupported mSpellCalculation type: ${raw.__type}`);
  }

  let result: CalcResult;
  try {
    result = evalCalc(calcKey);
  } catch (e) {
    logger.error("Failed to evaluate calculation:", e);
    return null;
  }

  // === 1) base 변환 ===
  let baseScaled: Value;
  const precision = result.precision;

  if (result.isPercent) {
    // mDisplayAsPercent == true → 퍼센트 변환 필요
    // - mPrecision 이 있으면 소수점까지 보존 (순수 ×100만 수행)
    // - 없으면 기존처럼 정수 퍼센트로 반올림
    if (precision != null) {
      if (isVector(result.base)) {
        baseScaled = result.base.map((v) => v * 100);
      } else {
        baseScaled = (result.base as number) * 100;
      }
    } else {
      baseScaled = scaleBy100(result.base);
    }
  } else {
    // 일반 수치는 ×100 하면 안됨
    baseScaled = result.base;
  }

  // === 2) 스탯 계수 변환 (항상 percent) ===
  const statPartsScaled: StatPart[] = result.statParts.map((sp) => {
    if (sp.isCoefficient) {
      // StatByCoefficientCalculationPart 에서 온 계수는
      // mCoefficient * 100 으로 퍼센트로 바꾸되,
      // - mPrecision 이 있으면 그대로 ×100 만 수행
      // - 없으면 scaleBy100 을 사용해 소수 자릿수를 보존하고,
      //   반올림/표시는 formatNumber 쪽에 맡긴다.
      const ratio: Value =
        precision != null
          ? isVector(sp.ratio)
            ? sp.ratio.map((v) => v * 100)
            : (sp.ratio as number) * 100
          : scaleBy100(sp.ratio); // 0.004 → 0.4, 0.0001 → 0.01 등 소수 유지
      return {
        ...sp,
        ratio,
      };
    }

    // 나머지 일반 스탯 비율(AD/AP 등)
    // - mPrecision 이 있으면 소수점까지 보존 (순수 ×100만 수행)
    // - 없으면 기존 로직 유지: ×100 후 반올림
    if (precision != null) {
      const ratio =
        isVector(sp.ratio)
          ? sp.ratio.map((v) => v * 100)
          : (sp.ratio as number) * 100;
      return {
        ...sp,
        ratio,
      };
    }

    return {
      ...sp,
      ratio: scaleBy100(sp.ratio), // 0.5 → 50%, 0.2 → 20%
    };
  });

  // === 3) base 문자열 만들기 (mDisplayAsPercent === true이면 "%" 붙이기) ===
  let baseStr: string | null = null;

  const isZeroVector =
    isVector(baseScaled) && baseScaled.length > 0 && baseScaled.every((v) => v === 0);
  const isZeroScalar = !isVector(baseScaled) && baseScaled === 0;

  if (!isZeroVector && !isZeroScalar) {
    // 챔피언 레벨 범위 퍼센트 (예: "(40% ~ 100%)")
    if (result.isCharLevelRange && isVector(baseScaled) && baseScaled.length === 2) {
      const [minVal, maxVal] = baseScaled;
      const minStr = formatNumber(minVal);
      const maxStr = formatNumber(maxVal);
      baseStr = `(${minStr}% ~ ${maxStr}%)`;
    } else if (
      result.isBreakpointRange &&
      isVector(baseScaled) &&
      baseScaled.length === 2
    ) {
      const [minVal, maxVal] = baseScaled;
      const minStr = formatNumber(minVal);
      const maxStr = formatNumber(maxVal);
      baseStr = result.isPercent
        ? `(${minStr}% ~ ${maxStr}%)`
        : `(${minStr} ~ ${maxStr})`;
    } else {
      const rawStr =
        precision != null
          ? formatValueWithPrecision(baseScaled, precision)
          : valueToTooltipString(baseScaled); // "4/8/12" 또는 "275"
      baseStr = result.isPercent ? `${rawStr}%` : rawStr; // 퍼센트면 끝에 % 하나 붙인다
    }
  }

  // === 4) 스탯 계수 문자열 만들기 (항상 % + 스탯 이름) ===
  const statStrings: string[] = statPartsScaled.map((sp) => {
    const ratioStr =
      precision != null
        ? formatValueWithPrecision(sp.ratio, precision)
        : valueToTooltipString(sp.ratio); // "50" or "50/60/70"
    // 스탯 계수는 가독성을 위해 괄호로 묶어서 표시
    // 예: "(60% bonus AD)", "(0.03% bonus AD)", "(50% AD)"
    if (!sp.name) {
      // 스탯 이름이 없으면 순수 퍼센트만 괄호로 묶어 노출
      return `(${ratioStr}%)`;
    }
    return `(${ratioStr}% ${sp.name})`;
  });

  // === 5) 최종 문자열 합치기 ===
  const parts: string[] = [];
  if (baseStr) parts.push(baseStr);
  parts.push(...statStrings);

  if (parts.length === 0) return null;

  // 예: "20/45/70/95/120 + 50% AD"
  // 예: "4/8/12/16/20/24/28%"
  const resultStr = parts.join(" + ");
  // 단건일 때는 괄호를 추가하지 않음 (이미 각 항목이 괄호로 묶여있을 수 있음)
  // 여러 항목이 합쳐진 경우에만 괄호로 묶음
  return parts.length === 1 ? resultStr : `(${resultStr})`;
}

