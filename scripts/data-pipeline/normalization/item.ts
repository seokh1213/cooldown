import { parseItemDescription } from "../../../src/lib/spellTooltipParser/index";
import type { NormalizedItem } from "../../../src/types/combatNormalized";
import { StatKey, type StatContribution } from "../../../src/types/combatStats";
import { getNormalizationOverrides } from "./overrides";

interface RawItem {
  name?: string;
  description?: string;
  stats?: Record<string, number | undefined>;
  tags?: unknown[];
  from?: unknown[];
  into?: unknown[];
  maps?: Record<string, unknown>;
  gold?: { base?: number; total?: number; purchasable?: boolean };
  inStore?: boolean;
  displayInItemSets?: boolean;
  requiredChampion?: string;
  requiredAlly?: string;
  cdragon?: {
    categories?: unknown[];
    description?: string;
    iconPath?: string;
    inStore?: boolean;
    displayInItemSets?: boolean;
    requiredChampion?: string;
    requiredAlly?: string;
  };
}

const STAT_MAPPING: Record<
  string,
  { stat: StatKey; valueType: "flat" | "percent" }
> = {
  FlatHPPoolMod: { stat: StatKey.MAX_HEALTH, valueType: "flat" },
  FlatMPPoolMod: { stat: StatKey.MAX_MANA, valueType: "flat" },
  FlatPhysicalDamageMod: { stat: StatKey.ATTACK_DAMAGE, valueType: "flat" },
  FlatMagicDamageMod: { stat: StatKey.ABILITY_POWER, valueType: "flat" },
  FlatArmorMod: { stat: StatKey.ARMOR, valueType: "flat" },
  FlatSpellBlockMod: { stat: StatKey.MAGIC_RESIST, valueType: "flat" },
  FlatMovementSpeedMod: { stat: StatKey.MOVE_SPEED, valueType: "flat" },
  PercentMovementSpeedMod: { stat: StatKey.MOVE_SPEED, valueType: "percent" },
  PercentAttackSpeedMod: { stat: StatKey.ATTACK_SPEED, valueType: "percent" },
  PercentLifeStealMod: { stat: StatKey.LIFE_STEAL, valueType: "percent" },
  PercentCritChanceMod: { stat: StatKey.CRIT_CHANCE, valueType: "percent" },
  AbilityHaste: { stat: StatKey.ABILITY_HASTE, valueType: "flat" },
};

function mapStats(stats: RawItem["stats"]): StatContribution[] {
  return Object.entries(stats ?? {}).flatMap(([key, rawValue]) => {
    const mapping = STAT_MAPPING[key];
    if (!mapping || typeof rawValue !== "number" || rawValue === 0) return [];
    return [
      {
        stat: mapping.stat,
        value: rawValue,
        valueType: mapping.valueType,
        source: "item" as const,
        scope: "item-passive" as const,
      },
    ];
  });
}

function stringsOnly(values: unknown[] | undefined): string[] {
  return (values ?? []).filter(
    (value): value is string => typeof value === "string",
  );
}

function collectTags(
  itemId: string,
  items: Record<string, RawItem>,
  visited: Set<string>,
): string[] {
  if (visited.has(itemId)) return [];
  const item = items[itemId];
  if (!item) return [];

  const tags = [
    ...stringsOnly(item.tags),
    ...stringsOnly(item.cdragon?.categories),
  ];
  const nextVisited = new Set(visited).add(itemId);
  const inheritsBoots = (item.from ?? []).some((childId) =>
    collectTags(String(childId), items, nextVisited).includes("Boots"),
  );
  if (inheritsBoots && !tags.includes("Boots")) tags.push("Boots");
  return tags;
}

function normalizeItem(
  locale: string,
  id: string,
  item: RawItem,
  allItems: Record<string, RawItem>,
): NormalizedItem {
  const gold = item.gold ?? {};
  const availableOnMap11 = item.maps?.["11"];
  const normalized: NormalizedItem = {
    id,
    type: "item",
    name: item.name ?? id,
    description: parseItemDescription(
      item.description ?? item.cdragon?.description,
    ),
    iconPath: item.cdragon?.iconPath,
    price: typeof gold.base === "number" ? gold.base : 0,
    priceTotal: typeof gold.total === "number" ? gold.total : 0,
    tags: [...new Set(collectTags(id, allItems, new Set()).map((tag) => tag.trim()))]
      .filter(Boolean),
    buildsFrom: stringsOnly(item.from),
    buildsInto: stringsOnly(item.into),
    requiredChampion: item.cdragon?.requiredChampion ?? item.requiredChampion,
    requiredAlly: item.cdragon?.requiredAlly ?? item.requiredAlly,
    stats: mapStats(item.stats),
    effects: [],
    purchasable: gold.purchasable,
    inStore: item.inStore ?? item.cdragon?.inStore,
    displayInItemSets:
      item.displayInItemSets ?? item.cdragon?.displayInItemSets,
    ...(typeof availableOnMap11 === "boolean" ? { availableOnMap11 } : {}),
  };
  const override = getNormalizationOverrides()?.items?.[locale]?.[id];
  return override ? { ...normalized, ...override } : normalized;
}

export function normalizeItems(locale: string, raw: unknown): NormalizedItem[] {
  if (!raw || typeof raw !== "object") return [];
  const data = (raw as { data?: Record<string, RawItem> }).data ?? {};
  return Object.entries(data).map(([id, item]) =>
    normalizeItem(locale, id, item, data),
  );
}
