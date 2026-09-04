import { Value } from "./types";
import type { TooltipLocale } from "./types";
import { formatNumber } from "./formatters";
import { getTranslations } from "@/i18n";
import type { Translations } from "@/i18n/translations";
import type { ChampionSpell } from "@/types";

/**
 * 값이 벡터인지 확인
 */
export function isVector(v: Value): v is number[] {
  return Array.isArray(v);
}

/**
 * 값을 벡터로 변환
 */
export function toVector(v: Value, length: number): number[] {
  if (Array.isArray(v)) return v;
  return Array.from({ length }, () => v);
}

/**
 * 이진 연산 수행
 */
export function binaryOp(
  a: Value,
  b: Value,
  op: (x: number, y: number) => number
): Value {
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

/**
 * 덧셈 연산
 */
export function add(a: Value, b: Value): Value {
  return binaryOp(a, b, (x, y) => x + y);
}

/**
 * 곱셈 연산
 */
export function mul(a: Value, b: Value): Value {
  return binaryOp(a, b, (x, y) => x * y);
}

/**
 * 값을 툴팁 문자열로 변환
 */
export function valueToTooltipString(value: Value): string {
  if (isVector(value)) {
    const allSame = value.every((v) => v === value[0]);
    return allSame
      ? formatNumber(value[0])
      : value.map((v) => formatNumber(v)).join("/");
  }
  return formatNumber(value);
}

/**
 * Value ×100 후 반올림 (퍼센트 변환용)
 */
export function scaleBy100(value: Value): Value {
  // 기존에는 Math.round(v * 100) 으로 정수 퍼센트로 만들어 소수점이 모두 날아갔음.
  // 이제는 소수 둘째 자리까지 살릴 수 있도록 "그냥 ×100"만 하고,
  // 실제 반올림/표기는 formatNumber 쪽(최대 소수 2자리 + 불필요한 0 제거)에 맡긴다.
  if (isVector(value)) return value.map((v) => v * 100);
  return value * 100;
}

/**
 * CommunityDragon mStat 코드 → 번역 키 표
 *
 * 코드값은 Riot 이 공개하지 않으므로, CommunityDragon 계산 데이터와
 * lol.ps 의 완성 문장을 같은 패치에서 대조해 확정한 것만 싣는다.
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
}

const STAT_NAME_TABLE: Record<number, StatNameEntry> = {
  1: { base: "armor", bonus: "bonusArmor", evidence: "기존 매핑" },
  2: { base: "attackDamage", bonus: "bonusAttackDamage", evidence: "기존 매핑" },
  4: {
    base: "attackspeed",
    evidence: "AttackSpeedCoefficient / 진 패시브 '추가 공격 속도 30%'",
  },
  6: { base: "magicResist", bonus: "bonusMagicResist", evidence: "기존 매핑" },
  7: {
    base: "movespeed",
    evidence: "DashSpeed / DashSpeedRatio (아우렐리온 솔·코르키·렉사이)",
  },
  8: {
    base: "crit",
    evidence: "케이틀린 패시브 '치명타 확률의 85%' / 진 패시브 '치명타 확률 35%'",
  },
  9: {
    base: "critDamage",
    evidence: "케이틀린 패시브 '치명타 피해량의 100%'",
  },
  12: { base: "health", bonus: "bonusHealth", evidence: "기존 매핑" },
  18: { base: "lifesteal", bonus: "bonusLifesteal", evidence: "기존 매핑" },
  29: {
    base: "lethality",
    evidence: "파이크 R '물리 관통력 150%' (mStat=29, 계수 1.5)",
  },
};

/**
 * 스탯 코드 → 로컬라이즈된 이름 변환
 *
 * mStatFormula 2 는 "추가(bonus)" 를 뜻한다.
 * 표에 없는 코드는 잘못된 이름을 붙이는 대신 빈 문자열을 돌려주고,
 * 호출부에서 "(240%)" 처럼 수치만 노출한다.
 */
export function getStatName(
  mStat?: number,
  mStatFormula?: number,
  lang: TooltipLocale = "ko_KR"
): string {
  const stats = getTranslations(lang).stats;
  const hasStat = mStat !== undefined && mStat !== null;
  const hasFormula = mStatFormula !== undefined && mStatFormula !== null;

  // 둘 다 생략된 경우 → Ability Power 계수
  if (!hasStat && !hasFormula) {
    return stats.abilityPower;
  }

  const statCode = mStat ?? mStatFormula;
  const entry = statCode != null ? STAT_NAME_TABLE[statCode] : undefined;
  if (!entry) {
    return "";
  }

  // mStat 이 실제로 주어졌을 때만 "추가" 로 본다.
  // (mStatFormula 만 있는 경우 그 값 자체가 스탯 코드로 쓰인다)
  const isBonus = hasStat && mStatFormula === 2;
  if (!isBonus) {
    return stats[entry.base];
  }

  return entry.bonus
    ? stats[entry.bonus]
    : `${getTranslations(lang).common.bonus} ${stats[entry.base]}`;
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
