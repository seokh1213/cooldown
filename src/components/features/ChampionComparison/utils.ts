import { ChampionSpell } from "@/types";
import type { Language } from "@/i18n";
import { getTranslations } from "@/i18n";

/**
 * 스킬의 쿨타임 텍스트를 포맷팅
 */
export function getCooldownText(
  skill: ChampionSpell,
  lang: Language = "ko_KR"
): string | null {
  const t = getTranslations(lang);
  if (!skill || !skill.cooldown || !Array.isArray(skill.cooldown) || skill.cooldown.length === 0) {
    return null;
  }
  if (skill.recharge?.length) {
    const rechargeTime = skill.recharge.join("/");
    const charges = skill.maxCharges
      ? ` (${t.common.max}: ${skill.maxCharges}${t.common.items})`
      : "";
    return `${t.common.rechargeTime} ${rechargeTime}${t.common.seconds}${charges}`;
  }
  if (skill.cooldownBurn) {
    const cooldowns = skill.cooldownBurn.split("/");
    if (cooldowns.length > 1 && cooldowns.every(cd => cd === cooldowns[0])) {
      return `${cooldowns[0]}${t.common.seconds}`;
    }
    return `${skill.cooldownBurn}${t.common.seconds}`;
  }
  if (skill.cooldown && skill.cooldown.length > 0) {
    const cd = skill.cooldown[0];
    if (skill.cooldown.every(c => c === cd)) {
      return `${cd}${t.common.seconds}`;
    }
    return `${skill.cooldown.join("/")}${t.common.seconds}`;
  }
  return null;
}

/**
 * 스킬의 소모값 텍스트를 포맷팅
 */
function sanitizeCostText(text: string | null): string | null {
  if (!text) return text;
  // 빈 괄호 "()" 만 남은 경우 제거하고, 공백 정리
  let result = text.replace(/\(\s*\)/g, "");
  result = result.replace(/\s{2,}/g, " ").trim();
  return result;
}

export function getCostText(
  skill: ChampionSpell,
  lang: Language = "ko_KR"
): string | null {
  const t = getTranslations(lang);
  if (!skill) {
    return null;
  }

  const hasCostArray =
    Array.isArray(skill.cost) && skill.cost.length > 0;
  const isCostArrayAllZero =
    hasCostArray && skill.cost!.every((c) => c === 0);
  const isCostBurnZero = skill.costBurn === "0";

  if (isCostBurnZero || isCostArrayAllZero) {
    return sanitizeCostText(t.common.noCost);
  }
  if (skill.costBurn) {
    const costs = skill.costBurn.split("/");
    if (costs.length > 1 && costs.every(c => c === costs[0])) {
      return sanitizeCostText(`${skill.costType ?? t.common.mana} ${costs[0]}`);
    }
    return sanitizeCostText(`${skill.costType ?? t.common.mana} ${skill.costBurn}`);
  }
  if (hasCostArray && skill.cost) {
    const cost = skill.cost[0];
    if (skill.cost.every(c => c === cost)) {
      return sanitizeCostText(`${skill.costType ?? t.common.mana} ${cost}`);
    }
    return sanitizeCostText(`${skill.costType ?? t.common.mana} ${skill.cost.join("/")}`);
  }
  return null;
}

/**
 * 레벨별 쿨타임 값을 계산
 */
export function getCooldownForLevel(
  skill: ChampionSpell,
  level: number
): string {
  const cooldownValue = skill.recharge?.[level - 1] ?? skill.cooldown[level - 1];
  return cooldownValue !== undefined && cooldownValue !== null ? String(cooldownValue) : "";
}
