import { ChampionSpell } from "@/types";
import {
  ParseResult,
  CommunityDragonSpellData,
  CalcResult,
  StatPart,
  SpellCalculation,
  GameCalculationModified,
  GameCalculation,
  CalculationPart,
  NamedDataValueCalculationPart,
  StatByNamedDataValueCalculationPart,
  ByCharLevelBreakpointsCalculationPart,
} from "./types";
import { getDataValueByName } from "./dataValueUtils";
import {
  add,
  mul,
  scaleBy100,
  valueToTooltipString,
  getStatName,
  isVector,
  Value,
} from "./valueUtils";

/**
 * mSpellCalculations를 사용하여 변수 치환
 */
export function replaceCalculateData(
  parseResult: ParseResult,
  spell: ChampionSpell,
  communityDragonData?: CommunityDragonSpellData
): string | null {
  const spellCalcs = communityDragonData?.mSpellCalculations;
  const dataValues = communityDragonData?.DataValues;
  if (!spellCalcs || !dataValues) return null;

  const entry = Object.entries(spellCalcs).find(
    ([k]) => k != null && k.toLowerCase() === parseResult.variable.toLowerCase()
  );
  if (!entry) return null;

  const [calcKey] = entry;

  function evalDataValue(name: string): Value {
    if (!name || typeof name !== "string") {
      throw new Error(`DataValue name is invalid: ${name}`);
    }
    const v = getDataValueByName(dataValues, name, spell.maxrank);
    if (v == null) throw new Error(`DataValue "${name}" missing`);
    return v;
  }

  function evalCalc(key: string, visited: Set<string> = new Set()): CalcResult {
    const raw = spellCalcs[key];
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

      if (!modified.mMultiplier || !modified.mMultiplier.mDataValue) {
        return inner;
      }

      const mult = evalDataValue(modified.mMultiplier.mDataValue);
      const newBase = mul(inner.base, mult);
      const newStatParts: StatPart[] = inner.statParts.map((sp) => ({
        name: sp.name,
        ratio: mul(sp.ratio, mult),
      }));

      return {
        base: newBase,
        statParts: newStatParts,
        isPercent: inner.isPercent,
      };
    }

    // GameCalculation: mFormulaParts를 숫자 base + 스탯 비율(statParts)로 분리
    if (raw.__type === "GameCalculation") {
      const calc = raw as GameCalculation;
      const parts = calc.mFormulaParts ?? [];
      let base: Value = 0;
      const statParts: StatPart[] = [];
      const isPercent: boolean = !!calc.mDisplayAsPercent;

      for (const part of parts) {
        const partType = part.__type as string;

        if (partType === "NamedDataValueCalculationPart") {
          // BaseDamage, BasePercentMaxHPDmgPerSec 등의 순수 값
          const namedPart = part as NamedDataValueCalculationPart;
          if (!namedPart.mDataValue) {
            console.warn(`NamedDataValueCalculationPart missing mDataValue`, part);
            continue;
          }
          const v = evalDataValue(namedPart.mDataValue);
          base = add(base, v);
        } else if (partType === "StatByNamedDataValueCalculationPart") {
          // ADRatioPerSecond, ADRatio 등: 스탯 계수 → 나중에 50% AD 같은 텍스트로 사용
          const statPart = part as StatByNamedDataValueCalculationPart;
          if (!statPart.mDataValue) {
            console.warn(`StatByNamedDataValueCalculationPart missing mDataValue`, part);
            continue;
          }
          const ratio = evalDataValue(statPart.mDataValue); // 0.5 or 벡터
          const name = getStatName(statPart.mStat, statPart.mStatFormula);
          statParts.push({ name, ratio });
        } else if (partType === "ByCharLevelBreakpointsCalculationPart") {
          const breakPart = part as ByCharLevelBreakpointsCalculationPart;
          let b = (breakPart.mLevel1Value as number) || 0;
          for (const bp of breakPart.mBreakpoints ?? []) {
            b += bp.mAdditionalBonusAtThisLevel;
          }
          base = add(base, b);
        }
      }

      return { base, statParts, isPercent };
    }

    throw new Error(`Unsupported mSpellCalculation type: ${raw.__type}`);
  }

  let result: CalcResult;
  try {
    result = evalCalc(calcKey);
  } catch (e) {
    console.error(e);
    return null;
  }

  // === 1) base 변환 ===
  let baseScaled: Value;

  if (result.isPercent) {
    // mDisplayAsPercent == true → 퍼센트 변환 필요
    baseScaled = scaleBy100(result.base);
  } else {
    // 일반 수치는 ×100 하면 안됨
    baseScaled = result.base;
  }

  // === 2) 스탯 계수 변환 (항상 percent) ===
  const statPartsScaled: StatPart[] = result.statParts.map((sp) => ({
    name: sp.name,
    ratio: scaleBy100(sp.ratio), // 0.5 → 50%, 0.2 → 20%
  }));

  // === 3) base 문자열 만들기 (mDisplayAsPercent === true이면 "%" 붙이기) ===
  let baseStr: string | null = null;

  const isZeroVector =
    isVector(baseScaled) && baseScaled.length > 0 && baseScaled.every((v) => v === 0);
  const isZeroScalar = !isVector(baseScaled) && baseScaled === 0;

  if (!isZeroVector && !isZeroScalar) {
    const rawStr = valueToTooltipString(baseScaled); // "4/8/12" 또는 "275"
    baseStr = result.isPercent ? `${rawStr}%` : rawStr; // 퍼센트면 끝에 % 하나 붙인다
  }

  // === 4) 스탯 계수 문자열 만들기 (항상 % + 스탯 이름) ===
  const statStrings: string[] = statPartsScaled.map((sp) => {
    const ratioStr = valueToTooltipString(sp.ratio); // "50" or "50/60/70"
    return `${ratioStr}% ${sp.name}`; // "50% AD", "50/60/70% AD"
  });

  // === 5) 최종 문자열 합치기 ===
  const parts: string[] = [];
  if (baseStr) parts.push(baseStr);
  parts.push(...statStrings);

  if (parts.length === 0) return null;

  // 예: "20/45/70/95/120 + 50% AD"
  // 예: "4/8/12/16/20/24/28%"
  return parts.join(" + ");
}

