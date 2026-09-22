import Hangul from "hangul-js";
import type { Translations } from "@/i18n/translations";
import type { NormalizedItem } from "@/types/combatNormalized";
import { STAT_DEFINITIONS, type StatContribution, StatKey } from "@/types/combatStats";
import { getOfficialLikeItemTier, type ItemTier } from "@/lib/itemTierUtils";

export type Item = NormalizedItem;

export interface ItemTreeNode {
  item: Item;
  children: ItemTreeNode[];
}

export function getItemName(item: Item): string {
  return item.name || item.id;
}

export function shouldShowInStore(item: Item): boolean {
  const tags = item.tags || [];
  const isFreeStoreItem = tags.includes("Trinket") || tags.includes("Consumable");
  if (item.availableOnMap11 === false) return false;
  if (!isFreeStoreItem && (item.priceTotal ?? 0) <= 0) return false;
  return item.purchasable !== false &&
    item.inStore !== false &&
    item.displayInItemSets !== false;
}

export function shouldShowPrice(item: Item): boolean {
  return (item.priceTotal ?? 0) > 0 &&
    item.purchasable !== false &&
    item.inStore !== false &&
    item.displayInItemSets !== false;
}

export function getItemPriceLabel(item: Item, t: Translations): string {
  if ((item.price ?? 0) === 0 && (item.buildsFrom?.length ?? 0) > 0) {
    return t.encyclopedia.items.price.unavailable;
  }
  return (item.priceTotal ?? 0) > 0 || shouldShowPrice(item)
    ? (item.priceTotal ?? 0).toLocaleString()
    : t.encyclopedia.items.price.free;
}

/**
 * 능력치 줄에 붙일 스탯 글리프
 *
 * 스킬 툴팁은 "60% 공격력" 앞에 검 모양을 붙여 어떤 스탯인지 한눈에 보이게 한다.
 * 아이템 능력치 줄도 같은 값을 말하는데 글자만 있었다.
 *
 *   체력 150 / 방어력 8 / 마법 저항력 8
 *
 * 줄은 라이엇이 준 그 나라 말 문장이라 스탯 코드가 붙어 있지 않다. 이름을 언어마다
 * 손으로 적을 수도 있지만 그러면 세 벌을 지어내야 하고, 지어낸 이름은 라이엇이 말을
 * 바꾸는 순간 조용히 어긋난다.
 *
 * 대신 **자료에서 짝을 뽑는다.** 능력치 줄이 하나이고 스탯도 하나인 아이템은 그
 * 둘이 서로를 가리킨다 — 장화는 `["이동 속도 25"]` 와 `[MOVE_SPEED]` 다. 이런
 * 아이템만 모으면 라이엇이 쓰는 그 나라 말 이름이 그대로 나오고, 세 언어에서
 * 충돌이 한 건도 없다(각 8종 확정).
 *
 * 줄이 여럿인 아이템으로 셈을 넓혀 보니 오히려 틀렸다. 수치가 같은 줄끼리 엮여
 * "방어구 관통력" 이 공격력이 되고 "모든 피해 흡혈" 이 이동 속도가 됐다. 값은
 * 겹치기 때문에 근거가 못 된다.
 *
 * 그래서 짝을 못 찾는 줄에는 아무 그림도 붙이지 않는다. 스킬 가속·강인함·관통력은
 * ddragon 의 아이템 능력치 묶음에 아예 안 실려 근거가 없다.
 */
export function buildStatLabelIcons(items: Iterable<Item>): Map<string, string> {
  const byLabel = new Map<string, StatKey>();
  const conflicting = new Set<string>();
  for (const item of items) {
    const lines = item.statDescriptions ?? [];
    const stats = (item.stats ?? []) as StatContribution[];
    if (lines.length !== 1 || stats.length !== 1) continue;
    const label = statLineLabel(lines[0]);
    if (!label) continue;
    const known = byLabel.get(label);
    if (known && known !== stats[0].stat) conflicting.add(label);
    else byLabel.set(label, stats[0].stat);
  }
  const icons = new Map<string, string>();
  for (const [label, stat] of byLabel) {
    if (conflicting.has(label)) continue;
    const icon = STAT_DEFINITIONS[stat]?.icon;
    if (icon) icons.set(label, icon);
  }
  return icons;
}

/** 능력치 줄에서 수치와 표시를 걷어낸 이름. "공격력 <span>10</span>" → "공격력" */
function statLineLabel(line: string): string {
  return line
    .replace(/<[^>]*>/g, "")
    .replace(/[\d.,%+-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 줄이 말하는 스탯의 글리프. 긴 이름을 먼저 본다 — "체력" 은 "체력 재생" 안에도 있다. */
export function statLineIcon(line: string, icons: ReadonlyMap<string, string>): string | undefined {
  const plain = statLineLabel(line);
  let best: { length: number; icon: string } | undefined;
  for (const [label, icon] of icons) {
    if (!plain.includes(label)) continue;
    if (!best || label.length > best.length) best = { length: label.length, icon };
  }
  return best?.icon;
}

export function getItemStatLines(item: Item, locale: string): string[] {
  const aggregated = new Map<StatKey, { value: number; isPercent: boolean }>();
  for (const contribution of (item.stats || []) as StatContribution[]) {
    const definition = STAT_DEFINITIONS[contribution.stat];
    if (!definition || contribution.valueType === "perLevel") continue;
    if (contribution.valueType !== "percent" && contribution.valueType !== "flat") {
      continue;
    }
    const current = aggregated.get(contribution.stat) ?? {
      value: 0,
      isPercent: definition.isPercent,
    };
    current.value += contribution.value;
    if (contribution.valueType === "percent") current.isPercent = true;
    aggregated.set(contribution.stat, current);
  }
  return [...aggregated.entries()].flatMap(([stat, value]) => {
    if (!value.value) return [];
    const definition = STAT_DEFINITIONS[stat];
    const label = locale.startsWith("ko") ? definition.label.ko : definition.label.en;
    const display = value.isPercent && Math.abs(value.value) <= 1
      ? Math.round(value.value * 100)
      : value.value;
    return [`+ ${display}${value.isPercent ? "%" : ""} ${label}`];
  });
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/[^0-9a-z\uac00-\ud7a3ㄱ-ㅎ]/g, "");
}

function koreanInitials(value: string): string {
  try {
    return Hangul.d(value, true).map((chars: string[]) => chars[0]).join("");
  } catch {
    return "";
  }
}

/**
 * 이름 말고 **별칭**으로도 찾는다.
 *
 * 리엇이 로케일마다 `colloq` 에 상점 별칭을 채워 둔다. 한국어는 "똥신"·"요부"·"자벨",
 * 영어는 "bf"·"dshield", 중국어는 병음과 그 이니셜 "sdzx"·"xnfh" 다. 쓰는 사람이
 * 실제로 부르는 말이라 이름만 보는 검색은 이것들을 다 놓쳤다.
 *
 * 공식 값만 쓴다. 손으로 별칭 표를 만들지 않는다 — 패치마다 갱신해야 하고 틀리면
 * 고칠 사람이 없다.
 */
function searchKeys(item: Item): string[] {
  return [getItemName(item), ...(item.aliases ?? [])];
}

function matchesSearch(item: Item, rawQuery: string): boolean {
  const query = normalizeSearchText(rawQuery.trim());
  const initialQuery = rawQuery.replace(/\s+/g, "");
  const initialsOnly = /^[ㄱ-ㅎ]+$/.test(initialQuery) ? initialQuery : "";
  if (!query && !initialsOnly) return true;
  for (const key of searchKeys(item)) {
    const name = normalizeSearchText(key);
    if (query && name.includes(query)) return true;
    const initials = koreanInitials(key);
    if (initialsOnly && initials.includes(initialsOnly)) return true;
    // 첫 글자만 초성으로 친 꼴("ㅁ첩성의 망토"). 이름에 쓰던 규칙을 별칭에도 적용한다.
    if (query && initials && `${initials[0]}${name.slice(1)}`.includes(query)) return true;
  }
  return false;
}

export function groupItemsByTier(
  items: readonly Item[] | null,
  search: string,
): Record<ItemTier, Item[]> {
  const grouped: Record<ItemTier, Item[]> = {
    consumable: [],
    boots: [],
    starter: [],
    basic: [],
    epic: [],
    legendary: [],
  };
  for (const item of items ?? []) {
    if (matchesSearch(item, search)) grouped[getOfficialLikeItemTier(item)].push(item);
  }
  for (const tier of Object.keys(grouped) as ItemTier[]) {
    grouped[tier].sort((left, right) =>
      (left.priceTotal ?? 0) - (right.priceTotal ?? 0));
  }
  return grouped;
}

export function collectUpgradeItems(
  root: Item,
  itemMap: ReadonlyMap<string, Item>,
): Item[] {
  const candidates = (root.buildsInto ?? [])
    .map((id) => itemMap.get(id))
    .filter((item): item is Item => Boolean(item))
    .filter((item) => item.availableOnMap11 !== false)
    .filter((item) => item.displayInItemSets !== false)
    .filter((item) => item.inStore !== false || (item.buildsInto?.length ?? 0) > 0);
  const byName = new Map<string, Item>();
  for (const item of candidates) {
    const key = getItemName(item);
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, item);
      continue;
    }
    const existingId = Number.parseInt(existing.id, 10);
    const currentId = Number.parseInt(item.id, 10);
    const preferCurrent = Number.isFinite(existingId) && Number.isFinite(currentId)
      ? currentId < existingId
      : item.id < existing.id;
    if (preferCurrent) byName.set(key, item);
  }
  return [...byName.values()].sort((left, right) =>
    (left.priceTotal ?? 0) - (right.priceTotal ?? 0));
}

export function buildItemTree(
  root: Item,
  itemMap: ReadonlyMap<string, Item>,
  depth = 0,
): ItemTreeNode {
  if (depth >= 6) return { item: root, children: [] };
  const children = (root.buildsFrom ?? []).flatMap((id) => {
    const item = itemMap.get(id);
    return item ? [buildItemTree(item, itemMap, depth + 1)] : [];
  });
  return { item: root, children };
}
