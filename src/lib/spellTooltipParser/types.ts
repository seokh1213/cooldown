import { ChampionSpell } from "@/types";

/**
 * 변수 파싱 결과
 */
export type ParseResult =
  | { type: "formula"; variable: string; operator: "*" | "+" | "-" | "/"; operand: number }
  | { type: "variable"; variable: string };

/**
 * 값 타입 (스칼라 또는 벡터)
 */
export type Value = number | number[];

/**
 * Community Dragon 스킬 데이터 구조
 */
export interface CommunityDragonSpellData {
  DataValues?: Record<string, number[]>;
  mSpellCalculations?: Record<string, SpellCalculation>;
}

/**
 * 스탯 비율 파트
 */
export interface StatPart {
  name: string; // "AD", "AP" 등
  ratio: Value; // 0.5 → 나중에 50 (%)
  /**
   * StatByCoefficientCalculationPart 로부터 온 계수인지 여부
   * (표시 시에만 특수 처리 – 예: "100%" 처럼 스탯 이름 없이 보여주기)
   */
  isCoefficient?: boolean;
}

/**
 * 계산 결과
 */
export interface CalcResult {
  base: Value; // 순수 숫자 (예: 0.02/0.04/0.06, 혹은 2.75 등)
  statParts: StatPart[]; // + 0.5 AD 같은 비율
  isPercent?: boolean; // mDisplayAsPercent
}

/**
 * GameCalculationModified 타입
 */
export interface GameCalculationModified {
  __type: "GameCalculationModified";
  mModifiedGameCalculation?: string;
  mMultiplier?: {
    mDataValue?: string;
    mNumber?: number;
  };
}

/**
 * GameCalculation 타입
 */
export interface GameCalculation {
  __type: "GameCalculation";
  mFormulaParts?: CalculationPart[];
  mDisplayAsPercent?: boolean;
}

/**
 * 계산 파트 타입
 */
export type CalculationPart =
  | NamedDataValueCalculationPart
  | StatByNamedDataValueCalculationPart
  | StatByCoefficientCalculationPart
  | EffectValueCalculationPart
  | NumberCalculationPart
  | ByCharLevelBreakpointsCalculationPart;

/**
 * NamedDataValueCalculationPart 타입
 */
export interface NamedDataValueCalculationPart {
  __type: "NamedDataValueCalculationPart";
  mDataValue?: string;
}

/**
 * StatByNamedDataValueCalculationPart 타입
 */
export interface StatByNamedDataValueCalculationPart {
  __type: "StatByNamedDataValueCalculationPart";
  mDataValue?: string;
  mStat?: number;
  mStatFormula?: number;
}

/**
 * StatByCoefficientCalculationPart 타입
 * mCoefficient(계수)에 스탯이 붙는 경우(mStat / mStatFormula)도 있고,
 * 순수 계수만 있는 경우도 있다.
 */
export interface StatByCoefficientCalculationPart {
  __type: "StatByCoefficientCalculationPart";
  mCoefficient?: number;
  mStat?: number;
  mStatFormula?: number;
}

/**
 * EffectValueCalculationPart 타입
 * spell.effectBurn / effect 등을 참조하는 파트
 */
export interface EffectValueCalculationPart {
  __type: "EffectValueCalculationPart";
  mEffectIndex?: number;
}

/**
 * NumberCalculationPart 타입
 * 고정 숫자 상수(예: 5)를 base 값에 더할 때 사용
 */
export interface NumberCalculationPart {
  __type: "NumberCalculationPart";
  mNumber?: number;
}

/**
 * ByCharLevelBreakpointsCalculationPart 타입
 */
export interface ByCharLevelBreakpointsCalculationPart {
  __type: "ByCharLevelBreakpointsCalculationPart";
  mLevel1Value?: number;
  mBreakpoints?: Array<{
    mAdditionalBonusAtThisLevel: number;
  }>;
}

/**
 * SpellCalculation 유니온 타입
 */
export type SpellCalculation = GameCalculationModified | GameCalculation;

/**
 * 변수 치환 함수 시그니처
 */
export type VariableReplacer = (
  trimmedVar: string,
  spell: ChampionSpell,
  communityDragonData?: CommunityDragonSpellData,
  replacedVars?: Set<string>
) => string | null;

