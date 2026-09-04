/**
 * 아이템 역할군 분류
 *
 * 상점은 아이템을 브루저·탱커·메이지·원거리 딜러·암살자·서포터 탭으로 나눠 보여주지만,
 * DDragon 과 CommunityDragon 데이터에는 그 분류가 없다(태그는 스탯 종류만 알려준다).
 * 그래서 스탯 조합·태그·효과 문구로 역할군을 결정적으로 판정한다.
 *
 * 판정 기준은 "이 아이템이 어떤 챔피언에게 값을 하는가" 다.
 * - 공격력 + 생존 스탯 → 브루저
 * - 생존 스탯만 → 탱커
 * - 주문력 + 마나/스킬 가속 → 메이지, 주문력 + 체력 → 마법 전사
 * - 치명타·공격 속도 중심 → 원거리 딜러
 * - 공격력 + 물리 관통(치명타 없음) → 암살자
 * - 아군 대상 효과·오라·골드 획득 → 서포터
 */
import type { NormalizedItem } from "../../../src/types/combatNormalized";
import { getOfficialLikeItemTier, type ItemTier } from "../../../src/lib/itemTierUtils";
import { stripHtml } from "./text";

export type ItemArchetype =
  | "bruiser"
  | "tank"
  | "mage"
  | "battlemage"
  | "marksman"
  | "assassin"
  | "enchanter"
  | "utility"
  | "boots"
  | "starter"
  | "component"
  | "consumable"
  | "trinket"
  | "jungle";

export const ARCHETYPE_LABEL: Record<ItemArchetype, string> = {
  bruiser: "브루저",
  tank: "탱커",
  mage: "메이지",
  battlemage: "마법 전사",
  marksman: "원거리 딜러",
  assassin: "암살자",
  enchanter: "서포터(아군 보조)",
  utility: "유틸리티",
  boots: "장화",
  starter: "시작 아이템",
  component: "하위 아이템",
  consumable: "소모품",
  trinket: "장신구",
  jungle: "정글",
};

export interface ItemClassification {
  tier: ItemTier;
  /** 이 아이템이 값을 하는 역할군 (복수 가능) */
  archetypes: ItemArchetype[];
  /** 방어 성향: 어떤 저항을 주는지 */
  resists: Array<"ARMOR" | "MAGIC_RESIST">;
  /** 특수 기능 태그 */
  functions: string[];
}

function hasStat(item: NormalizedItem, stat: string): boolean {
  return item.stats.some((s) => s.stat === stat && s.value > 0);
}

/**
 * 효과 문구로만 드러나는 스탯 성향.
 * 예: 스테락의 도전은 스탯이 체력뿐이지만 효과가 추가 공격력을 준다.
 */
const AD_TEXT_RE = /추가 공격력|공격력을 얻|공격력이 증가/;
const AP_TEXT_RE = /주문력을 얻|주문력이 증가/;
/** 근접 성향 표식 (히드라 계열의 광역 평타) */
const MELEE_TEXT_RE = /쪼개기|초승달/;

function fullText(item: NormalizedItem): string {
  return stripHtml(
    `${item.description ?? ""} ${item.effects.map((e) => `${e.name} ${e.description}`).join(" ")}`,
  );
}

/** 아군을 대상으로 하는 효과는 서포터 아이템의 표식이다 */
const ALLY_RE = /아군|주변 아군|보호 중인/;
const ANTI_HEAL_RE = /치유 효과|고통스러운 상처/;
const ANTI_SHIELD_RE = /보호막[^.]{0,20}(감소|무시)/;
const ATTACK_SPEED_SLOW_RE = /공격 속도[^.]{0,20}감소/;
const TENACITY_RE = /강인함/;
const SHIELD_SELF_RE = /보호막을 얻|피해를 흡수하는 보호막/;

export function classifyItem(item: NormalizedItem): ItemClassification {
  const tier = getOfficialLikeItemTier(item);
  const tags = item.tags ?? [];
  const text = fullText(item);

  const ad = hasStat(item, "ATTACK_DAMAGE") || AD_TEXT_RE.test(text);
  const ap = hasStat(item, "ABILITY_POWER") || AP_TEXT_RE.test(text);
  const health = hasStat(item, "MAX_HEALTH");
  const armor = hasStat(item, "ARMOR");
  const mr = hasStat(item, "MAGIC_RESIST");
  const attackSpeed = hasStat(item, "ATTACK_SPEED") || tags.includes("AttackSpeed");
  const mana = hasStat(item, "MAX_MANA") || tags.includes("Mana") || tags.includes("ManaRegen");
  const crit = tags.includes("CriticalStrike");
  const lethality = tags.includes("ArmorPenetration");
  const magicPen = tags.includes("MagicPenetration");
  const lifeSteal = tags.includes("LifeSteal") || hasStat(item, "LIFE_STEAL");
  const spellVamp = tags.includes("SpellVamp");
  const survivability = health || armor || mr;

  const resists: ItemClassification["resists"] = [];
  if (armor) resists.push("ARMOR");
  if (mr) resists.push("MAGIC_RESIST");

  const functions: string[] = [];
  if (ANTI_HEAL_RE.test(text)) functions.push("치유 감소");
  if (ANTI_SHIELD_RE.test(text)) functions.push("보호막 감소");
  if (ATTACK_SPEED_SLOW_RE.test(text)) functions.push("적 공격 속도 감소");
  if (TENACITY_RE.test(text) || tags.includes("Tenacity")) functions.push("강인함");
  if (SHIELD_SELF_RE.test(text)) functions.push("자기 보호막");
  if (lethality) functions.push("물리 관통");
  if (magicPen) functions.push("마법 관통");
  if (lifeSteal) functions.push("생명력 흡수");
  if (spellVamp) functions.push("주문 흡혈");
  if (tags.includes("Active")) functions.push("사용 효과");
  if (tags.includes("Vision")) functions.push("시야");
  if (MELEE_TEXT_RE.test(text)) functions.push("근접 성향(광역 평타)");

  // 등급이 곧 분류인 것들 먼저 처리
  const archetypes: ItemArchetype[] = [];
  if (tier === "consumable") {
    archetypes.push(tags.includes("Trinket") ? "trinket" : "consumable");
    return { tier, archetypes, resists, functions };
  }
  if (tags.includes("Jungle") || (item.name.includes("정글") && tier === "starter")) {
    archetypes.push("jungle");
  }
  if (tier === "boots") archetypes.push("boots");
  if (tier === "starter") archetypes.push("starter");
  if (tier === "basic") archetypes.push("component");

  // 서포터: 아군 대상 효과, 오라, 골드 획득
  const isSupport =
    tags.includes("GoldPer") ||
    tags.includes("Aura") ||
    !!item.requiredAlly ||
    ALLY_RE.test(text);
  // 서포터 아이템은 아군 대상 설계이므로 다른 역할군으로 겹쳐 넣지 않는다.
  // (기사의 맹세는 방어력과 체력을 주지만 브루저·탱커 조언에 등장하면 안 된다)
  if (isSupport) {
    archetypes.push(ap || tags.includes("SpellDamage") ? "enchanter" : "utility");
    return { tier, archetypes: Array.from(new Set(archetypes)), resists, functions };
  }

  // 역할군 판정은 전설급과 장화에만 적용한다.
  // 서사급은 대부분 여러 역할군의 공용 재료여서 역할군을 붙이면 오분류가 된다.
  // (예: 처형인의 대검은 공격력만 주지만 원거리 딜러 전용이 아니다)
  if (tier === "epic") {
    archetypes.push("component");
  }
  if (tier === "legendary" || tier === "boots") {
    if (ad && crit) archetypes.push("marksman");
    else if (ad && lethality && !survivability) archetypes.push("assassin");
    else if (ad && survivability) archetypes.push("bruiser");
    else if (ad && attackSpeed && lifeSteal) archetypes.push("marksman");
    else if (ad && !survivability) archetypes.push(lethality ? "assassin" : "marksman");

    if (ap && health) archetypes.push("battlemage");
    else if (ap && (mana || magicPen || tags.includes("AbilityHaste"))) archetypes.push("mage");
    else if (ap) archetypes.push("mage");

    // 공격 속도가 붙은 저항 아이템은 평타 챔피언용이므로 탱커가 아니다
    const attackSpeedCarrier = attackSpeed && !health;
    if (attackSpeedCarrier && (armor || mr) && !ad && !ap) archetypes.push("bruiser", "marksman");

    if (!ad && !ap && survivability && !attackSpeedCarrier) archetypes.push("tank");
    // 저항과 체력을 함께 주는 아이템은 탱커도 산다 (치명타·물리 관통 계열은 제외)
    if ((armor || mr) && health && !crit && !lethality) archetypes.push("tank");
  }

  return {
    tier,
    archetypes: Array.from(new Set(archetypes)),
    resists,
    functions,
  };
}

// ---------------------------------------------------------------------------
// 챔피언 → 선호 아이템 역할군
// ---------------------------------------------------------------------------
export interface ChampionBuildProfile {
  /** 우선순위 순 선호 역할군 */
  preferred: ItemArchetype[];
  /** 사면 안 되는 역할군 (조언에서 제외) */
  excluded: ItemArchetype[];
  label: string;
}

/**
 * 챔피언 역할 태그는 데이터에 이미 있고 **순서가 의미를 가진다.**
 * ddragon 태그의 첫 번째가 주 역할, 두 번째가 부 역할이다.
 *   피오라 = Fighter/Assassin → 주 역할 전사 (암살자 아이템이 아니라 브루저 아이템)
 *   말파이트 = Tank/Mage → 주 역할 탱커, 부 역할 마법사 (AP 탱커)
 *   티모 = Marksman/Mage → 원거리지만 계수가 AP 이므로 메이지 아이템
 *
 * 여기에 계수 프로필(AD/AP)을 곱해 최종 아이템 풀을 정한다.
 * AP 챔피언에게 치명타·물리 관통 아이템을, AD 챔피언에게 주문력 아이템을 권하지 않는다.
 */
const COMBAT_ARCHETYPES: ItemArchetype[] = [
  "bruiser",
  "tank",
  "mage",
  "battlemage",
  "marksman",
  "assassin",
  "enchanter",
  "utility",
];
const NEUTRAL: ItemArchetype[] = ["boots", "starter", "component"];

function profileOf(
  preferred: ItemArchetype[],
  label: string,
  keepUtility = false,
): ChampionBuildProfile {
  const allowed = new Set<ItemArchetype>([...preferred, ...NEUTRAL]);
  if (keepUtility) allowed.add("utility");
  return {
    preferred: [...preferred, ...NEUTRAL],
    excluded: COMBAT_ARCHETYPES.filter((a) => !allowed.has(a)).concat("jungle"),
    label,
  };
}

export function championBuildProfile(input: {
  roleTags: string[];
  scaling: "AD" | "AP" | "혼합" | "체력" | "없음";
  rangeType: "근접" | "원거리";
  /** 물리 피해 스킬을 갖고 있는지 (계수가 없는 고정 피해 스킬 보정용) */
  hasPhysicalSpell?: boolean;
}): ChampionBuildProfile {
  const { roleTags, scaling, hasPhysicalSpell } = input;
  const primary = roleTags[0];
  const secondary = roleTags[1];
  const isAp = scaling === "AP";

  switch (primary) {
    case "Marksman":
      // 원거리 딜러 태그라도 계수가 AP 면 메이지 아이템을 산다 (티모)
      if (isAp) return profileOf(["mage", "battlemage"], "주문력 원거리 딜러");
      // 부 역할이 마법사이고 순수 AD 가 아니면 주문력 아이템도 후보다 (케일)
      if (secondary === "Mage" && scaling !== "AD") {
        return profileOf(["mage", "marksman", "battlemage"], "혼합 원거리 딜러");
      }
      return profileOf(["marksman", "assassin", "bruiser"], "원거리 딜러");

    case "Support":
      return profileOf(["enchanter", "tank", "battlemage"], "서포터", true);

    case "Mage":
      return secondary === "Support"
        ? profileOf(["enchanter", "mage", "battlemage"], "서포터 마법사", true)
        : profileOf(["mage", "battlemage"], "메이지");

    case "Assassin":
      return isAp
        ? profileOf(["mage", "battlemage"], "주문력 암살자")
        : profileOf(["assassin", "bruiser"], "암살자");

    case "Tank":
      // 부 역할이 서포터면 아군 보조 아이템도 후보다 (브라움)
      if (secondary === "Support") {
        return profileOf(["tank", "enchanter"], "탱커 서포터", true);
      }
      // 부 역할이 마법사면 AP 탱커 (말파이트, 신지드)
      return isAp || secondary === "Mage"
        ? profileOf(["tank", "battlemage", "mage"], "주문력 탱커", true)
        : profileOf(["tank", "bruiser"], "탱커", true);

    case "Fighter":
      if (isAp) {
        // 계수가 AP 로 읽히지만 물리 피해 스킬이 있으면 AD 아이템도 후보다.
        // 나서스 Q 처럼 중첩으로 피해가 오르는 스킬은 데이터에 계수가 없어 AP 로 잡힌다.
        return hasPhysicalSpell
          ? profileOf(["battlemage", "bruiser", "tank", "mage"], "전사(혼합 계수)")
          : profileOf(["battlemage", "tank", "mage"], "주문력 전사");
      }
      // 부 역할이 암살자면 물리 관통 계열도 후보에 남긴다 (카밀, 다리우스의 세릴다)
      return secondary === "Assassin"
        ? profileOf(["bruiser", "tank", "assassin"], "브루저(암살 성향)")
        : profileOf(["bruiser", "tank"], "브루저");

    default:
      // 태그가 없으면 계수로만 판단
      return isAp ? profileOf(["mage", "battlemage"], "메이지") : profileOf(["bruiser", "tank"], "전사");
  }
}
