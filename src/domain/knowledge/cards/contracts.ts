import type { ChampionSpellSlot } from "../../game/types/combatNormalized";
import type { SpellTicks } from "../combat/abilityTicks";
import type { SpellCrowdControl } from "../combat/crowdControl";
import type { ChampionRecord, RiotChampionMeta } from "./sourceRecords";

export type StatName =
  | "health"
  | "armor"
  | "magicResist"
  | "attackDamage"
  | "attackSpeed"
  | "moveSpeed"
  | "healthRegen";

export type StatGrade = "매우 낮음" | "낮음" | "보통" | "높음" | "매우 높음";

export interface StatSnapshot {
  /** 원본의 레벨당 성장치. 공격 속도는 %, 실제 증가량에는 레벨 성장 곡선이 적용된다. */
  perLevel?: number;
  lv1: number;
  lv6: number;
  lv11: number;
  lv18: number;
  /** 0(최저) ~ 100(최고) 백분위, 레벨 1 기준 */
  percentileLv1: number;
  percentileLv18: number;
  gradeLv1: StatGrade;
  gradeLv18: StatGrade;
}

export type DamageType = "물리" | "마법" | "고정";

export interface SpellFact {
  forms?: SpellFormFact[];
  slot: ChampionSpellSlot;
  name: string;
  /** 한 줄 요약 (있을 때) */
  summary?: string;
  /** 툴팁 평문 (HTML 제거) */
  text: string;
  cooldown?: string;
  /** 1레벨(첫 랭크) 쿨타임 초 — 교전 창 계산용 */
  cooldownRank1?: number;
  /** 충전형 스킬의 재충전 시간. 이때 cooldown 은 연속 시전 간격(보통 0.5초)이다. */
  recharge?: string;
  maxCharges?: number;
  cost?: string;
  /**
   * 시전 사거리. 랭크마다 다르면 배열(녹턴 R 2500/3250/4000). 자기 시전·전역 스킬은 없다.
   * CDragon BIN 에서 받은 값이다(`npm run llm:fetch-ranges`). 챔피언 자료의 DDragon range 는
   * castRange 가 없는 스킬에 기본값 400 을 채우고 제한 없음을 25000 으로 적어 쓰지 않는다.
   */
  range?: number | number[];
  damageTypes: DamageType[];
  effects: string[];
  crowdControl?: SpellCrowdControl;
  ticks?: SpellTicks;
  /** 툴팁에서 뽑은 계수 (스탯 → 최대 % 값). 예: { "주문력": 105, "추가 공격력": 50 } */
  ratios: Record<string, number>;
}

export interface SpellFormFact extends Omit<SpellFact, "forms"> {
  key: "A" | "B";
  label: string;
  id: string;
}

export interface ScalingProfile {
  /** 주문력 계수가 있는 스킬 수 */
  apSpells: number;
  /** 공격력/추가 공격력 계수가 있는 스킬 수 */
  adSpells: number;
  /** 체력 계수(최대/추가 체력)가 있는 스킬 수 */
  healthSpells: number;
  primary: "AP" | "AD" | "혼합" | "체력" | "없음";
}

export interface ChampionCard {
  id: string;
  name: string;
  title?: string;
  roleTags: string[];
  /** 라이엇 공식 분류 (수집돼 있으면) */
  riot?: {
    /** 주 특성 (내구성, 결투가, 전투 개시 …) */
    tagPrimary?: string;
    tagSecondary?: string;
    /** 물리 | 마법 | 혼합 */
    damageType?: "물리" | "마법" | "혼합";
    attackType?: "근접" | "원거리";
    playstyle?: RiotChampionMeta["playstyle"];
  };
  /** LoL Wiki 분류 (하위 클래스와 포지션) */
  wiki?: {
    heroType?: string;
    altType?: string;
    /** Juggernaut, Diver, Skirmisher, Vanguard, Warden, Battlemage, Burst, Artillery, Assassin, Enchanter, Catcher, Marksman, Specialist */
    subclass?: string;
    subclasses: string[];
    positions: string[];
  };
  resource?: string;
  rangeType: "근접" | "원거리";
  attackRange: number;
  stats: Record<StatName, StatSnapshot>;
  damageProfile: {
    physical: number;
    magical: number;
    trueDamage: number;
    primary: "물리" | "마법" | "혼합";
  };
  scalingProfile: ScalingProfile;
  /** 챔피언 전체에서 발견된 효과 태그 (중복 제거) */
  mechanics: string[];
  spells: SpellFact[];
}

export interface ChampionCardBuilder {
  build(championId: string): ChampionCard | undefined;
  buildAll(): ChampionCard[];
  find(query: string): ChampionRecord | undefined;
}

/** dev/data/knowledge/spell-effects.json 의 보정 한 건. 보정을 두는 이유는 dev/scripts/advisor/lib/spellOverrides.ts 머리말에 있다. */
export interface SpellOverride {
  /** 더할 효과 태그 */
  add?: string[];
  /** 잘못 붙은 것을 뺀다. 규칙을 못 고칠 때의 마지막 수단이다. */
  remove?: string[];
  /** 피해 유형. 툴팁이 유형을 안 밝힌 스킬에만 쓴다. */
  damageTypes?: DamageType[];
  /**
   * 사람이 보고 **정말 비어 있다**고 확인한 자리.
   *
   * 신드라 Q 처럼 단일 대상 피해만 주는 스킬은 태그가 없는 것이 맞다. 그것을
   * 적어 두지 않으면 다음 점검 때 같은 자리를 또 묻게 된다. 이 표시가 있으면
   * 구멍 목록에서 빠진다.
   */
  confirmedEmpty?: boolean;
  /**
   * 피해를 입히지 않는다고 확인한 자리.
   *
   * 클레드 P 의 "기본 공격은 감소한 피해를 입힙니다" 는 평타 이야기이고, 라이즈 R 의
   * "과부하 사용 시 추가 피해" 는 Q 의 피해다. 스스로 내는 피해가 아니므로 유형이
   * 비어 있는 것이 맞다.
   */
  confirmedNoDamage?: boolean;
  /** 툴팁으로는 왜 안 나오는가 */
  why: string;
  /** 무엇을 보고 적었는가 */
  source: string;
  /**
   * 적을 때 본 툴팁의 지문.
   *
   * 보정은 **그때 그 문구**를 보고 적은 것이다. 챔피언이 리워크되면 문구가 통째로
   * 바뀌는데, 보정은 그대로 남아 조용히 틀린 값을 얹는다. 규칙으로 뽑는 태그는
   * 새 문구에서 다시 도출되므로 저절로 따라가지만 이쪽은 그러지 못한다.
   *
   * **수치를 지우고** 찍는다. 그러지 않으면 밸런스 판올림마다 전부 어긋난 것으로
   * 나와 아무도 안 보게 된다. 계수와 등급별 수치가 바뀌는 것은 다시 볼 일이 아니고,
   * 문구가 바뀌는 것만 다시 볼 일이다.
   */
  textDigest?: string;
}

/** 키는 `<ChampionId>:<슬롯>` 이다. 예: `Annie:W` */
export type SpellOverrides = Record<string, SpellOverride>;

export interface CardTextOptions {
  /** 스킬 툴팁 전문 포함 여부 (false 면 요약 + 태그만) */
  includeSpellText?: boolean;
  /** 툴팁 전문 최대 길이 */
  spellTextMax?: number;
  /**
   * 스킬 서술 수준
   * - full: 요약 + 상세(툴팁 전문)
   * - summary: 요약만
   * - meta: 슬롯·이름·쿨타임·피해 유형·계수·효과 태그만 (한 줄)
   */
  spellDetail?: "full" | "summary" | "meta";
}
