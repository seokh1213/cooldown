import React, { useEffect, useMemo, useState } from "react";
import Hangul from "hangul-js";
import { getNormalizedItems } from "@/services/api";
import type { NormalizedItem } from "@/types/combatNormalized";
import {
  STAT_DEFINITIONS,
  type StatContribution,
  StatKey,
} from "@/types/combatStats";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/i18n";
import { useDeviceType } from "@/hooks/useDeviceType";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { getOfficialLikeItemTier, type ItemTier } from "@/lib/itemTierUtils";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { Search } from "lucide-react";

interface ItemsTabProps {
  version: string;
  lang: string;
}

type Item = NormalizedItem;

type ItemRole = "fighter" | "mage" | "assassin" | "support" | "tank";

type ItemFilter = "all" | ItemRole | "trinket" | "boots";

interface ItemTreeNode {
  item: Item;
  children: ItemTreeNode[];
}

function getItemName(item: Item, _lang: string): string {
  return item.name || item.id;
}

function shouldShowInStore(item: Item): boolean {
  const tags = item.tags || [];
  const isTrinket = tags.includes("Trinket") || tags.includes("Consumable");
  const total = item.priceTotal ?? 0;

  // 소환사의 협곡에서 사용되지 않는 아이템은 기본적으로 숨김
  if (item.availableOnMap11 === false) {
    return false;
  }

  // 트링켓/소비형은 가격이 0이어도 노출
  if (!isTrinket && total <= 0) return false;

  // 정규화된 상점 메타데이터
  if (item.purchasable === false) return false;
  if (item.inStore === false) return false;
  if (item.displayInItemSets === false) return false;

  return true;
}

function isTrinketOrWardOrPotion(item: Item): boolean {
  const tags = item.tags || [];
  const nameLower = (item.name || "").toLowerCase();

  // 기본 와드(장신구 와드)는 별도 필터로 취급
  const basicWardIds = new Set(["3340", "3363", "3364"]);
  const wardstoneIds = new Set(["4638", "4643"]);

  // Wardstone 계열은 일반 아이템으로 취급 (트링켓 아님)
  if (wardstoneIds.has(item.id)) {
    return false;
  }

  if (basicWardIds.has(item.id)) {
    return true;
  }

  // 소비형/장신구
  if (tags.includes("Trinket") || tags.includes("Consumable")) {
    return true;
  }

  // 포션/영약 (영문)
  if (nameLower.includes("potion") || nameLower.includes("elixir")) {
    return true;
  }
  return false;
}

function isBoots(item: Item): boolean {
  const tags = item.tags || [];
  const nameLower = (item.name || "").toLowerCase();
  return tags.includes("Boots") || nameLower.includes("boots");
}

function getItemRole(item: Item): ItemRole | "all" {
  const tags = item.tags || [];
  const hasAD = tags.includes("AttackDamage");
  const hasAP = tags.includes("SpellDamage");
  const hasTankStat =
    tags.includes("Health") ||
    tags.includes("Armor") ||
    tags.includes("SpellBlock");
  const hasUtility =
    tags.includes("ManaRegen") ||
    tags.includes("HealthRegen") ||
    tags.includes("CooldownReduction");

  if (hasAP && hasUtility) return "support";
  if (hasTankStat && (hasAD || hasAP)) return "tank";
  if (hasAP) return "mage";
  if (hasAD && !hasTankStat) return "assassin";
  if (hasAD || hasTankStat) return "fighter";

  return "all";
}

function shouldShowPrice(item: Item): boolean {
  const total = item.priceTotal ?? 0;
  if (total <= 0) return false;
  if (item.purchasable === false) return false;
  if (item.inStore === false) return false;
  if (item.displayInItemSets === false) return false;
  return true;
}

function getItemStatLines(item: Item, lang: string): string[] {
  const contributions = (item.stats || []) as StatContribution[];
  if (contributions.length === 0) return [];

  const isKo = lang.startsWith("ko");

  const aggregated = new Map<
    StatKey,
    { value: number; isPercent: boolean }
  >();

  for (const contrib of contributions) {
    const def = STAT_DEFINITIONS[contrib.stat];
    if (!def) continue;

    const current = aggregated.get(contrib.stat) || {
      value: 0,
      isPercent: def.isPercent,
    };

    if (contrib.valueType === "percent") {
      current.value += contrib.value;
      current.isPercent = true;
    } else if (contrib.valueType === "flat") {
      current.value += contrib.value;
    } else {
      // perLevel / perBonus 등은 간단한 표시를 위해 일단 무시
      continue;
    }

    aggregated.set(contrib.stat, current);
  }

  const lines: string[] = [];
  for (const [statKey, { value, isPercent }] of aggregated.entries()) {
    if (!value) continue;
    const def = STAT_DEFINITIONS[statKey];
    const label = isKo ? def.label.ko : def.label.en;
    const display =
      isPercent && Math.abs(value) <= 1 ? Math.round(value * 100) : value;
    const valueText = isPercent ? `${display}%` : `${display}`;
    lines.push(`+ ${valueText} ${label}`);
  }

  return lines;
}

function getItemPriceLabel(item: Item, t: Translations): string {
  const total = item.priceTotal ?? 0;
  const base = item.price ?? 0;
  const hasFrom = Array.isArray(item.buildsFrom) && item.buildsFrom.length > 0;

  // gold.base(정규화된 price)가 0이면서 하위템이 있는 경우: 업그레이드 전용 아이템 → 구매 불가 표시
  if (base === 0 && hasFrom) {
    return t.encyclopedia.items.price.unavailable;
  }

  const hasPrice = total > 0;
  if (hasPrice || shouldShowPrice(item)) {
    return total.toLocaleString();
  }

  return t.encyclopedia.items.price.free;
}

interface ItemCellProps {
  item: Item;
  version: string;
  isSelected: boolean;
  onSelect: () => void;
}

const ItemCell: React.FC<ItemCellProps> = ({
  item,
  version,
  isSelected,
  onSelect,
}) => {
  const { t } = useTranslation();
  const priceLabel = getItemPriceLabel(item, t);
  const isUnavailableLabel =
    priceLabel === t.encyclopedia.items.price.unavailable;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex flex-col items-center gap-0 rounded-sm px-0.5 py-0 text-center transition-colors w-9 md:w-10 ${
        isSelected
          ? "bg-primary/20 border border-primary/60 shadow-sm"
          : "hover:bg-muted/60 border border-transparent"
      }`}
    >
      <img
        src={`https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${item.id}.png`}
        alt={getItemName(item, "ko_KR")}
        loading="lazy"
        decoding="async"
        width={32}
        height={32}
        className="w-7 h-7 md:w-8 md:h-8 aspect-square object-cover rounded-sm border border-border/60 bg-black/40 flex-shrink-0"
      />
      <span
        className={`${
          isUnavailableLabel ? "text-[8px] md:text-[9px]" : "text-[9px] md:text-[10px]"
        } text-amber-600 dark:text-amber-400 font-semibold whitespace-nowrap leading-tight`}
      >
        {priceLabel}
      </span>
      {/* 시각적으로는 보이지 않지만 DOM 상에 존재하는 텍스트로 남겨서
          브라우저 CMD+F 검색에 걸리도록 한다. (Tailwind의 sr-only 패턴) */}
      <span
        className="sr-only absolute"
      >
        {getItemName(item, "ko_KR")}
      </span>
    </button>
  );
};

export function ItemsTab({ version, lang }: ItemsTabProps) {
  const { t } = useTranslation();
  const deviceType = useDeviceType();
  const isMobile = deviceType === "mobile";

  // 전체 아이템 목록 (상점 비노출/구매 불가 아이템 포함)
  const [items, setItems] = useState<Item[] | null>(null);
  // 실제 상점(좌측 목록)에 노출할 아이템 목록
  const [storeItems, setStoreItems] = useState<Item[] | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [search, setSearch] = useState<string>("");
  const [filter, setFilter] = useState<ItemFilter>("all");
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getNormalizedItems(version, lang)
      .then((data) => {
        if (!cancelled) {
          // 전체 아이템은 그대로 보관해서 트리/업그레이드 계산에 사용
          setItems(data);

          // 상점에 노출할 수 있는 아이템만 필터링해서 좌측 리스트에 사용
          const valid = data.filter(shouldShowInStore);
          // 같은 이름의 아이템 중복 제거 (첫 번째 것만 유지)
          const seenNames = new Set<string>();
          const uniqueStoreItems = valid.filter((item) => {
            if (seenNames.has(item.name)) {
              return false;
            }
            seenNames.add(item.name);
            return true;
          });

          setStoreItems(uniqueStoreItems);

          if (!selectedItem && uniqueStoreItems.length > 0) {
            setSelectedItem(uniqueStoreItems[0]);
          }
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [version, lang]);

  const itemMap = useMemo(() => {
    if (!items) return new Map<string, Item>();
    // 트리/업그레이드 계산은 상점 비노출 아이템(예: 변신 단계, 퀘스트 전용)도 포함해서 처리
    return new Map<string, Item>(items.map((i) => [i.id, i]));
  }, [items]);

  const debouncedSearch = useDebouncedValue(search, isMobile ? 220 : 180);
  const termRaw = debouncedSearch.trim().toLowerCase();

  const normalizeForSearch = (value: string): string =>
    value
      .toLowerCase()
      // 한글(완성형), 초성(ㄱ-ㅎ), 숫자, 알파벳만 남기고 모두 제거
      .replace(/[^0-9a-z\uac00-\ud7a3ㄱ-ㅎ]/g, "");

  const getKoreanInitials = (value: string): string => {
    if (!value) return "";
    try {
      return Hangul.d(value, true)
        .map((chars: string[]) => chars[0])
        .join("");
    } catch {
      return "";
    }
  };

  const term = normalizeForSearch(termRaw);
  const pureInitialKey = termRaw.replace(/\s+/g, "");
  const isPureInitialSearch =
    pureInitialKey.length > 0 && /^[ㄱ-ㅎ]+$/.test(pureInitialKey);
  const termInitials = isPureInitialSearch ? pureInitialKey : "";

  const { itemsByTier, flatFiltered } = useMemo(() => {
    const empty = {
      itemsByTier: {
        starter: [] as Item[],
        basic: [] as Item[],
        epic: [] as Item[],
        legendary: [] as Item[],
      } as Record<ItemTier, Item[]>,
      flatFiltered: [] as Item[],
    };

    if (!storeItems) return empty;

    const searchMatches = (item: Item): boolean => {
      if (!term && !termInitials) return true;

      const name = getItemName(item, lang);
      const plaintext = "";
      const colloq = "";

      const nameNormalized = normalizeForSearch(name);
      const normalizedFields = [
        nameNormalized,
        normalizeForSearch(plaintext),
        normalizeForSearch(colloq.replace(/;/g, " ")),
      ];

      // 1) 일반 문자열 검색 (공백/특수문자 제거 기준)
      if (term && normalizedFields.some((field) => field.includes(term))) {
        return true;
      }

      // 2) 한글 초성 검색 (아이템 이름 기준) - 사용자가 순수 초성만 입력했을 때만 동작
      if (termInitials) {
        const nameInitials = getKoreanInitials(name);
        if (nameInitials.includes(termInitials)) {
          return true;
        }
      }

      // 3) 혼합 검색: 첫 글자는 초성, 나머지는 원문 그대로 입력한 경우 (예: "조개" → "ㅈ개")
      if (term && nameNormalized) {
        const nameInitials = getKoreanInitials(name);
        if (nameInitials) {
          const composite = nameInitials.charAt(0) + nameNormalized.slice(1);
          if (composite.includes(term)) {
            return true;
          }
        }
      }

      return false;
    };

    const resultByTier: Record<ItemTier, Item[]> = {
      starter: [],
      basic: [],
      epic: [],
      legendary: [],
    };
    const flat: Item[] = [];

    storeItems.forEach((item) => {
      if (!searchMatches(item)) return;

      // 필터: 역할군 / 장신구/와드/포션 / 신발
      if (filter === "trinket") {
        if (!isTrinketOrWardOrPotion(item)) return;
      } else if (filter === "boots") {
        if (!isBoots(item)) return;
      } else if (filter !== "all") {
        // 역할군 필터일 때는 장신구/와드/포션, 신발은 별도 탭에서 보도록 제외
        if (isTrinketOrWardOrPotion(item) || isBoots(item)) return;
        const role = getItemRole(item);
        if (role !== "all" && role !== filter) return;
      }

      const tier = getOfficialLikeItemTier(item);
      resultByTier[tier].push(item);
      flat.push(item);
    });

    (Object.keys(resultByTier) as ItemTier[]).forEach((tier) => {
      resultByTier[tier].sort(
        (a, b) => (a.priceTotal ?? 0) - (b.priceTotal ?? 0)
      );
    });

    flat.sort((a, b) => (a.priceTotal ?? 0) - (b.priceTotal ?? 0));

    return {
      itemsByTier: resultByTier,
      flatFiltered: flat,
    };
  }, [storeItems, term, termInitials, filter]);

  if (loading && !storeItems) {
    return (
      <div className="mt-4 text-sm text-muted-foreground">
        {t.championSelector.loading}
      </div>
    );
  }

  if (!storeItems || storeItems.length === 0) {
    return (
      <div className="mt-4 text-sm text-muted-foreground">
        {t.championSelector.emptyList}
      </div>
    );
  }

  // 선택한 아이템이 어떤 아이템으로 바로 업그레이드되는지만 보여주기 위해
  // 직계 상위 아이템(1단계 into)만 수집한다.
  const collectUpgradeItems = (root: Item): Item[] => {
    if (!root.buildsInto || root.buildsInto.length === 0) return [];

    const result: Item[] = [];

    root.buildsInto.forEach((id) => {
      const upgrade = itemMap.get(id);
      if (!upgrade) return;

      // 상위 템트리는 구매 불가(purchasable=false)거나 상점 비노출(inStore=false)이어도
      // 구조를 이해하기 위해 그대로 노출한다.
      // 다만 displayInItemSets=false 인 완전한 내부/퀘스트용 아이템만 제외한다.
      if (upgrade.displayInItemSets === false) return;

      result.push(upgrade);
    });

    // 같은 이름(표시용 아이템)이 여러 ID(모드/큐 변형 등)로 존재하는 경우가 있어
    // 빌드업 라인에서는 이름 기준으로 중복을 제거하되,
    // 동일 이름일 때는 ID가 더 작은 쪽을 우선 유지한다.
    const byName = new Map<string, Item>();
    for (const item of result) {
      const key = item.name || item.id;
      const existing = byName.get(key);
      if (!existing) {
        byName.set(key, item);
        continue;
      }

      const existingIdNum = Number.parseInt(existing.id, 10);
      const currentIdNum = Number.parseInt(item.id, 10);
      const bothNumeric =
        Number.isFinite(existingIdNum) && Number.isFinite(currentIdNum);

      const preferCurrent = bothNumeric
        ? currentIdNum < existingIdNum
        : item.id < existing.id;

      if (preferCurrent) {
        byName.set(key, item);
      }
    }

    const uniqueByName = Array.from(byName.values());

    uniqueByName.sort((a, b) => (a.priceTotal ?? 0) - (b.priceTotal ?? 0));
    return uniqueByName;
  };

  const buildItemTree = (
    root: Item,
    depth: number = 0,
    maxDepth: number = 6
  ): ItemTreeNode => {
    if (depth >= maxDepth) {
      return { item: root, children: [] };
    }

    const children: ItemTreeNode[] = [];

    if (root.buildsFrom && root.buildsFrom.length > 0) {
      root.buildsFrom.forEach((id) => {
        const childItem = itemMap.get(id);
        if (childItem) {
          children.push(buildItemTree(childItem, depth + 1, maxDepth));
        }
      });
    }

    return { item: root, children };
  };

  const filterLabel = (value: ItemFilter) => {
    return t.encyclopedia.items.filters[value];
  };

  const tierLabel = (tier: ItemTier) => {
    return t.encyclopedia.items.tiers[tier];
  };

  const detailContent = selectedItem && (
    <div className="flex flex-col gap-2 h-full min-h-0">
      {/* Builds into row */}
      <div className="space-y-0.5 text-[11px] pb-1 border-b border-border/60 flex-shrink-0">
        <div className="font-semibold">
          {t.encyclopedia.items.buildsIntoTitle}
        </div>
        <div className="overflow-x-auto pb-0.5">
          <div className="flex flex-nowrap gap-1 min-w-max">
            {collectUpgradeItems(selectedItem).length > 0 ? (
              collectUpgradeItems(selectedItem).map((upgrade) => (
                <ItemCell
                  key={upgrade.id}
                  item={upgrade}
                  version={version}
                  isSelected={selectedItem.id === upgrade.id}
                  onSelect={() => setSelectedItem(upgrade)}
                />
              ))
            ) : (
              <span className="text-[10px] text-muted-foreground">
                {t.encyclopedia.items.buildsIntoEmpty}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Item tree */}
      <div className="space-y-1 text-[11px] py-1 flex-shrink-0">
        <div className="font-semibold">
          {t.encyclopedia.items.treeTitle}
        </div>
        {(() => {
          const tree = buildItemTree(selectedItem);

          const renderTree = (node: ItemTreeNode) => {
            const hasChildren = node.children.length > 0;

            return (
              <div className="flex flex-col items-center gap-0">
                <ItemCell
                  item={node.item}
                  version={version}
                  isSelected={selectedItem.id === node.item.id}
                  onSelect={() => setSelectedItem(node.item)}
                />
                {hasChildren && (
                  <div className="mt-0 flex flex-col items-stretch">
                    {/* parent -> connector stem */}
                    <div className="relative flex justify-center">
                      <div className="h-1 w-[2px] bg-primary/60" />
                    </div>
                    {/* tree-style branch row */}
                    <div className="relative flex flex-nowrap items-start justify-center gap-y-0 pt-0">
                      {node.children.map((child, index) => {
                        const childrenCount = node.children.length;
                        const isFirst = index === 0;
                        const isLast = index === childrenCount - 1;
                        const horizontalClass = isFirst
                          ? "left-1/2 right-0"
                          : isLast
                          ? "left-0 right-1/2"
                          : "left-0 right-0";

                        return (
                          <div
                            key={`${child.item.id}-${index}`}
                            className="relative flex flex-col items-center gap-0 pt-0.5 px-1"
                          >
                            {/* horizontal segment (no overhang past first/last child).
                                For a single child, we skip the horizontal line so it becomes a straight stem. */}
                            {childrenCount > 1 && (
                              <div
                                className={`pointer-events-none absolute top-0 h-[2px] bg-primary/60 ${horizontalClass}`}
                              />
                            )}
                            {/* vertical from horizontal bar to each child (L-shaped cap) */}
                            <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 h-2 w-[2px] bg-primary/60" />
                            {renderTree(child)}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          };

          if (!tree.children.length && !tree.item.from?.length) {
            return (
              <span className="text-[10px] text-muted-foreground">
                {t.encyclopedia.items.treeEmpty}
              </span>
            );
          }

          return (
            <div className="pt-0">
              <div className="w-full rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 overflow-x-auto scrollbar-hide">
                <div className="min-w-max flex justify-center">
                  {renderTree(tree)}
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* 하단 설명 (스크롤 가능, ARPG 스타일 카드) */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="pt-2 pr-3">
          <div className="rounded-md border border-border/70 dark:border-neutral-700/80 bg-card text-foreground dark:bg-neutral-950 dark:text-slate-50 shadow-md px-3 py-2 text-[11px] space-y-2">
            {/* 헤더: 아이콘 + 이름 + 가격 */}
            <div className="flex items-start gap-2">
              <img
                src={`https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${selectedItem.id}.png`}
                alt={selectedItem.name}
                className="w-9 h-9 rounded-sm border border-border/60 bg-black/40 flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold truncate text-foreground dark:text-amber-200">
                    {selectedItem.name}
                  </div>
                  {shouldShowPrice(selectedItem) && (
                    <div className="text-[11px] text-amber-600 dark:text-amber-300 font-semibold whitespace-nowrap">
                      {getItemPriceLabel(selectedItem, t)}
                    </div>
                  )}
                </div>
                <div className="mt-0.5 flex items-center justify-between text-[10px] text-muted-foreground dark:text-slate-300">
                  <span>
                    {tierLabel(getOfficialLikeItemTier(selectedItem))}
                  </span>
                  {(() => {
                    const role = getItemRole(selectedItem);
                    if (role === "all") return null;
                    const label = filterLabel(role as ItemFilter);
                    return (
                      <span className="text-[10px] text-muted-foreground dark:text-slate-400">
                        {label}
                      </span>
                    );
                  })()}
                </div>
              </div>
            </div>

            <div className="h-px bg-neutral-700/80" />

            {getItemStatLines(selectedItem, lang).length > 0 && (
              <ul className="space-y-0.5 text-[11px] leading-snug">
                {getItemStatLines(selectedItem, lang).map((line) => (
                  <li key={line} className="text-primary">
                    {line}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );

  if (isMobile) {
    return (
      <div className="mt-4 space-y-3">
        <div className="flex flex-col gap-2">
          <div className="relative group">
            <Search
              className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none transition-colors group-focus-within:text-primary"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.encyclopedia.items.searchPlaceholder}
              className="h-9 pl-7 text-xs border-neutral-400 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
            />
          </div>
          <div className="flex gap-1 overflow-x-auto pb-1">
            {(
              [
                "all",
                "fighter",
                "mage",
                "assassin",
                "support",
                "tank",
                "trinket",
                "boots",
              ] as ItemFilter[]
            ).map((value) => (
                <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={`px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap border ${
                  filter === value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/60 text-muted-foreground border-border/60"
                }`}
              >
                {filterLabel(value)}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-md border bg-card/40">
          <div className="p-1 space-y-1">
            {(Object.keys(itemsByTier) as ItemTier[]).map((tier) => {
              const list = itemsByTier[tier];
              if (!list || list.length === 0) return null;
              return (
                <div key={tier} className="space-y-0.5">
                  <div className="text-[11px] font-semibold text-muted-foreground">
                    {tierLabel(tier)}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {list.map((item) => (
                      <ItemCell
                        key={item.id}
                        item={item}
                        version={version}
                        isSelected={selectedItem?.id === item.id}
                        onSelect={() => {
                          setSelectedItem(item);
                          setMobileDetailOpen(true);
                        }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <Dialog
          open={mobileDetailOpen && !!selectedItem}
          onOpenChange={(open) => {
            if (!open) {
              setMobileDetailOpen(false);
            }
          }}
        >
          <DialogContent className="w-[calc(100vw-32px)] max-w-lg max-h-[70vh] h-[70vh] p-0 rounded-xl overflow-hidden flex flex-col">
            <VisuallyHidden>
              <DialogTitle>{selectedItem?.name ?? "Item"}</DialogTitle>
              <DialogDescription>
                {selectedItem?.name ?? "Item"}
              </DialogDescription>
            </VisuallyHidden>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="p-4">{detailContent}</div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {(
            [
              "all",
              "fighter",
              "mage",
              "assassin",
              "support",
              "tank",
              "trinket",
              "boots",
            ] as ItemFilter[]
          ).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap border ${
                filter === value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted/60 text-muted-foreground border-border/60"
              }`}
            >
              {filterLabel(value)}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-52 md:w-64 group">
          <Search
            className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none transition-colors group-focus-within:text-primary"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.encyclopedia.items.searchPlaceholder}
            className="h-8 pl-8 text-xs md:text-sm w-full border-neutral-400 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
          />
        </div>
      </div>

      <div className="rounded-md border bg-card/40 md:h-[calc(100vh-12rem)] flex flex-col md:flex-row">
        {/* Items list */}
        <div className="md:flex-1 md:border-r border-border/60 flex flex-col min-w-0 min-h-0">
          <div className="px-3 py-2 border-b border-border/60 flex items-center justify-between flex-shrink-0">
            <div className="text-[11px] font-semibold text-muted-foreground">
              {t.encyclopedia.items.listTitle}
            </div>
          </div>
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-1 space-y-1">
              {(Object.keys(itemsByTier) as ItemTier[]).map((tier) => {
                const list = itemsByTier[tier];
                if (!list || list.length === 0) return null;
                return (
                  <div key={tier} className="space-y-0.5">
                    <div className="text-[11px] font-semibold text-muted-foreground">
                      {tierLabel(tier)}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {list.map((item) => (
                        <ItemCell
                          key={item.id}
                          item={item}
                          version={version}
                          isSelected={selectedItem?.id === item.id}
                        onSelect={() => setSelectedItem(item)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        {/* Detail panel */}
        <div className="md:w-[340px] hidden md:flex flex-col p-3 min-h-0">
          {selectedItem ? (
            detailContent
          ) : (
            <div className="text-xs text-muted-foreground h-full flex items-center justify-center text-center px-4">
              {t.encyclopedia.items.detailEmpty}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


