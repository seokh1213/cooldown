import { ChampionSpell } from "@/types";

export type TooltipLocale = "ko_KR" | "en_US" | "zh_CN";

/**
 * 변수 파싱 결과
 */
export type ParseResult =
  | {
      type: "formula";
      variable: string;
      operator: "*" | "+" | "-" | "/";
      operand: number;
      /** `spell.jaycetotheskies:damage` 처럼 다른 스킬을 가리키는 경우의 스킬 이름 */
      spellRef?: string;
    }
  | { type: "variable"; variable: string; spellRef?: string };

/**
 * 값 타입 (스칼라 또는 벡터)
 */
export type Value = number | number[];

export interface TooltipRenderResult {
  html: string;
  unresolvedTokens: string[];
}

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
  /**
   * 같은 챔피언의 다른 스킬 데이터 (스킬 이름 소문자 → 데이터)
   *
   * DDragon 툴팁은 `{{ spell.gnarq:minitotaldamage }}` 처럼 스킬을 명시해
   * 값을 참조하는 경우가 있다. 자기 자신을 가리킬 때도 있고(자벌레 폼처럼)
   * 제이스·나피리같이 다른 스킬을 가리킬 때도 있어서 형제 스킬 맵이 필요하다.
   */
  siblings?: Record<string, CommunityDragonSpellData>;
  /** CDragon 원문 툴팁이 실제로 참조한 계산식 키 (등장 순서). */
  preferredSimulationCalculationKeys?: string[];
  /** 원문 피해 태그에서 확인한 계산식별 피해 유형. */
  simulationCalculationDamageTypes?: Record<
    string,
    "physical" | "magical" | "true"
  >;
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
   * 랭크별 값과 함께 더해지는 레벨 범위 항.
   *
   * "50/80/110 + (250 ~ 550)" 처럼 길이가 다른 두 값은 하나로 합칠 수 없다.
   * 예전에는 이런 항을 통째로 버렸는데, 따로 들고 있다가 옆에 붙여 적는다.
   */
  extraRanges?: Value[];
  /**
   * 스탯에 비례하는 배율 (치명타 확률, 추가 공격 속도 등)
   *
   * 런타임 스탯을 모르면 하나의 숫자로 접을 수 없다.
   * 접어버리면 "스탯 0" 가정의 값이 되어 실제보다 작아지므로,
   * 접지 않고 "× (1 + 30% 추가 공격 속도)" 형태로 함께 노출한다.
   */
  statMultiplier?: {
    base: Value;
    statParts: StatPart[];
    /** base 를 퍼센트로 적어야 하는지 여부 */
    isPercent?: boolean;
  };
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
 *
 * 단순히 {mDataValue} / {mNumber} 만 오는 경우도 있지만,
 * SumOfSubParts / CooldownMultiplier / SpellCalculationSubPart 처럼
 * 계산 파트가 통째로 오는 경우도 있어 __type 을 함께 받는다.
 */
export interface CalcMultiplier {
  __type?: string;
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
  // 서브 파트에는 SumOfSubParts 같은 중첩 파트도 오므로 CalculationPart 로 받는다
  mPart1?: CalculationPart;
  mPart2?: CalculationPart;
}

/**
 * 여러 서브 파트의 합
 * 예: 1 + QSweetSpotBonus
 */
export interface SumOfSubPartsCalculationPart {
  __type: "SumOfSubPartsCalculationPart";
  mSubparts?: CalculationPart[];
}

/**
 * 서브 파트 합을 [mFloor, mCeiling] 범위로 자르는 파트
 */
export interface ClampSubPartsCalculationPart {
  __type: "ClampSubPartsCalculationPart";
  mSubparts?: CalculationPart[];
  mFloor?: number;
  mCeiling?: number;
}

/**
 * 서브 파트 결과를 특정 스탯의 계수로 사용하는 파트
 * 예: mStat=8, mSubpart=(1 + bonus AS 계수) → "N% 스탯"
 */
export interface StatBySubPartCalculationPart {
  __type: "StatBySubPartCalculationPart";
  mSubpart?: CalculationPart;
  mStat?: number;
  mStatFormula?: number;
}

/**
 * 챔피언 레벨별 값을 통째로 나열한 파트 (values[0] = 1레벨)
 * 툴팁에서는 1레벨 ~ 18레벨 범위로 표현한다.
 */
export interface ByCharLevelFormulaCalculationPart {
  __type: "ByCharLevelFormulaCalculationPart";
  values?: number[];
}

/**
 * 버프 중첩 수에 비례하는 값 (중첩당 DataValue)
 * 런타임 중첩 수를 모르므로 툴팁에는 "중첩당 값" 을 노출한다.
 */
export interface BuffCounterByNamedDataValueCalculationPart {
  __type: "BuffCounterByNamedDataValueCalculationPart";
  mBuffName?: string;
  mDataValue?: string;
  mIconKey?: string;
}

/**
 * 버프 중첩 수에 비례하는 값 (중첩당 계수)
 */
export interface BuffCounterByCoefficientCalculationPart {
  __type: "BuffCounterByCoefficientCalculationPart";
  mBuffName?: string;
  mCoefficient?: number;
}

/**
 * 스킬 쿨다운 자체를 값으로 사용하는 파트 (필드 없음)
 * 예: mMultiplier 로 쓰이면 "계산 결과 × 쿨다운"
 */
export interface CooldownMultiplierCalculationPart {
  __type: "CooldownMultiplierCalculationPart";
}

/**
 * 다른 mSpellCalculations 항목을 참조하는 파트
 * CommunityDragon 에서 타입명이 해시(`{f3cbe7b2}`)로 남아 있어 키로 식별한다.
 */
export interface SpellCalculationSubPart {
  __type: string;
  mSpellCalculationKey?: string;
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
  | ByCharLevelInterpolationCalculationPart
  | SumOfSubPartsCalculationPart
  | ClampSubPartsCalculationPart
  | StatBySubPartCalculationPart
  | ByCharLevelFormulaCalculationPart
  | CooldownMultiplierCalculationPart
  | BuffCounterByNamedDataValueCalculationPart
  | BuffCounterByCoefficientCalculationPart
  | SpellCalculationSubPart;

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
    /**
     * 해당 레벨부터 레벨당 붙는 증가량
     * 예) 파이크 R: 7레벨부터 +40/레벨, 10레벨부터 +30/레벨 …
     */
    mBonusPerLevelAtAndAfter?: number;
  }>;
  /**
   * 1레벨 이후 레벨당 증가량 (예: 0.04 → 4%)
   * 갱플 Q 패시브의 "1레벨 40% ~ 16레벨 100%" 같은 계산에 사용
   */
  mInitialBonusPerLevel?: number;
}

/**
 * 조건부 계산식
 * 버프 보유 여부 등 런타임 상태에 따라 계산식이 갈리는 경우로,
 * 툴팁에서는 기본(mDefaultGameCalculation) 값을 사용한다.
 */
export interface GameCalculationConditional {
  __type: "GameCalculationConditional";
  mDefaultGameCalculation?: string;
  mConditionalGameCalculation?: string;
}

/**
 * SpellCalculation 유니온 타입
 */
export type SpellCalculation =
  | GameCalculationModified
  | GameCalculation
  | GameCalculationConditional;

/**
 * 변수 치환 함수 시그니처
 */
export type VariableReplacer = (
  trimmedVar: string,
  spell: ChampionSpell,
  communityDragonData?: CommunityDragonSpellData,
  replacedVars?: Set<string>
) => string | null;
