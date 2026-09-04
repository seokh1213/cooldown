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

function matchesSearch(item: Item, rawQuery: string): boolean {
  const query = normalizeSearchText(rawQuery.trim());
  const initialQuery = rawQuery.replace(/\s+/g, "");
  const initialsOnly = /^[ㄱ-ㅎ]+$/.test(initialQuery) ? initialQuery : "";
  if (!query && !initialsOnly) return true;
  const name = normalizeSearchText(getItemName(item));
  if (query && name.includes(query)) return true;
  const initials = koreanInitials(getItemName(item));
  if (initialsOnly && initials.includes(initialsOnly)) return true;
  return Boolean(query && initials && `${initials[0]}${name.slice(1)}`.includes(query));
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
