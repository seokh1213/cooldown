import { ChampionSpell } from "@/types";
import { SpellData } from "@/services/spellDataService";

/**
 * 스킬의 쿨타임 텍스트를 포맷팅
 */
export function getCooldownText(
  skill: ChampionSpell,
  spellData?: SpellData | null
): string | null {
  if (!skill || !skill.cooldown || !Array.isArray(skill.cooldown) || skill.cooldown.length === 0) {
    return null;
  }
  const ammoRechargeTime = spellData?.communityDragonData["mAmmoRechargeTime"];
  const isAmmoSkill = skill.cooldown[0] === 0 && ammoRechargeTime && Array.isArray(ammoRechargeTime) && ammoRechargeTime.length > 1;

  if (isAmmoSkill && ammoRechargeTime) {
    const rechargeTime = ammoRechargeTime[1];
    const maxAmmo = skill.effectBurn?.[1] || "3";
    return `재충전 대기시간 ${rechargeTime}초 (최대: ${maxAmmo}개)`;
  }
  if (skill.cooldownBurn) {
    const cooldowns = skill.cooldownBurn.split("/");
    if (cooldowns.length > 1 && cooldowns.every(cd => cd === cooldowns[0])) {
      return `${cooldowns[0]}초`;
    }
    return `${skill.cooldownBurn}초`;
  }
  if (skill.cooldown && skill.cooldown.length > 0) {
    const cd = skill.cooldown[0];
    if (skill.cooldown.every(c => c === cd)) {
      return `${cd}초`;
    }
    return `${skill.cooldown.join("/")}초`;
  }
  return null;
}

/**
 * 스킬의 소모값 텍스트를 포맷팅
 */
export function getCostText(skill: ChampionSpell): string | null {
  if (!skill) {
    return null;
  }
  if (skill.costBurn === "0" || (skill.cost && skill.cost.every(c => c === 0))) {
    return "소모값 없음";
  }
  if (skill.costBurn) {
    const costs = skill.costBurn.split("/");
    if (costs.length > 1 && costs.every(c => c === costs[0])) {
      return `마나 ${costs[0]}`;
    }
    return `마나 ${skill.costBurn}`;
  }
  if (skill.cost && skill.cost.length > 0) {
    const cost = skill.cost[0];
    if (skill.cost.every(c => c === cost)) {
      return `마나 ${cost}`;
    }
    return `마나 ${skill.cost.join("/")}`;
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
  const ammoRechargeTime = spellData?.communityDragonData["mAmmoRechargeTime"];
  const cooldownValue = skill.cooldown[level - 1];
  
  // ammo 스킬인지 확인: cooldown이 0이고 mAmmoRechargeTime이 있으면 ammo 스킬
  const isAmmoSkill = cooldownValue === 0 && ammoRechargeTime && Array.isArray(ammoRechargeTime) && ammoRechargeTime.length > level;
  
  if (isAmmoSkill && ammoRechargeTime) {
    return ammoRechargeTime[level] !== undefined ? String(ammoRechargeTime[level]) : "";
  }
  
  return cooldownValue !== undefined && cooldownValue !== null ? String(cooldownValue) : "";
}

