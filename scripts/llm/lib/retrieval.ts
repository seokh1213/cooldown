/**
 * 상성 질의에 맞는 아이템/룬/소환사 주문 후보 선별 (규칙 기반 retrieval)
 *
 * 벡터 검색 없이도 "상대 주 피해 유형" 만으로 방어 아이템 후보를 좁힐 수 있다.
 * LLM 은 여기서 건네준 후보 안에서만 고르게 하여 존재하지 않는 아이템 생성을 막는다.
 */
import type {
  NormalizedItem,
  NormalizedRune,
  NormalizedSummonerSpell,
} from "../../../src/types/combatNormalized";
import type { ItemTier } from "../../../src/lib/itemTierUtils";
import type { ChampionCard } from "./facts";
import {
  ARCHETYPE_LABEL,
  championBuildProfile,
  classifyItem,
  type ItemArchetype,
  type WikiItemInfo,
} from "./itemArchetype";
import { stripHtml, truncate } from "./text";

const STAT_LABEL: Record<string, string> = {
  MAX_HEALTH: "체력",
  ARMOR: "방어력",
  MAGIC_RESIST: "마법 저항력",
  ATTACK_DAMAGE: "공격력",
  ABILITY_POWER: "주문력",
  ABILITY_HASTE: "스킬 가속",
  ATTACK_SPEED: "공격 속도",
  MOVE_SPEED: "이동 속도",
  MOVE_SPEED_PERCENT: "이동 속도%",
  LIFE_STEAL: "생명력 흡수",
  OMNIVAMP: "모든 피해 흡혈",
  HEALTH_REGEN: "체력 재생",
  MANA_REGEN: "마나 재생",
  MAX_MANA: "마나",
  CRIT_CHANCE: "치명타 확률",
  LETHALITY: "물리 관통력",
  ARMOR_PENETRATION_PERCENT: "방어구 관통%",
  MAGIC_PENETRATION: "마법 관통력",
  MAGIC_PENETRATION_PERCENT: "마법 관통%",
  TENACITY: "강인함",
  HEAL_SHIELD_POWER: "회복 및 보호막 강화",
};

export interface ItemBrief {
  id: string;
  name: string;
  tier: ItemTier;
  priceTotal: number;
  stats: string;
  effects?: string;
  /** 역할군 라벨 (브루저, 탱커 …) */
  archetypes?: string;
  /** 특수 기능 (치유 감소, 강인함 …) */
  functions?: string;
}

export interface ItemSelection {
  /** 어떤 방어 스탯을 기준으로 골랐는지 */
  focus: Array<"MAGIC_RESIST" | "ARMOR">;
  starters: ItemBrief[];
  components: ItemBrief[];
  boots: ItemBrief[];
  legendaries: ItemBrief[];
  /** 치유 감소 아이템 (상대가 회복 스킬을 가질 때만 채운다) */
  antiHeal: ItemBrief[];
  /** 내 챔피언 계수에 맞는 공격 전설 아이템 */
  offensive: ItemBrief[];
  /** 지식 카드/팁이 이름으로 지목한 아이템 — 가격 절단으로 누락되지 않게 항상 포함 */
  pinned: ItemBrief[];
  /** 내 챔피언 빌드 성향 (브루저/탱커/메이지/원거리 딜러/암살자/서포터) */
  buildLabel?: string;
}

function describeStats(item: NormalizedItem): string {
  return item.stats
    .map((s) => {
      const label = STAT_LABEL[s.stat] ?? s.stat;
      if (s.valueType === "percent") {
        // 0.15 처럼 비율로 저장된 값은 % 로 환산
        const pct = Math.abs(s.value) < 1 ? Math.round(s.value * 1000) / 10 : s.value;
        return `${label} ${pct}%`;
      }
      return `${label} ${s.value}`;
    })
    .join(", ");
}

function toBrief(item: NormalizedItem, wikiItems?: Map<string, WikiItemInfo>): ItemBrief {
  const effects = item.effects
    .map((e) => `${e.name}: ${truncate(stripHtml(e.description), 140)}`)
    .join(" | ");
  const classification = classifyItem(item, wikiItems?.get(item.id));
  return {
    id: item.id,
    name: item.name,
    tier: classification.tier,
    priceTotal: item.priceTotal,
    stats: describeStats(item),
    effects: effects || undefined,
    archetypes:
      classification.archetypes.map((a) => ARCHETYPE_LABEL[a]).join(",") || undefined,
    functions: classification.functions.join(",") || undefined,
  };
}

function isRiftItem(item: NormalizedItem): boolean {
  return (
    item.availableOnMap11 !== false &&
    item.purchasable !== false &&
    item.inStore !== false &&
    !item.requiredChampion &&
    !item.requiredAlly
  );
}

function hasStat(item: NormalizedItem, stat: string): boolean {
  return item.stats.some((s) => s.stat === stat && s.value > 0);
}

/** 이름 중복(동명이인 ornn 업그레이드 등) 제거 — 가장 싼 것만 남김 */
function dedupeByName(items: NormalizedItem[]): NormalizedItem[] {
  const byName = new Map<string, NormalizedItem>();
  for (const it of items) {
    const prev = byName.get(it.name);
    if (!prev || it.priceTotal < prev.priceTotal) byName.set(it.name, it);
  }
  return Array.from(byName.values());
}

const ANTI_HEAL_RE = /치유 효과|고통스러운 상처/;

export function selectDefensiveItems(
  items: NormalizedItem[],
  enemy: ChampionCard,
  options: {
    maxLegendaries?: number;
    maxComponents?: number;
    me?: ChampionCard;
    maxOffensive?: number;
    /** 지식 카드가 지목한 아이템 이름 */
    pinnedNames?: string[];
    /** LoL Wiki 아이템 상점 분류 (있으면 스탯 추정보다 우선) */
    wikiItems?: Map<string, WikiItemInfo>;
  } = {},
): ItemSelection {
  const {
    maxLegendaries = 8,
    maxComponents = 5,
    me,
    maxOffensive = 8,
    pinnedNames = [],
    wikiItems,
  } = options;
  // 방어 기준 스탯은 라이엇 damageType 을 우선한다.
  // 툴팁 집계는 나서스처럼 계수 없는 스킬 때문에 틀릴 수 있다(라이엇: 물리, 집계: 마법).
  // 라이엇 값이 없거나 혼합이면 툴팁 집계와 계수 프로필로 판정한다.
  const riotDamage = enemy.riot?.damageType;
  const focus: ItemSelection["focus"] =
    riotDamage === "마법"
      ? ["MAGIC_RESIST"]
      : riotDamage === "물리"
        ? ["ARMOR"]
        : enemy.damageProfile.primary === "마법"
          ? ["MAGIC_RESIST"]
          : enemy.damageProfile.primary === "물리"
            ? ["ARMOR"]
            : enemy.scalingProfile.primary === "AD"
              ? ["ARMOR"]
              : enemy.scalingProfile.primary === "AP"
                ? ["MAGIC_RESIST"]
                : ["MAGIC_RESIST", "ARMOR"];

  const rift = dedupeByName(items.filter(isRiftItem));
  const matchesFocus = (item: NormalizedItem) => focus.some((stat) => hasStat(item, stat));

  const classified = rift.map((item) => ({ item, c: classifyItem(item, wikiItems?.get(item.id)) }));

  /**
   * 내 챔피언 빌드 성향으로 아이템 역할군을 좁힌다.
   * 이 단계가 없으면 브루저 조언에 원거리 딜러 아이템이나 서포터 아이템이 섞인다.
   * 근거는 docs/lol-fundamentals.md 8~9장.
   */
  const profile = me
    ? championBuildProfile({
        roleTags: me.roleTags,
        scaling: me.scalingProfile.primary,
        rangeType: me.rangeType,
        hasPhysicalSpell: me.spells.some((s) => s.damageTypes.includes("물리")),
        riot: me.riot,
        wikiSubclass: me.wiki?.subclass,
      })
    : undefined;
  /**
   * 상점 역할군 탭은 한 아이템이 여러 개에 걸린다(칠흑의 양날 도끼 = 브루저·암살자).
   * 그래서 "제외 역할군이 하나라도 있으면 배제" 하면 정상 아이템까지 빠진다.
   * 선호 역할군에 하나라도 걸리면 통과시키고, 걸리는 것이 없을 때만 제외를 본다.
   */
  const fitsProfile = (archetypes: ItemArchetype[]) => {
    if (!profile) return true;
    // 장화·시작·하위 아이템은 역할군 판정 대상이 아니다
    const combat = archetypes.filter(
      (a) => !["boots", "starter", "component", "consumable", "trinket", "jungle"].includes(a),
    );
    if (combat.length === 0) return true;
    // 아군 보조 아이템은 예외다. 상점이 탱커 탭에도 올려 두지만(기사의 맹세)
    // 서포터가 아닌 챔피언에게는 값을 하지 못하므로 무조건 제외한다.
    if (combat.includes("enchanter") && profile.excluded.includes("enchanter")) return false;
    if (combat.some((a) => profile.preferred.includes(a))) return true;
    return !combat.some((a) => profile.excluded.includes(a));
  };

  // 시작 아이템은 역할군 태그가 없으므로 내 계수와 맞는 공격 스탯인지로 걸러낸다.
  // (AD 브루저에게 도란의 반지·암흑의 인장을 권하면 안 된다)
  // 계수도 라이엇 damageType 을 우선한다 (나서스처럼 툴팁 집계가 틀리는 경우가 있다)
  const myScalingPrimary =
    me?.riot?.damageType === "물리"
      ? "AD"
      : me?.riot?.damageType === "마법"
        ? "AP"
        : me?.scalingProfile.primary;
  const starterFitsScaling = (item: NormalizedItem) => {
    const givesAp = hasStat(item, "ABILITY_POWER");
    const givesAd = hasStat(item, "ATTACK_DAMAGE");
    if (!givesAp && !givesAd) return true; // 방어·마나 계열은 누구나 산다
    if (myScalingPrimary === "AD") return !givesAp;
    if (myScalingPrimary === "AP") return !givesAd;
    return true;
  };

  const starters = classified
    .filter(({ c }) => c.tier === "starter")
    .filter(({ item }) => !item.tags.includes("Jungle") && !item.tags.includes("GoldPer"))
    .filter(({ item }) => starterFitsScaling(item))
    .map(({ item }) => item)
    .sort((a, b) => a.priceTotal - b.priceTotal);

  const components = classified
    .filter(({ c, item }) => (c.tier === "basic" || c.tier === "epic") && matchesFocus(item))
    .filter(({ c }) => fitsProfile(c.archetypes))
    .map(({ item }) => item)
    .sort((a, b) => a.priceTotal - b.priceTotal)
    .slice(0, maxComponents);

  const boots = classified
    .filter(({ c, item }) => c.tier === "boots" && matchesFocus(item))
    .map(({ item }) => item);

  const legendaries = classified
    .filter(({ c, item }) => c.tier === "legendary" && matchesFocus(item))
    .filter(({ c }) => fitsProfile(c.archetypes))
    .map(({ item }) => item)
    .sort((a, b) => a.priceTotal - b.priceTotal)
    .slice(0, maxLegendaries);

  // 치유 감소 아이템도 계수에 맞는 것만 남긴다.
  // (AD 브루저에게 망각의 구·모렐로노미콘을 권하면 안 된다)
  const antiHeal = enemy.mechanics.includes("회복")
    ? rift
        .filter((item) => {
          const text = `${stripHtml(item.description)} ${item.effects.map((e) => stripHtml(e.description)).join(" ")}`;
          return ANTI_HEAL_RE.test(text);
        })
        .filter((item) => starterFitsScaling(item))
        .sort((a, b) => a.priceTotal - b.priceTotal)
    : [];

  // 내 계수 프로필에 맞는 공격 전설 아이템
  const offensiveStat =
    myScalingPrimary === "AP"
      ? "ABILITY_POWER"
      : myScalingPrimary === "AD"
        ? "ATTACK_DAMAGE"
        : undefined;
  const offensive = offensiveStat
    ? classified
        .filter(({ c, item }) => c.tier === "legendary" && hasStat(item, offensiveStat))
        .filter(({ c }) => fitsProfile(c.archetypes))
        .map(({ item }) => item)
        .sort((a, b) => a.priceTotal - b.priceTotal)
        .slice(0, maxOffensive)
    : [];

  const pinnedSet = new Set(pinnedNames);
  const pinned = rift.filter((item) => pinnedSet.has(item.name));

  return {
    focus,
    starters: starters.map((item) => toBrief(item, wikiItems)),
    components: components.map((item) => toBrief(item, wikiItems)),
    boots: boots.map((item) => toBrief(item, wikiItems)),
    legendaries: legendaries.map((item) => toBrief(item, wikiItems)),
    antiHeal: antiHeal.map((item) => toBrief(item, wikiItems)),
    offensive: offensive.map((item) => toBrief(item, wikiItems)),
    pinned: pinned.map((item) => toBrief(item, wikiItems)),
    buildLabel: profile?.label,
  };
}

export function itemSelectionToText(sel: ItemSelection): string {
  const focusLabel = sel.focus.map((f) => STAT_LABEL[f]).join("+");
  const fmt = (list: ItemBrief[]) =>
    list
      .map(
        (i) =>
          `  - ${i.name} (${i.priceTotal}G; ${i.stats}${i.archetypes ? `; 역할군 ${i.archetypes}` : ""}${i.functions ? `; ${i.functions}` : ""}${i.effects ? `; ${i.effects}` : ""})`,
      )
      .join("\n");
  const sections = [
    `방어 기준 스탯: ${focusLabel} (상대 주 피해 유형에서 도출)`,
    ...(sel.buildLabel ? [`내 빌드 성향: ${sel.buildLabel} — 이 역할군 아이템만 고릅니다`] : []),
  ];
  if (sel.pinned.length) {
    sections.push(`지식 카드가 지목한 아이템(우선 고려):\n${fmt(sel.pinned)}`);
  }
  sections.push(
    `시작 아이템 후보:\n${fmt(sel.starters)}`,
    `${focusLabel} 하위 아이템:\n${fmt(sel.components)}`,
    `${focusLabel} 장화:\n${fmt(sel.boots)}`,
    `${focusLabel} 전설 아이템:\n${fmt(sel.legendaries)}`,
  );
  if (sel.offensive.length) sections.push(`내 계수에 맞는 공격 전설 아이템:\n${fmt(sel.offensive)}`);
  if (sel.antiHeal.length) sections.push(`치유 감소 아이템:\n${fmt(sel.antiHeal)}`);
  return sections.join("\n");
}

// ---------------------------------------------------------------------------
// 룬
// ---------------------------------------------------------------------------
const RUNE_PATH_LABEL: Record<number, string> = {
  8000: "정밀",
  8100: "지배",
  8200: "마법",
  8300: "영감",
  8400: "결의",
};

export interface RuneBrief {
  id: string;
  name: string;
  path: string;
  tooltip: string;
}

export function selectKeystones(runes: NormalizedRune[], maxTooltip = 150): RuneBrief[] {
  return runes
    .filter((r) => r.slotIndex === 0)
    .map((r) => ({
      id: r.id,
      name: r.name,
      path: RUNE_PATH_LABEL[r.pathId] ?? String(r.pathId),
      tooltip: truncate(stripHtml(r.tooltip), maxTooltip),
    }));
}

export function keystonesToText(list: RuneBrief[]): string {
  return list.map((r) => `- ${r.name} [${r.path}]: ${r.tooltip}`).join("\n");
}

// ---------------------------------------------------------------------------
// 소환사 주문 (협곡 기준 상용 주문만)
// ---------------------------------------------------------------------------
const RIFT_SUMMONERS = new Set([
  "SummonerFlash",
  "SummonerTeleport",
  "SummonerDot",
  "SummonerHaste",
  "SummonerExhaust",
  "SummonerHeal",
  "SummonerBarrier",
  "SummonerBoost",
  "SummonerSmite",
]);

export interface SummonerBrief {
  id: string;
  name: string;
  cooldown: number;
}

export function selectRiftSummoners(spells: NormalizedSummonerSpell[]): SummonerBrief[] {
  return spells
    .filter((s) => RIFT_SUMMONERS.has(s.id))
    .map((s) => ({ id: s.id, name: s.name, cooldown: s.cooldown[0] ?? 0 }));
}

export function summonersToText(list: SummonerBrief[]): string {
  return list.map((s) => `${s.name}(${s.cooldown}초)`).join(", ");
}
