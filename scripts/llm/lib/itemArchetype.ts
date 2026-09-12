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

/**
 * LoL Wiki 상점 역할군 탭 → 우리 역할군.
 * 상점 분류가 정답이므로 스탯 추정보다 우선한다.
 */
const MENU_TO_ARCHETYPE: Record<string, ItemArchetype[]> = {
  fighter: ["bruiser"],
  tank: ["tank"],
  mage: ["mage"],
  marksman: ["marksman"],
  assassin: ["assassin"],
  support: ["enchanter"],
  // "movement" 은 이동 속도 아이템 탭이다. 장화 등급은 tier 로 따로 판정한다.
};

/** 상점 탭 중 역할군이 아니라 기능을 뜻하는 것 */
const MENU_TO_FUNCTION: Record<string, string> = {
  movement: "이동 속도",
  "onhit effects": "적중 시 효과",
  "lifesteal vamp": "생명력 흡수",
  "armor pen": "물리 관통",
  "magic pen": "마법 관통",
  "health and reg": "체력·재생",
  "mana and reg": "마나·재생",
  "ability power": "주문력",
  "attack damage": "공격력",
  "attack speed": "공격 속도",
};

const WIKI_TYPE_TO_TIER: Record<string, ItemTier> = {
  Legendary: "legendary",
  Epic: "epic",
  Basic: "basic",
  Starter: "starter",
  Boots: "boots",
  Consumable: "consumable",
  Trinket: "consumable",
};

export interface WikiItemInfo {
  menu: string[];
  types: string[];
}

export function classifyItem(item: NormalizedItem, wiki?: WikiItemInfo): ItemClassification {
  // 등급도 위키 type 을 우선한다 (우리 휴리스틱은 신규 아이템에서 자주 어긋난다)
  const wikiTier = wiki?.types.map((t) => WIKI_TYPE_TO_TIER[t]).find(Boolean);
  const tier = wikiTier ?? getOfficialLikeItemTier(item);
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

  // 위키 상점 탭이 있으면 그것이 정답이다
  if (wiki?.menu.length) {
    for (const menu of wiki.menu) {
      const fn = MENU_TO_FUNCTION[menu];
      if (fn && !functions.includes(fn)) functions.push(fn);
    }
    const fromMenu = wiki.menu.flatMap((m) => MENU_TO_ARCHETYPE[m] ?? []);
    if (fromMenu.length) {
      // 주문력 + 체력 조합은 마법 전사로 세분화한다 (상점은 mage 로만 표기)
      if (fromMenu.includes("mage") && health) fromMenu.push("battlemage");
      // 서포터 탭이면서 주문력이 없으면 유틸리티 (기사의 맹세 등)
      if (fromMenu.includes("enchanter") && !ap) fromMenu.push("utility");
      const tierOnly: ItemArchetype[] = [];
      if (tier === "starter") tierOnly.push("starter");
      if (tier === "basic") tierOnly.push("component");
      if (tier === "boots") tierOnly.push("boots");
      if (tier === "consumable") tierOnly.push(tags.includes("Trinket") ? "trinket" : "consumable");
      return {
        tier,
        archetypes: Array.from(new Set([...fromMenu, ...tierOnly])),
        resists,
        functions,
      };
    }
  }

  // 등급이 곧 분류인 것들 먼저 처리 (위키에 없는 신규 아이템은 스탯으로 추정한다)
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

/**
 * LoL Wiki 하위 클래스 → 아이템 역할군.
 *
 * 라이엇 roles 는 큰 분류(Fighter/Tank)까지만 알려주지만, 위키의 하위 클래스는
 * 같은 전사 안에서 저거너트(나서스·다리우스)와 스커미셔(피오라·잭스)와 다이버(카밀)를 가른다.
 * 실제 빌드가 갈리는 지점이 바로 이 층이다.
 */
const SUBCLASS_POOLS: Record<string, { ad: ItemArchetype[]; ap: ItemArchetype[]; label: string }> = {
  // 전사 계열
  Juggernaut: { ad: ["bruiser", "tank"], ap: ["battlemage", "tank"], label: "저거너트(브루저·탱커)" },
  Diver: { ad: ["bruiser", "tank", "assassin"], ap: ["battlemage", "tank"], label: "다이버(돌진 브루저)" },
  Skirmisher: { ad: ["bruiser", "marksman", "tank"], ap: ["battlemage", "tank"], label: "스커미셔(결투가)" },
  // 탱커 계열
  Vanguard: { ad: ["tank", "bruiser"], ap: ["tank", "battlemage", "mage"], label: "뱅가드(돌진 탱커)" },
  Warden: { ad: ["tank", "enchanter"], ap: ["tank", "enchanter", "battlemage"], label: "와든(수호 탱커)" },
  // 암살자 계열
  Assassin: { ad: ["assassin", "bruiser"], ap: ["mage", "battlemage"], label: "암살자" },
  // 마법사 계열
  Burst: { ad: ["assassin", "mage"], ap: ["mage", "battlemage"], label: "버스트 메이지" },
  Battlemage: { ad: ["bruiser", "battlemage"], ap: ["battlemage", "mage", "tank"], label: "배틀메이지" },
  Artillery: { ad: ["mage"], ap: ["mage"], label: "아틸러리(장거리 포격)" },
  Mage: { ad: ["mage"], ap: ["mage", "battlemage"], label: "메이지" },
  // 원거리 딜러
  Marksman: { ad: ["marksman", "assassin", "bruiser"], ap: ["mage", "battlemage"], label: "원거리 딜러" },
  // 서포터 계열
  Enchanter: { ad: ["enchanter", "tank"], ap: ["enchanter", "mage", "battlemage"], label: "인챈터" },
  Catcher: { ad: ["enchanter", "tank"], ap: ["enchanter", "battlemage", "tank"], label: "캐처(구속형 서포터)" },
};

export function championBuildProfile(input: {
  roleTags: string[];
  scaling: "AD" | "AP" | "혼합" | "체력" | "없음";
  rangeType: "근접" | "원거리";
  /** 물리 피해 스킬을 갖고 있는지 (계수가 없는 고정 피해 스킬 보정용) */
  hasPhysicalSpell?: boolean;
  /** LoL Wiki 하위 클래스 (Juggernaut, Skirmisher …). Specialist 는 판정에 쓰지 않는다 */
  wikiSubclass?: string;
  /**
   * 라이엇 공식 분류. 있으면 스킬 툴팁 추정보다 이쪽을 신뢰한다.
   * damageType 은 나서스 Q 처럼 계수가 없는 스킬 때문에 생기는 오판을 막아 준다.
   * durability 는 같은 전사 태그 안에서 브루저와 탱커를 가른다.
   */
  riot?: {
    damageType?: "물리" | "마법" | "혼합";
    tagPrimary?: string;
    playstyle?: { damage: number; durability: number };
  };
}): ChampionBuildProfile {
  const { roleTags, scaling, hasPhysicalSpell, riot, wikiSubclass } = input;
  const primary = roleTags[0];
  const secondary = roleTags[1];
  // 라이엇 damageType 이 있으면 그것이 기준이다
  const isAp = riot?.damageType ? riot.damageType === "마법" : scaling === "AP";
  const isMixedDamage = riot?.damageType === "혼합";
  // 주 특성이 "내구성" 이거나 내구도 지표가 최고면 탱커 성향이 강하다
  const tanky = riot?.tagPrimary === "내구성" || (riot?.playstyle?.durability ?? 0) >= 3;

  // 1순위: 위키 하위 클래스. 실제 빌드가 갈리는 층이다.
  // Specialist 는 정의상 분류 불가 챔피언이므로 아래의 역할 태그 규칙으로 넘긴다.
  const pool = wikiSubclass ? SUBCLASS_POOLS[wikiSubclass] : undefined;
  if (pool) {
    const archetypes = isAp ? pool.ap : pool.ad;
    const withTank = tanky && !archetypes.includes("tank") ? [...archetypes, "tank" as const] : archetypes;
    return profileOf(withTank, pool.label, withTank.includes("enchanter"));
  }

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
        // 라이엇 damageType 이 없을 때만 스킬 계수 추정을 보정한다
        return hasPhysicalSpell && !riot?.damageType
          ? profileOf(["battlemage", "bruiser", "tank", "mage"], "전사(혼합 계수)")
          : profileOf(["battlemage", "tank", "mage"], "주문력 전사");
      }
      if (isMixedDamage) {
        return profileOf(["bruiser", "tank", "battlemage"], "혼합 피해 전사");
      }
      // 내구도가 높은 전사는 탱커 아이템이 먼저다 (나서스, 세트)
      if (tanky) return profileOf(["tank", "bruiser"], "브루저·탱커", true);
      // 부 역할이 암살자면 물리 관통 계열도 후보에 남긴다 (카밀, 다리우스의 세릴다)
      return secondary === "Assassin"
        ? profileOf(["bruiser", "tank", "assassin"], "브루저(암살 성향)")
        : profileOf(["bruiser", "tank"], "브루저");

    default:
      // 태그가 없으면 계수로만 판단
      return isAp ? profileOf(["mage", "battlemage"], "메이지") : profileOf(["bruiser", "tank"], "전사");
  }
}
