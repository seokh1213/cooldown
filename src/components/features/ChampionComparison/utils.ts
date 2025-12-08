import { ChampionSpell } from "@/types";
import { SpellData } from "@/services/spellDataService";
import {
  replaceVariables,
  type CommunityDragonSpellData,
} from "@/lib/spellTooltipParser";
import type { Language } from "@/i18n";
import { getTranslations } from "@/i18n";

/**
 * 스킬의 쿨타임 텍스트를 포맷팅
 */
export function getCooldownText(
  skill: ChampionSpell,
  spellData?: SpellData | null,
  lang: Language = "ko_KR"
): string | null {
  const t = getTranslations(lang);
  if (!skill || !skill.cooldown || !Array.isArray(skill.cooldown) || skill.cooldown.length === 0) {
    return null;
  }
  // 새로운 구조 지원: DataValues가 있으면 그것을 사용, 없으면 전체 객체 사용 (호환성)
  const communityDragonData = spellData?.communityDragonData;
  const dataValues = (communityDragonData && typeof communityDragonData === "object" && "DataValues" in communityDragonData
    ? (communityDragonData as { DataValues?: Record<string, unknown> }).DataValues
    : undefined) || (communityDragonData as Record<string, unknown> | undefined);
  const ammoRechargeTime = dataValues && typeof dataValues === "object" && "mAmmoRechargeTime" in dataValues
    ? (dataValues as { mAmmoRechargeTime?: unknown }).mAmmoRechargeTime
    : undefined;
  const isAmmoSkill = skill.cooldown[0] === 0 && ammoRechargeTime && Array.isArray(ammoRechargeTime) && ammoRechargeTime.length > 1;

  if (isAmmoSkill && ammoRechargeTime) {
    const rechargeTime = ammoRechargeTime[1];
    const maxAmmo = skill.effectBurn?.[1] || "3";
    return `${t.common.rechargeTime} ${rechargeTime}${t.common.seconds} (${t.common.max}: ${maxAmmo}${t.common.items})`;
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
  spellData?: SpellData | null,
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

  // cost / costBurn 이 모두 0인데 resource 에 템플릿 변수({{ }})가 있는 경우
  // Community Dragon DataValues 를 사용해 리소스 코스트를 계산한다.
  if (
    (isCostBurnZero || isCostArrayAllZero) &&
    typeof skill.resource === "string" &&
    skill.resource.includes("{{")
  ) {
    const rawResource = skill.resource.trim();

    // DataValues 호환 처리: { DataValues: {...} } 혹은 DataValues 자체가 올 수 있음
    const communityDragonData = spellData?.communityDragonData;
    const dataValues =
      (communityDragonData && typeof communityDragonData === "object" && "DataValues" in communityDragonData
        ? (communityDragonData as { DataValues?: Record<string, number[]> }).DataValues
        : undefined) ||
      (communityDragonData as Record<string, number[]> | undefined);

    if (dataValues) {
      const cdragonData: CommunityDragonSpellData = {
        DataValues: dataValues as Record<string, number[]>,
      };

      const replaced = replaceVariables(
        rawResource,
        skill,
        cdragonData
      ).trim();

      if (replaced) {
        return sanitizeCostText(replaced);
      }
    }

    // DataValues 기반 치환에 실패하면 기존 동작과 동일하게 "소모값 없음" 처리
    return sanitizeCostText(t.common.noCost);
  }

  if (isCostBurnZero || isCostArrayAllZero) {
    return sanitizeCostText(t.common.noCost);
  }
  if (skill.costBurn) {
    const costs = skill.costBurn.split("/");
    if (costs.length > 1 && costs.every(c => c === costs[0])) {
      return sanitizeCostText(`${t.common.mana} ${costs[0]}`);
    }
    return sanitizeCostText(`${t.common.mana} ${skill.costBurn}`);
  }
  if (hasCostArray && skill.cost) {
    const cost = skill.cost[0];
    if (skill.cost.every(c => c === cost)) {
      return sanitizeCostText(`${t.common.mana} ${cost}`);
    }
    return sanitizeCostText(`${t.common.mana} ${skill.cost.join("/")}`);
  }
  return null;
}

/**
 * 레벨별 쿨타임 값을 계산
 */
export function getCooldownForLevel(
  skill: ChampionSpell,
  level: number,
  spellData?: SpellData | null
): string {
  // 새로운 구조 지원: DataValues가 있으면 그것을 사용, 없으면 전체 객체 사용 (호환성)
  const communityDragonData = spellData?.communityDragonData;
  const dataValues = (communityDragonData && typeof communityDragonData === "object" && "DataValues" in communityDragonData
    ? (communityDragonData as { DataValues?: Record<string, unknown> }).DataValues
    : undefined) || (communityDragonData as Record<string, unknown> | undefined);
  const ammoRechargeTime = dataValues && typeof dataValues === "object" && "mAmmoRechargeTime" in dataValues
    ? (dataValues as { mAmmoRechargeTime?: unknown }).mAmmoRechargeTime
    : undefined;
  const cooldownValue = skill.cooldown[level - 1];
  
  // ammo 스킬인지 확인: cooldown이 0이고 mAmmoRechargeTime이 있으면 ammo 스킬
  const isAmmoSkill = cooldownValue === 0 && ammoRechargeTime && Array.isArray(ammoRechargeTime) && ammoRechargeTime.length > level;
  
  if (isAmmoSkill && ammoRechargeTime) {
    return ammoRechargeTime[level] !== undefined ? String(ammoRechargeTime[level]) : "";
  }
  
  return cooldownValue !== undefined && cooldownValue !== null ? String(cooldownValue) : "";
}
