import React, { useEffect, useMemo, useState } from "react";
import { getItems } from "@/services/api";
import type { Item } from "@/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/i18n";
import { useDeviceType } from "@/hooks/useDeviceType";
import { getOfficialLikeItemTier, type ItemTier } from "@/lib/itemTierUtils";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { VisuallyHidden } from "@/components/ui/visually-hidden";

interface ItemsTabProps {
  version: string;
  lang: string;
}

type ItemRole = "fighter" | "mage" | "assassin" | "support" | "tank";

type ItemFilter = "all" | ItemRole | "trinket" | "boots";

interface ItemTreeNode {
  item: Item;
  children: ItemTreeNode[];
}

function shouldShowInStore(item: Item): boolean {
  if (!item.maps || !item.maps["11"]) return false;

  const isTrinket = item.tags?.includes("Trinket");
  if (!isTrinket && item.gold && item.gold.purchasable === false) {
    return false;
  }

  if (item.inStore === false) return false;

  // CDragon 기준 상점 비노출 아이템은 항상 제외
  if (item.cdragon) {
    if (item.cdragon.inStore === false) return false;
    if (item.cdragon.displayInItemSets === false) return false;
  }

  return true;
}

function isTrinketOrWardOrPotion(item: Item): boolean {
  const tags = item.tags || [];
  const nameLower = item.name.toLowerCase();
  const plaintextLower = (item.plaintext || "").toLowerCase();

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

  // 포션/영약 (한글)
  if (langIsKoreanNameOrText(item)) return true;
  return false;
}

// 간단한 한국어 포션/영약 감지
function langIsKoreanNameOrText(item: Item): boolean {
  const name = item.name;
  const text = item.plaintext || "";
  return /포션|영약/.test(name + text);
}

function isBoots(item: Item): boolean {
  const tags = item.tags || [];
  const nameLower = item.name.toLowerCase();
  return tags.includes("Boots") || nameLower.includes("boots");
}

function getItemRole(item: Item): ItemRole | "all" {
  const tags = item.tags || [];
  const stats = item.stats || {};
  const statKeys = Object.keys(stats);

  const hasAD =
    tags.includes("AttackDamage") ||
    statKeys.some((k) => k.toLowerCase().includes("attackdamage"));
  const hasAP =
    tags.includes("SpellDamage") ||
    statKeys.some((k) => k.toLowerCase().includes("spelldamage"));
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
  if (!item.gold) return false;
  if (item.gold.total <= 0) return false;
  if (item.gold.purchasable === false) return false;
  if (item.inStore === false) return false;
  return true;
}

function getItemStatLines(item: Item, lang: string): string[] {
  const stats = item.stats || {};
  const lines: string[] = [];

  const push = (labelKo: string, labelEn: string, rawValue: number, isPercent = false) => {
    if (!rawValue) return;
    const label = lang === "ko_KR" ? labelKo : labelEn;
    let display = rawValue;
    if (isPercent && Math.abs(rawValue) <= 1) {
      display = Math.round(rawValue * 100);
    }
    const valueText = isPercent ? `${display}%` : `${display}`;
    lines.push(`+ ${valueText} ${label}`);
  };

  // DDragon stats는 키가 고정되어 있으므로 주요 스탯만 간단히 매핑
  if (typeof (stats as any).FlatPhysicalDamageMod === "number") {
    push("공격력", "Attack Damage", (stats as any).FlatPhysicalDamageMod);
  }
  if (typeof (stats as any).FlatMagicDamageMod === "number") {
    push("주문력", "Ability Power", (stats as any).FlatMagicDamageMod);
  }
  if (typeof (stats as any).FlatCritChanceMod === "number") {
    push("치명타 확률", "Critical Strike Chance", (stats as any).FlatCritChanceMod * 100, true);
  }
  if (typeof (stats as any).PercentAttackSpeedMod === "number") {
    push("공격 속도", "Attack Speed", (stats as any).PercentAttackSpeedMod, true);
  }
  if (typeof (stats as any).FlatHPPoolMod === "number") {
    push("체력", "Health", (stats as any).FlatHPPoolMod);
  }
  if (typeof (stats as any).FlatMPPoolMod === "number") {
    push("마나", "Mana", (stats as any).FlatMPPoolMod);
  }
  if (typeof (stats as any).FlatArmorMod === "number") {
    push("방어력", "Armor", (stats as any).FlatArmorMod);
  }
  if (typeof (stats as any).FlatSpellBlockMod === "number") {
    push("마법 저항력", "Magic Resist", (stats as any).FlatSpellBlockMod);
  }
  if (typeof (stats as any).PercentLifeStealMod === "number") {
    push("생명력 흡수", "Life Steal", (stats as any).PercentLifeStealMod, true);
  }
  if (typeof (stats as any).PercentSpellVampMod === "number") {
    push("주문 흡혈", "Spell Vamp", (stats as any).PercentSpellVampMod, true);
  }

  return lines;
}

function getDescriptionAfterStats(item: Item): string {
  let html = item.description || "";

  // mainText 래퍼 제거
  html = html.replace(/<\/?mainText>/gi, "");

  // 스탯 블록(<stats>...</stats>) 제거
  html = html.replace(/<stats>[\s\S]*?<\/stats>/gi, "");

  // 문자열 맨 앞의 <br>, 공백, &nbsp; 모두 제거 (없어질 때까지)
  html = html.replace(/^(?:\s|&nbsp;|<br\s*\/?>)+/gi, "");

  return html;
}

function getItemPriceLabel(item: Item, lang: string): string {
  const total = item.gold?.total ?? 0;
  const base = item.gold?.base ?? 0;
  const hasFrom = !!item.from && item.from.length > 0;

  // gold.base가 0이면서 하위템이 있는 경우: 업그레이드 전용 아이템 → 구매 불가 표시
  if (base === 0 && hasFrom) {
    return lang === "ko_KR" ? "구매 불가" : "Unavailable";
  }

  const hasPrice = total > 0;
  if (hasPrice || shouldShowPrice(item)) {
    return total.toLocaleString();
  }

  return lang === "ko_KR" ? "무료" : "Free";
}

interface ItemCellProps {
  item: Item;
  version: string;
  isSelected: boolean;
  onSelect: () => void;
  lang: string;
}

const ItemCell: React.FC<ItemCellProps> = ({
  item,
  version,
  isSelected,
  onSelect,
  lang,
}) => {
  const priceLabel = getItemPriceLabel(item, lang);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex flex-col items-center gap-0 rounded-sm px-0.5 py-0 text-center transition-colors min-w-7 md:min-w-8 ${
        isSelected
          ? "bg-primary/20 border border-primary/60 shadow-sm"
          : "hover:bg-muted/60 border border-transparent"
      }`}
    >
      <img
        src={`https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${item.id}.png`}
        alt={item.name}
        className="w-7 h-7 md:w-8 md:h-8 aspect-square object-cover rounded-sm border border-border/60 bg-black/40 flex-shrink-0"
      />
      <span className="text-[9px] md:text-[10px] text-amber-600 dark:text-amber-400 font-semibold whitespace-nowrap">
        {priceLabel}
      </span>
    </button>
  );
};

export function ItemsTab({ version, lang }: ItemsTabProps) {
  const { t } = useTranslation();
  const deviceType = useDeviceType();
  const isMobile = deviceType === "mobile";

  const [items, setItems] = useState<Item[] | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [search, setSearch] = useState<string>("");
  const [filter, setFilter] = useState<ItemFilter>("all");
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getItems(version, lang)
      .then((data) => {
        if (!cancelled) {
          const valid = data.filter(shouldShowInStore);
          // 같은 이름의 아이템 중복 제거 (첫 번째 것만 유지)
          const seenNames = new Set<string>();
          const uniqueItems = valid.filter((item) => {
            if (seenNames.has(item.name)) {
              return false;
            }
            seenNames.add(item.name);
            return true;
          });
          setItems(uniqueItems);
          if (!selectedItem && uniqueItems.length > 0) {
            setSelectedItem(uniqueItems[0]);
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
    return new Map<string, Item>(items.map((i) => [i.id, i]));
  }, [items]);

  const term = search.trim().toLowerCase();

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

    if (!items) return empty;

    const searchMatches = (item: Item): boolean => {
      if (!term) return true;
      const haystack = `${item.name} ${item.plaintext ?? ""}`.toLowerCase();
      return haystack.includes(term);
    };

    const resultByTier: Record<ItemTier, Item[]> = {
      starter: [],
      basic: [],
      epic: [],
      legendary: [],
    };
    const flat: Item[] = [];

    items.forEach((item) => {
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
        (a, b) => (a.gold?.total ?? 0) - (b.gold?.total ?? 0)
      );
    });

    flat.sort((a, b) => (a.gold?.total ?? 0) - (b.gold?.total ?? 0));

    return {
      itemsByTier: resultByTier,
      flatFiltered: flat,
    };
  }, [items, term, filter]);

  if (loading && !items) {
    return (
      <div className="mt-4 text-sm text-muted-foreground">
        {t.championSelector.loading}
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="mt-4 text-sm text-muted-foreground">
        {t.championSelector.emptyList}
      </div>
    );
  }

  const collectUpgradeItems = (root: Item): Item[] => {
    const result: Item[] = [];
    const visited = new Set<string>();
    const queue: string[] = root.into ? [...root.into] : [];

    while (queue.length > 0) {
      const id = queue.shift() as string;
      if (visited.has(id)) continue;
      visited.add(id);

      const upgrade = itemMap.get(id);
      if (!upgrade) continue;
      result.push(upgrade);

      if (upgrade.into && upgrade.into.length > 0) {
        queue.push(...upgrade.into);
      }
    }

    result.sort((a, b) => (a.gold?.total ?? 0) - (b.gold?.total ?? 0));
    return result;
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

    if (root.from && root.from.length > 0) {
      root.from.forEach((id) => {
        const childItem = itemMap.get(id);
        if (childItem) {
          children.push(buildItemTree(childItem, depth + 1, maxDepth));
        }
      });
    }

    return { item: root, children };
  };

  const filterLabel = (value: ItemFilter) => {
    if (lang === "ko_KR") {
      switch (value) {
        case "all":
          return "전체";
        case "fighter":
          return "전사";
        case "mage":
          return "마법사";
        case "assassin":
          return "암살자";
        case "support":
          return "서포터";
        case "tank":
          return "탱커";
        case "trinket":
          return "장신구/와드/포션";
        case "boots":
          return "신발";
      }
    }

    switch (value) {
      case "all":
        return "All";
      case "fighter":
        return "Fighter";
      case "mage":
        return "Mage";
      case "assassin":
        return "Assassin";
      case "support":
        return "Support";
      case "tank":
        return "Tank";
      case "trinket":
        return "Trinkets";
      case "boots":
        return "Boots";
    }
  };

  const tierLabel = (tier: ItemTier) => {
    if (lang === "ko_KR") {
      switch (tier) {
        case "legendary":
          return "전설 아이템";
        case "epic":
          return "서사급 아이템";
        case "basic":
          return "기본 아이템";
        case "starter":
          return "시작 아이템";
      }
    }
    switch (tier) {
      case "legendary":
        return "Legendary";
      case "epic":
        return "Epic";
      case "basic":
        return "Basic";
      case "starter":
        return "Starter";
    }
  };

  const descriptionHtml = selectedItem
    ? getDescriptionAfterStats(selectedItem)
    : "";
  const descriptionTextOnly = descriptionHtml
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;|\u00a0/gi, "")
    .trim();
  const showDescription = descriptionTextOnly.length > 0;

  const plainText = (selectedItem?.plaintext || "").trim();
  const showPlaintext = !showDescription && !!plainText;

  const detailContent = selectedItem && (
    <div className="flex flex-col gap-2 h-full min-h-0">
      {/* Builds into row */}
      <div className="space-y-0.5 text-[11px] pb-1 border-b border-border/60 flex-shrink-0">
        <div className="font-semibold">
          {lang === "ko_KR" ? "상위 아이템 (Builds into)" : "Builds into"}
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
                  lang={lang}
                />
              ))
            ) : (
              <span className="text-[10px] text-muted-foreground">
                {lang === "ko_KR" ? "상위 아이템 없음" : "No higher items"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Item tree */}
      <div className="space-y-1 text-[11px] py-1 flex-shrink-0">
        <div className="font-semibold">
          {lang === "ko_KR" ? "아이템 트리" : "Item Tree"}
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
                  lang={lang}
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
                {lang === "ko_KR" ? "구성 아이템 없음" : "No components"}
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
                      {getItemPriceLabel(selectedItem, lang)}
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

            {showPlaintext && (
              <p className="text-[11px] leading-snug text-foreground dark:text-slate-100">
                {plainText}
              </p>
            )}

            {showDescription && (
              <div className="text-[11px] leading-snug text-foreground dark:text-slate-100 [&_br]:block [&_li]:ml-4 [&_li]:list-disc [&_li]:text-[11px] [&_li]:leading-snug">
                <span
                  dangerouslySetInnerHTML={{
                    __html: descriptionHtml,
                  }}
                />
              </div>
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
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              lang === "ko_KR" ? "아이템 이름 검색..." : "Search item name..."
            }
            className="h-9 text-xs"
          />
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
                        lang={lang}
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
            <ScrollArea className="flex-1 min-h-0">
              <div className="p-4">{detailContent}</div>
            </ScrollArea>
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
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={
            lang === "ko_KR" ? "아이템 이름 검색..." : "Search item name..."
          }
          className="h-8 text-xs md:text-sm w-full sm:w-52 md:w-64"
        />
      </div>

      <div className="rounded-md border bg-card/40 md:h-[calc(100vh-12rem)] flex flex-col md:flex-row">
        {/* Items list */}
        <div className="md:flex-1 md:border-r border-border/60 flex flex-col min-w-0 min-h-0">
          <div className="px-3 py-2 border-b border-border/60 flex items-center justify-between flex-shrink-0">
            <div className="text-[11px] font-semibold text-muted-foreground">
              {lang === "ko_KR" ? "아이템" : "Items"}
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
                          lang={lang}
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
              {lang === "ko_KR"
                ? "왼쪽에서 아이템을 선택하면 여기에서 아이템 트리와 설명을 볼 수 있어요."
                : "Select an item on the left to see its tree and description here."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


