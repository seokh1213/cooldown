import type { ChampionSpell } from "@/domain/game/types";
import { getTranslations } from "@/shared/i18n";
import type { Translations } from "@/shared/i18n/translations";
import type { TooltipLocale } from "../contracts";

/**
 * CommunityDragon mStat 코드 → 번역 키 표
 *
 * 코드값은 Riot 이 공개하지 않으므로, CommunityDragon 계산 데이터와
 * 인게임 완성 문장을 같은 패치에서 대조해 확정한 것만 싣는다.
 * (근거 없는 코드는 넣지 않는다. 틀린 스탯 이름은 값이 없는 것보다 나쁘다)
 *
 * - base:  기본 이름 번역 키
 * - bonus: "추가 ~" 전용 번역 키. 없으면 common.bonus 를 앞에 붙여 조립한다.
 */
type StatNameKey = keyof Translations["stats"];

interface StatNameEntry {
  base: StatNameKey;
  bonus?: StatNameKey;
  /** 확정 근거 (패치 26.17 기준) */
  evidence: string;
  /** CommunityDragon texticons 의 파일 이름 (statsicon/<icon>.png) */
  icon: string;
}

const STAT_NAME_TABLE: Record<number, StatNameEntry> = {
  1: {
    base: "armor",
    bonus: "bonusArmor",
    evidence: "기존 매핑",
    icon: "scalearmor",
  },
  2: {
    base: "attackDamage",
    bonus: "bonusAttackDamage",
    evidence: "기존 매핑",
    icon: "scalead",
  },
  4: {
    base: "attackspeed",
    evidence: "AttackSpeedCoefficient / 진 패시브 '추가 공격 속도 30%'",
    icon: "scaleas",
  },
  6: {
    base: "magicResist",
    bonus: "bonusMagicResist",
    evidence: "기존 매핑",
    icon: "scalemr",
  },
  7: {
    base: "movespeed",
    evidence: "DashSpeed / DashSpeedRatio (아우렐리온 솔·코르키·렉사이)",
    icon: "scalems",
  },
  8: {
    base: "crit",
    evidence: "케이틀린 패시브 '치명타 확률의 85%' / 진 패시브 '치명타 확률 35%'",
    icon: "scalecrit",
  },
  9: {
    base: "critDamage",
    evidence: "케이틀린 패시브 '치명타 피해량의 100%'",
    icon: "scalecritmult",
  },
  12: {
    base: "health",
    bonus: "bonusHealth",
    evidence: "기존 매핑",
    icon: "scalehealth",
  },
  18: {
    base: "lifesteal",
    bonus: "bonusLifesteal",
    evidence: "기존 매핑",
    icon: "scalels",
  },
  29: {
    base: "lethality",
    evidence: "파이크 R '물리 관통력 150%' (mStat=29, 계수 1.5)",
    icon: "scaleapen",
  },
};

/** 스탯 코드가 없으면 주문력 계수다 */
const ABILITY_POWER_ICON = "scaleap";

/**
 * 스탯 코드 → CommunityDragon 아이콘 이름
 * 이름을 모르는 코드는 아이콘도 붙이지 않는다.
 */
export function getStatIcon(mStat?: number): string | undefined {
  // mStat 이 없으면 주문력 계수다 (총합·추가 구분은 아이콘이 같다)
  if (mStat == null) return ABILITY_POWER_ICON;
  return STAT_NAME_TABLE[mStat]?.icon;
}

/**
 * 스탯 코드 → 로컬라이즈된 이름 변환
 *
 * mStat 이 어떤 스탯인지, mStatFormula 가 총합인지 추가분인지(2 = 추가)를
 * 각각 정한다. mStat 이 없으면 주문력 계수이며, 이때 mStatFormula 는
 * 스탯 코드가 아니라 총합/추가 구분으로만 쓰인다.
 * (블라디미르 패시브·잭스 E/R·벨베스 W 의 "추가 주문력" 항.
 *  인게임 문장도 같은 자리를 "추가 주문력" 으로 적는다)
 *
 * 표에 없는 코드는 잘못된 이름을 붙이는 대신 빈 문자열을 돌려주고,
 * 호출부에서 "(240%)" 처럼 수치만 노출한다.
 */
export function getStatName(
  mStat?: number,
  mStatFormula?: number,
  lang: TooltipLocale = "ko_KR"
): string {
  const stats = getTranslations(lang).stats;
  const isBonus = mStatFormula === 2;
  const withBonus = (name: string): string =>
    `${getTranslations(lang).common.bonus} ${name}`;

  if (mStat == null) {
    return isBonus ? withBonus(stats.abilityPower) : stats.abilityPower;
  }

  const entry = STAT_NAME_TABLE[mStat];
  if (!entry) return "";
  if (!isBonus) return stats[entry.base];

  return entry.bonus ? stats[entry.bonus] : withBonus(stats[entry.base]);
}

/**
 * 스킬 자원 이름 계산
 * - 기본값: 마나
 * - costType 이 문자열이고 "{{" 를 포함하지 않으면 그대로 사용
 * - 그렇지 않고 resource 가 문자열이고 "{{" 를 포함하지 않으면 그대로 사용
 */
export function getAbilityResourceName(
  spell: ChampionSpell,
  lang: TooltipLocale = "ko_KR"
): string {
  const resourceName = getTranslations(lang).common.mana;

  if (spell.costType) {
    const costType = spell.costType.trim();
    if (costType && !costType.includes("{{")) {
      return costType;
    }
    if (spell.resource && !spell.resource.includes("{{")) {
      return spell.resource;
    }
    return resourceName;
  }

  if (spell.resource && !spell.resource.includes("{{")) {
    return spell.resource;
  }

  return resourceName;
}
