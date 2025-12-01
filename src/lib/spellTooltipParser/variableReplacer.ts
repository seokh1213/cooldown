import {ChampionSpell} from "@/types";
import {formatLevelValues, formatNumber} from "./formatters";
import {parseExpression, ParseResult} from "@/components/features/ChampionComparison/utils.ts";

/**
 * 변수 치환 ({{ variable }} 형식)
 * 레벨별 값은 "/" 형식으로 표시
 * HTML 태그 내부의 변수도 치환하되, 태그 구조는 보존
 * @param text
 * @param spell
 * @param level
 * @param showAllLevels
 * @param communityDragonData Community Dragon에서 가져온 스킬 데이터 (선택적)
 */
export function replaceVariables(
  text: string,
  spell?: ChampionSpell,
  communityDragonData?: Record<string, Record<string, number[]>>
): string {
  if (!spell) return text;

  let result = text;

  // 이미 치환된 변수를 추적하여 중복 방지
  const replacedVars = new Set<string>();

  // 먼저 중첩된 패턴을 제거하거나 처리
  result = result.replace(/\{\{([^}]*\{\{[^}]*}}[^}]*)}}/g, () => {
    // 중첩된 변수 패턴은 제거 (게임 모드별 tooltip 등은 처리 불가)
    return "";
  });

  // Spell_*_Tooltip 패턴 제거 (Community Dragon에서도 치환이 안되는 값)
  result = result.replace(/\{\{Spell_[^}]*Tooltip[^}]*}}/gi, "");

  // spellmodifierdescriptionappend 단독 패턴 제거
  result = result.replace(/\{\{spellmodifierdescriptionappend}}/gi, "");

  // {{ variable }} 패턴 찾기 (HTML 태그 내부도 포함)
  // 하지만 HTML 태그 자체는 건드리지 않음
  const variableRegex = /\{\{([^}]+)}}/g;

  result = result.replace(variableRegex, (_match, variableName) => {
    const trimmedVar = variableName.trim();

    // 이미 치환된 변수는 건너뛰기 (중복 방지)
    if (replacedVars.has(trimmedVar)) {
      return "";
    }

    // 특수 변수 처리 (spellmodifierdescriptionappend 등)
    if (
      trimmedVar === "spellmodifierdescriptionappend" ||
      trimmedVar.includes("gamemodeinteger") ||
      (trimmedVar.includes("Spell_") && trimmedVar.includes("Tooltip"))
    ) {
      // 이런 변수들은 제거
      replacedVars.add(trimmedVar);
      return "";
    }

    console.log(trimmedVar, spell, communityDragonData)

    // 변수 치환 로직
    const replacement = replaceVariable(
      trimmedVar,
      spell,
      communityDragonData,
      replacedVars
    );

    if (replacement !== null) {
      replacedVars.add(trimmedVar);
      return replacement;
    }

    // 값을 찾을 수 없으면 빈 문자열로 제거
    return "";
  });

  // 치환 후 남은 불완전한 변수 패턴 제거 ({{ 또는 }}만 남은 경우)
  result = result.replace(/\{\{\s*\}/g, ""); // {{ }} 패턴 제거
  result = result.replace(/\}\}/g, ""); // 남은 }} 제거
  result = result.replace(/\{\{/g, ""); // 남은 {{ 제거

  // 치환 후 남은 "%" 기호가 혼자 있는 경우 제거
  result = result.replace(/\s+%\s+/g, " "); // 공백으로 둘러싸인 % 제거
  result = result.replace(/(?<!\d)\s*%\s*(?!\d)/g, ""); // 숫자와 함께 있지 않은 % 제거
  result = result.replace(/^\s*%\s*/g, ""); // 시작 부분의 % 제거
  result = result.replace(/\s*%\s*$/g, ""); // 끝 부분의 % 제거

  // 중복된 숫자 패턴 제거 (예: "25/30/35% 0.25/0.3/0.35" -> "25/30/35%")
  result = removeDuplicatePercentPatterns(result);

  // 연속된 공백 정리
  result = result.replace(/\s+/g, " ").trim();

  return result;
}

// ====================== 타입 정의 ======================

type Value = number | number[];

interface ChampionSpell {
  maxrank: number;
}

interface ParseResult {
  type: "plain" | "formula";
  variable: string;
  operator?: "*" | "+";
  operand?: number;
}

interface CommunityDragonSpellData {
  DataValues?: Record<string, number[]>;
  mSpellCalculations?: Record<string, any>;
}

// 프로젝트에 이미 있다고 가정
declare function parseExpression(raw: string): ParseResult;
declare function formatNumber(n: number): string;

// ====================== 유틸 함수 ======================

function isVector(v: Value): v is number[] {
  return Array.isArray(v);
}

function toVector(v: Value, length: number): number[] {
  if (Array.isArray(v)) return v;
  return Array.from({ length }, () => v);
}

function binaryOp(a: Value, b: Value, op: (x: number, y: number) => number): Value {
  if (!isVector(a) && !isVector(b)) {
    return op(a, b);
  }
  const aVec = isVector(a) ? a : toVector(a, isVector(b) ? b.length : 1);
  const bVec = isVector(b) ? b : toVector(b, aVec.length);

  if (aVec.length !== bVec.length) {
    throw new Error(`Vector length mismatch: ${aVec.length} vs ${bVec.length}`);
  }

  return aVec.map((x, i) => op(x, bVec[i]));
}

function add(a: Value, b: Value): Value {
  return binaryOp(a, b, (x, y) => x + y);
}

function mul(a: Value, b: Value): Value {
  return binaryOp(a, b, (x, y) => x * y);
}

// ---------------------- DataValues 처리 ----------------------

// 0번 인덱스는 버퍼, 1 ~ maxRank 까지만 사용
// 모든 값이 같으면 스칼라, 아니면 벡터
function getDataValueByName(
  dataValues: Record<string, number[]>,
  key: string,
  maxRank: number
): Value | null {
  if (!key || typeof key !== 'string') return null;
  const entry = Object.entries(dataValues).find(
    ([name]) => name != null && name.toLowerCase() === key.toLowerCase()
  );
  if (!entry) return null;

  const [, raw] = entry;
  const levelData = raw.slice(1, maxRank + 1); // 여기서 slice(1, maxRank+1)

  if (levelData.length === 0) return null;

  const first = levelData[0];
  const isScalar = levelData.every(v => v === first);
  return isScalar ? first : levelData;
}

// {{ VAR * 100 }}, {{ VAR + 3 }} 같은 템플릿용 (DataValues 전용으로 쓰는 느낌)
function applyFormulaToValue(value: Value, parseResult: ParseResult): Value {
  if (parseResult.type !== "formula" || !parseResult.operator || parseResult.operand == null) {
    return value;
  }

  const { operator, operand } = parseResult;

  if (operator === "*") {
    if (isVector(value)) return value.map(v => v * operand);
    return value * operand;
  }

  if (operator === "+") {
    if (isVector(value)) return value.map(v => v + operand);
    return value + operand;
  }

  return value;
}

function valueToTooltipString(value: Value): string {
  if (isVector(value)) {
    const agg = value.every(v => v === value[0]);
    return agg ? formatNumber(value[0]) : value.map(v => formatNumber(v)).join("/");
  }
  return formatNumber(value);
}

// Value ×100 후 반올림
function scaleBy100(value: Value): Value {
  if (isVector(value)) return value.map(v => Math.round(v * 100));
  return Math.round(value * 100);
}

// 스탯 코드 → 이름 (필요하면 확장)
function getStatName(mStat?: number, mStatFormula?: number): string {
  const s = mStat ?? mStatFormula;
  if (s === 2) return "AD";
  if (s === 3) return "AP";
  return "stat";
}

// ====================== 메인 엔트리 ======================

export function replaceVariable(
  trimmedVar: string,
  spell: ChampionSpell,
  communityDragonData?: CommunityDragonSpellData,
  _replacedVars?: Set<string>
): string | null {
  const parseResult = parseExpression(trimmedVar);

  // 1. DataValues 먼저 시도
  const byData = replaceData(parseResult, spell, communityDragonData);
  if (byData !== null) return byData;

  // 2. 안 되면 mSpellCalculations
  return replaceCalculateData(parseResult, spell, communityDragonData);
}

// ====================== DataValues 처리 ======================

function replaceData(
  parseResult: ParseResult,
  spell: ChampionSpell,
  communityDragonData?: CommunityDragonSpellData
): string | null {
  const dataValues = communityDragonData?.DataValues;
  if (!dataValues) return null;

  const value = getDataValueByName(dataValues, parseResult.variable, spell.maxrank);
  if (value == null) return null;

  const withFormula = applyFormulaToValue(value, parseResult);
  return valueToTooltipString(withFormula);
}

// ====================== mSpellCalculations 처리 ======================

interface StatPart {
  name: string;   // "AD", "AP" 등
  ratio: Value;   // 0.5 → 나중에 50 (%)
}

interface CalcResult {
  base: Value;          // 순수 숫자 (예: 0.02/0.04/0.06, 혹은 2.75 등)
  statParts: StatPart[]; // + 0.5 AD 같은 비율
  isPercent?: boolean;   // mDisplayAsPercent
}

function replaceCalculateData(
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
    if (!name || typeof name !== 'string') {
      throw new Error(`DataValue name is invalid: ${name}`);
    }
    const v = getDataValueByName(dataValues, name, spell.maxrank);
    if (v == null) throw new Error(`DataValue "${name}" missing`);
    return v;
  }

  function evalCalc(
    key: string,
    visited: Set<string> = new Set()
  ): CalcResult {
    const raw = spellCalcs[key];
    if (!raw) throw new Error(`SpellCalculation "${key}" not found`);

    if (visited.has(key)) throw new Error(`Circular reference in mSpellCalculations: ${key}`);
    visited.add(key);

    // GameCalculationModified: 내부 계산 결과(base, statParts)를 multiplier로 스케일
    if (raw.__type === "GameCalculationModified") {
      if (!raw.mModifiedGameCalculation) {
        throw new Error(`mModifiedGameCalculation is missing`);
      }
      const inner = evalCalc(raw.mModifiedGameCalculation, visited);

      if (!raw.mMultiplier || !raw.mMultiplier.mDataValue) {
        return inner;
      }

      const mult = evalDataValue(raw.mMultiplier.mDataValue);
      const newBase = mul(inner.base, mult);
      const newStatParts: StatPart[] = inner.statParts.map(sp => ({
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
      const parts = raw.mFormulaParts ?? [];
      let base: Value = 0;
      const statParts: StatPart[] = [];
      const isPercent: boolean = !!raw.mDisplayAsPercent;

      for (const part of parts) {
        const partType = part.__type as string;

        if (partType === "NamedDataValueCalculationPart") {
          // BaseDamage, BasePercentMaxHPDmgPerSec 등의 순수 값
          if (!part.mDataValue) {
            console.warn(`NamedDataValueCalculationPart missing mDataValue`, part);
            continue;
          }
          const v = evalDataValue(part.mDataValue);
          base = add(base, v);
        } else if (partType === "StatByNamedDataValueCalculationPart") {
          // ADRatioPerSecond, ADRatio 등: 스탯 계수 → 나중에 50% AD 같은 텍스트로 사용
          if (!part.mDataValue) {
            console.warn(`StatByNamedDataValueCalculationPart missing mDataValue`, part);
            continue;
          }
          const ratio = evalDataValue(part.mDataValue); // 0.5 or 벡터
          const name = getStatName(part.mStat, part.mStatFormula);
          statParts.push({ name, ratio });
        } else if (partType === "ByCharLevelBreakpointsCalculationPart") {
          let b = part.mLevel1Value as number;
          for (const bp of part.mBreakpoints ?? []) {
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
  const statPartsScaled: StatPart[] = result.statParts.map(sp => ({
    name: sp.name,
    ratio: scaleBy100(sp.ratio),  // 0.5 → 50%, 0.2 → 20%
  }));

  // === 2) base 문자열 만들기 (mDisplayAsPercent === true이면 "%" 붙이기) ===
  let baseStr: string | null = null;

  const isZeroVector =
    isVector(baseScaled) && baseScaled.length > 0 && baseScaled.every(v => v === 0);
  const isZeroScalar = !isVector(baseScaled) && baseScaled === 0;

  if (!isZeroVector && !isZeroScalar) {
    const rawStr = valueToTooltipString(baseScaled); // "4/8/12" 또는 "275"
    baseStr = result.isPercent ? `${rawStr}%` : rawStr; // 퍼센트면 끝에 % 하나 붙인다
  }

  // === 3) 스탯 계수 문자열 만들기 (항상 % + 스탯 이름) ===
  const statStrings: string[] = statPartsScaled.map(sp => {
    const ratioStr = valueToTooltipString(sp.ratio); // "50" or "50/60/70"
    return `${ratioStr}% ${sp.name}`;               // "50% AD", "50/60/70% AD"
  });

  // === 4) 최종 문자열 합치기 ===
  const parts: string[] = [];
  if (baseStr) parts.push(baseStr);
  parts.push(...statStrings);

  if (parts.length === 0) return null;

  // 예: "20/45/70/95/120 + 50% AD"
  // 예: "4/8/12/16/20/24/28%"
  return parts.join(" + ");
}


/**
 * 중복된 퍼센트 패턴 제거
 */
function removeDuplicatePercentPatterns(result: string): string {
  // 텍스트에서 모든 퍼센트 값 찾기
  const percentMatches: Array<{ value: string; index: number }> = [];
  const percentRegex = /(\d+(?:\/\d+)+)%/g;
  let match;
  while ((match = percentRegex.exec(result)) !== null) {
    percentMatches.push({value: match[1], index: match.index});
  }

  // 텍스트에서 모든 소수점 패턴 찾기 (0.숫자/0.숫자 형식)
  const decimalRegex = /(0\.[0-9]+(?:\/0?\.[0-9]+)+)/g;
  const decimalMatches: Array<{ value: string; index: number }> = [];
  while ((match = decimalRegex.exec(result)) !== null) {
    decimalMatches.push({value: match[1], index: match.index});
  }

  // 각 소수점 패턴이 퍼센트 값과 같은지 확인하고 제거
  for (let i = decimalMatches.length - 1; i >= 0; i--) {
    const decimalMatch = decimalMatches[i];
    const decimalValues = decimalMatch.value.split("/").map((v) => parseFloat(v));

    // 앞에 있는 퍼센트 값과 비교
    for (const percentMatch of percentMatches) {
      if (percentMatch.index < decimalMatch.index) {
        const percentValues = percentMatch.value.split("/").map((v) => parseFloat(v));

        // 같은 값인지 확인 (퍼센트 값을 100으로 나눈 값과 소수점 값 비교)
        if (
          percentValues.length === decimalValues.length &&
          percentValues.length > 0
        ) {
          const isSame = percentValues.every((pv, idx) => {
            if (idx >= decimalValues.length) return false;
            const expectedDecimal = pv / 100;
            return Math.abs(expectedDecimal - decimalValues[idx]) < 0.01;
          });

          if (isSame) {
            // 소수점 패턴 제거
            const before = result.substring(0, decimalMatch.index);
            const after = result.substring(decimalMatch.index + decimalMatch.value.length);
            result = (before + after).replace(/\s+/g, " ").trim();
            break; // 하나만 제거하고 다음으로
          }
        }
      }
    }
  }

  return result;
}

