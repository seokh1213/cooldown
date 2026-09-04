import { Value } from "./types";
import type { TooltipLocale } from "./types";
import { formatNumber } from "./formatters";
import { getTranslations } from "@/i18n";
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
 * 스탯 코드 → 로컬라이즈된 이름 변환
 */
export function getStatName(
  mStat?: number,
  mStatFormula?: number,
  lang: TooltipLocale = "ko_KR"
): string {
  const t = lang === "zh_CN" ? null : getTranslations(lang);
  const zhStats = {
    abilityPower: "法术强度",
    attackDamage: "攻击力",
    bonusAttackDamage: "额外攻击力",
    health: "生命值",
    bonusHealth: "额外生命值",
    armor: "护甲",
    bonusArmor: "额外护甲",
    magicResist: "魔法抗性",
    bonusMagicResist: "额外魔法抗性",
    lifesteal: "生命偷取",
    bonusLifesteal: "额外生命偷取",
  };
  const stats = t?.stats ?? zhStats;
  const hasStat = mStat !== undefined && mStat !== null;
  const hasFormula = mStatFormula !== undefined && mStatFormula !== null;

  // 규칙:
  // mStat: (2=Attack Damage, 12=Health, 1=Armor, 6=Magic Resist, 18=Lifesteal, 생략=Ability Power)
  // mStatFormula: (2=bonus, 생략=전체)
  //
  // "mStat:2" → Attack Damage
  // "mStat:2, mStatFormula:2" → bonus Attack Damage
  // "mStat:12, mStatFormula:2" → bonus Health
  // "" (둘 다 생략) → Ability Power

  // 둘 다 생략된 경우 → Ability Power 계수
  if (!hasStat && !hasFormula) {
    return stats.abilityPower;
  }

  const statCode = mStat ?? mStatFormula;

  // Attack Damage 계수
  if (statCode === 2) {
    if (mStat === 2 && mStatFormula === 2) {
      return stats.bonusAttackDamage; // bonus AD
    }
    return stats.attackDamage;
  }

  // Health 계수
  if (statCode === 12) {
    if (mStat === 12 && mStatFormula === 2) {
      return stats.bonusHealth; // bonus HP
    }
    return stats.health;
  }

  // Armor 계수
  if (statCode === 1) {
    if (mStat === 1 && mStatFormula === 2) {
      return stats.bonusArmor;
    }
    return stats.armor;
  }

  // Magic Resist 계수
  if (statCode === 6) {
    if (mStat === 6 && mStatFormula === 2) {
      return stats.bonusMagicResist;
    }
    return stats.magicResist;
  }

  // Lifesteal 계수
  if (statCode === 18) {
    if (mStat === 18 && mStatFormula === 2) {
      return stats.bonusLifesteal;
    }
    return stats.lifesteal;
  }

  // 그 외 알 수 없는 스탯은 표시하지 않는다 (아이콘으로만 처리하거나 무시)
  return "";
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
  const resourceName =
    lang === "zh_CN" ? "法力值" : getTranslations(lang).common.mana;

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
