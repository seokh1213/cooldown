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
  /**
   * effectBurn 값 (Community Dragon 원본 데이터)
   * - 0번 인덱스는 사용하지 않고 1번부터 실제 값
   * - 예: [null, "25/30/35/40/45", "2", "15", "0.5", ...]
   */
  effectBurn?: (string | null)[];
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
  /**
   * 챔피언 레벨에 따라 선형으로 증가하는 퍼센트 범위인지 여부
   * (예: 1레벨 40% ~ 16레벨 100% → "(40% ~ 100%)")
   */
  isCharLevelRange?: boolean;
  /**
   * 브레이크포인트 기반 단순 범위인지 여부
   * (예: 1레벨 12, 6레벨 -1, 11레벨 -3 → "(12 ~ 8)")
   */
  isBreakpointRange?: boolean;
  /**
   * 소수점 자릿수 (CommunityDragon GameCalculation.mPrecision)
   * - undefined 이면 기존처럼 정수(또는 formatNumber 기본 규칙)로 처리
   * - 0 이상이면 퍼센트/계수 계산 시 해당 자릿수까지 보존
   */
  precision?: number;
}

/**
 * 공통 multiplier 타입
 * GameCalculation / GameCalculationModified 둘 다에서 사용된다.
 */
export interface CalcMultiplier {
  mDataValue?: string;
  mNumber?: number;
}

/**
 * GameCalculationModified 타입
 */
export interface GameCalculationModified {
  __type: "GameCalculationModified";
  mModifiedGameCalculation?: string;
  mMultiplier?: CalcMultiplier;
}

/**
 * GameCalculation 타입
 */
export interface GameCalculation {
  __type: "GameCalculation";
  mFormulaParts?: CalculationPart[];
  mDisplayAsPercent?: boolean;
  /**
   * 계산식 전체에 곱해지는 multiplier
   * (예: 0.01 → 나중에 mDisplayAsPercent 에 의해 ×100 되면 최종적으로 1배 효과)
   */
  mMultiplier?: CalcMultiplier;
  /**
   * CommunityDragon mSimpleTooltipCalculationDisplay
   * 특정 계산식을 단순 범위 등으로 표현할 때 힌트로 사용
   */
  mSimpleTooltipCalculationDisplay?: number;
   /**
    * 퍼센트/계산 결과를 몇 자리까지 표시할지에 대한 힌트
    * (예: 1 → 소수점 1자리, 2 → 소수점 2자리)
    */
   mPrecision?: number;
}

/**
 * 서로 다른 서브 파트(mPart1, mPart2)의 곱을 나타내는 파트
 * 예: mPart1(HealthRefundOnHitMinionPercent) × mPart2(HealthCost)
 */
export interface ProductOfSubPartsCalculationPart {
  __type: "ProductOfSubPartsCalculationPart";
  // 서브 파트는 NamedDataValue, Number 등 다양한 타입이 올 수 있으므로 느슨하게 정의
  mPart1?: {
    __type?: string;
    mDataValue?: string;
    mNumber?: number;
  };
  mPart2?: {
    __type?: string;
    mDataValue?: string;
    mNumber?: number;
  };
}

/**
 * 챔피언 레벨에 따라 선형 보간되는 값 (시작값 ~ 끝값)
 * 예: mStartValue=0.8, mEndValue=0.95 → "(80% ~ 95%)"
 */
export interface ByCharLevelInterpolationCalculationPart {
  __type: "ByCharLevelInterpolationCalculationPart";
  mStartValue?: number;
  mEndValue?: number;
}

/**
 * 계산 파트 타입
 */
export type CalculationPart =
  | NamedDataValueCalculationPart
  | StatByNamedDataValueCalculationPart
  | StatByCoefficientCalculationPart
  | AbilityResourceByCoefficientCalculationPart
  | EffectValueCalculationPart
  | NumberCalculationPart
  | ByCharLevelBreakpointsCalculationPart
  | ProductOfSubPartsCalculationPart
  | ByCharLevelInterpolationCalculationPart;

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
 * AbilityResourceByCoefficientCalculationPart 타입
 * 스킬 자원(마나/기력 등)에 비례하는 계수.
 * - mCoefficient: 자원 비율 (예: 0.02 → 2%)
 * - mStatFormula: 2인 경우 "bonus" 자원으로 취급 (예: "bonus Mana")
 */
export interface AbilityResourceByCoefficientCalculationPart {
  __type: "AbilityResourceByCoefficientCalculationPart";
  mCoefficient?: number;
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
    /**
     * 일부 데이터에서는 레벨별 추가 보너스를 이 필드로 제공
     */
    mAdditionalBonusAtThisLevel?: number;
    /**
     * 다른 데이터(예: 갱플 Q 패시브)에서는 브레이크포인트 레벨만 제공
     * 예: { mLevel: 17 }
     */
    mLevel?: number;
  }>;
  /**
   * 1레벨 이후 레벨당 증가량 (예: 0.04 → 4%)
   * 갱플 Q 패시브의 "1레벨 40% ~ 16레벨 100%" 같은 계산에 사용
   */
  mInitialBonusPerLevel?: number;
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

