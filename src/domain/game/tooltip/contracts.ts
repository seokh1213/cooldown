import type { AbilityLevelValues } from "@/domain/game/contracts/championData";
import { ChampionSpell } from "@/domain/game/types";
import type { SpellCalculation } from "./calculations/contracts";

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

export interface TooltipRenderResult {
  html: string;
  unresolvedTokens: string[];
  /** 계산식을 평가하다 값을 버린 자리 */
  droppedCalculations: DroppedCalculation[];
  /** 툴팁에 적은 레벨 범위의 레벨별 값. 툴팁에 나온 순서이고 같은 값은 한 번만 싣는다 */
  levelValues: AbilityLevelValues[];
}

/**
 * Community Dragon 스킬 데이터 구조
 */
/**
 * 계산식을 평가하다 값을 버린 자리.
 * 툴팁에는 남은 항만 적히므로 겉보기엔 멀쩡하다. 진단으로 모아 기준선에서 막는다.
 */
export interface DroppedCalculation {
  /** 값을 버린 계산식 키 (참조된 안쪽 계산식이면 그 키) */
  key: string;
  reason: DroppedCalculationReason;
  detail?: string;
}

export type DroppedCalculationReason =
  /** mFormulaParts 의 항 하나를 풀지 못해 그 항만 빠졌다 */
  | "unresolved-part"
  /** 길이가 다른 랭크 벡터끼리라 더하지 못했다 */
  | "sum-mismatch"
  /** mMultiplier 를 풀지 못해 배율이 빠졌다 */
  | "unresolved-multiplier"
  /** 이름으로 찾는 DataValue 가 없다 (detail: 이름) */
  | "missing-data-value"
  /** effectBurn[n] 이 없다 (detail: n) */
  | "missing-effect-burn"
  /** 참조한 다른 계산식을 평가하지 못했다 (detail: 키) */
  | "unresolved-reference"
  /** 모르는 계산 파트 타입 (detail: 타입) */
  | "unsupported-part"
  /** Sum/Clamp 서브 파트를 더하지 못했다 */
  | "sub-sum-mismatch"
  /** Clamp 안의 스탯 항은 런타임 스탯 없이 clamp 할 수 없어 뺐다 */
  | "clamp-stat-dropped"
  /** StatBySubPart 안의 스탯 비율은 표기할 수 없어 뺐다 */
  | "stat-subpart-dropped"
  /** 스탯 × 스탯 곱은 표기할 수 없다 */
  | "stat-product-unsupported"
  /** 곱셈의 두 벡터 길이가 달랐다 */
  | "product-mismatch"
  /** 어떤 스탯인지 모르는 비율 항이라 툴팁에서 뺐다 (detail: mStat) */
  | "unknown-stat";

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
  /**
   * 이 스킬의 최대 랭크 (DDragon maxrank).
   * 다른 스킬이 `spell.<이름>:<값>` 으로 이 스킬 값을 부를 때 랭크 축을 맞추는 데 쓴다.
   */
  maxRank?: number;
  /**
   * 1랭크를 배울 수 있는 챔피언 레벨. 기본 스킬 네 개에만 붙는다.
   * 1보다 크면 그 레벨 전까지는 반드시 0랭크(아직 배우지 않은 상태)다. 보통 R 이 6이고,
   * 엘리스·니달리·카르마·제이스처럼 R 을 1레벨부터 가진 챔피언은 1이다.
   */
  firstRankLevel?: number;
  /** 패시브 데이터. 패시브는 1레벨부터 늘 켜져 있어 다른 스킬의 0랭크와 함께 보인다. */
  isPassive?: boolean;
  /** CDragon 원문 툴팁이 실제로 참조한 계산식 키 (등장 순서). */
  preferredSimulationCalculationKeys?: string[];
  /** 원문 피해 태그에서 확인한 계산식별 피해 유형. */
  simulationCalculationDamageTypes?: Record<
    string,
    "physical" | "magical" | "true"
  >;
}

/**
 * 변수 치환 함수 시그니처
 */
export type VariableReplacer = (
  trimmedVar: string,
  spell: ChampionSpell,
  communityDragonData?: CommunityDragonSpellData,
  replacedVars?: Set<string>
) => string | null;
