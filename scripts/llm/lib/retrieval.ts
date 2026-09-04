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
import { getOfficialLikeItemTier, type ItemTier } from "../../../src/lib/itemTierUtils";
import type { ChampionCard } from "./facts";
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

function toBrief(item: NormalizedItem): ItemBrief {
  const effects = item.effects
    .map((e) => `${e.name}: ${truncate(stripHtml(e.description), 140)}`)
    .join(" | ");
  return {
    id: item.id,
    name: item.name,
    tier: getOfficialLikeItemTier(item),
    priceTotal: item.priceTotal,
    stats: describeStats(item),
    effects: effects || undefined,
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
  } = {},
): ItemSelection {
  const { maxLegendaries = 8, maxComponents = 5, me, maxOffensive = 8, pinnedNames = [] } = options;
  // 피해 유형이 혼합이면 계수 프로필로 동점을 깬다.
  // 예: 피오라는 물리·마법·고정이 섞이지만 계수가 AD 이므로 방어력이 답이다.
  const focus: ItemSelection["focus"] =
    enemy.damageProfile.primary === "마법"
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

  const tiered = rift.map((item) => ({ item, tier: getOfficialLikeItemTier(item) }));

  const starters = tiered
    .filter(({ tier }) => tier === "starter")
    .filter(({ item }) => !item.tags.includes("Jungle") && !item.tags.includes("GoldPer"))
    .map(({ item }) => item)
    .sort((a, b) => a.priceTotal - b.priceTotal);

  const components = tiered
    .filter(({ tier, item }) => (tier === "basic" || tier === "epic") && matchesFocus(item))
    .map(({ item }) => item)
    .sort((a, b) => a.priceTotal - b.priceTotal)
    .slice(0, maxComponents);

  const boots = tiered
    .filter(({ tier, item }) => tier === "boots" && matchesFocus(item))
    .map(({ item }) => item);

  // 아군 대상 보조 아이템(오라/희생 계열)은 1대1 상성 조언에 부적합하므로 제외
  const isSupportItem = (item: NormalizedItem) =>
    item.tags.includes("Aura") || item.tags.includes("GoldPer");

  const legendaries = tiered
    .filter(({ tier, item }) => tier === "legendary" && matchesFocus(item) && !isSupportItem(item))
    .map(({ item }) => item)
    .sort((a, b) => a.priceTotal - b.priceTotal)
    .slice(0, maxLegendaries);

  const antiHeal = enemy.mechanics.includes("회복")
    ? rift
        .filter((item) => {
          const text = `${stripHtml(item.description)} ${item.effects.map((e) => stripHtml(e.description)).join(" ")}`;
          return ANTI_HEAL_RE.test(text);
        })
        .sort((a, b) => a.priceTotal - b.priceTotal)
    : [];

  // 내 계수 프로필에 맞는 공격 전설 아이템
  const myScaling = me?.scalingProfile.primary;
  const offensiveStat =
    myScaling === "AP" ? "ABILITY_POWER" : myScaling === "AD" ? "ATTACK_DAMAGE" : undefined;
  const offensive = offensiveStat
    ? tiered
        .filter(
          ({ tier, item }) => tier === "legendary" && hasStat(item, offensiveStat) && !isSupportItem(item),
        )
        .map(({ item }) => item)
        .sort((a, b) => a.priceTotal - b.priceTotal)
        .slice(0, maxOffensive)
    : [];

  const pinnedSet = new Set(pinnedNames);
  const pinned = rift.filter((item) => pinnedSet.has(item.name));

  return {
    focus,
    starters: starters.map(toBrief),
    components: components.map(toBrief),
    boots: boots.map(toBrief),
    legendaries: legendaries.map(toBrief),
    antiHeal: antiHeal.map(toBrief),
    offensive: offensive.map(toBrief),
    pinned: pinned.map(toBrief),
  };
}

export function itemSelectionToText(sel: ItemSelection): string {
  const focusLabel = sel.focus.map((f) => STAT_LABEL[f]).join("+");
  const fmt = (list: ItemBrief[]) =>
    list
      .map((i) => `  - ${i.name} (${i.priceTotal}G; ${i.stats}${i.effects ? `; ${i.effects}` : ""})`)
      .join("\n");
  const sections = [
    `방어 기준 스탯: ${focusLabel} (상대 주 피해 유형에서 도출)`,
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
