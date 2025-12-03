import React, { useEffect, useMemo, useState } from "react";
import { getItems } from "@/services/api";
import type { Item } from "@/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/i18n";
import { useDeviceType } from "@/hooks/useDeviceType";
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

type ItemTier = "starter" | "basic" | "epic" | "legendary";

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
  return true;
}

function isTrinketOrWardOrPotion(item: Item): boolean {
  const tags = item.tags || [];
  const nameLower = item.name.toLowerCase();
  const plaintextLower = (item.plaintext || "").toLowerCase();

  if (tags.includes("Trinket")) return true;
  if (tags.includes("Vision")) return true;
  if (tags.includes("Consumable")) return true;
  if (nameLower.includes("ward") || plaintextLower.includes("ward")) return true;
  if (nameLower.includes("potion") || plaintextLower.includes("potion")) {
    return true;
  }
  if (langIsKoreanNameOrText(item)) return true;
  return false;
}

// 간단한 한국어 포션/와드 감지 (포션, 와드, 충전형 등)
function langIsKoreanNameOrText(item: Item): boolean {
  const name = item.name;
  const text = item.plaintext || "";
  return /포션|와드|장신구|와딩|소환사 주문/.test(name + text);
}

function isBoots(item: Item): boolean {
  const tags = item.tags || [];
  const nameLower = item.name.toLowerCase();
  return tags.includes("Boots") || nameLower.includes("boots");
}

function getItemTier(item: Item): ItemTier {
  const total = item.gold?.total ?? 0;
  const hasFrom = !!item.from && item.from.length > 0;
  const hasInto = !!item.into && item.into.length > 0;
  const tags = item.tags || [];

  if (!hasFrom && total <= 500) {
    return "starter";
  }

  if (!hasFrom && total <= 1300) {
    return "basic";
  }

  if (tags.includes("Mythic") || total >= 2800) {
    return "legendary";
  }

  return "epic";
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
  const total = item.gold?.total ?? 0;
  const hasPrice = total > 0;
  const priceLabel =
    hasPrice || shouldShowPrice(item)
      ? total.toLocaleString()
      : lang === "ko_KR"
      ? "무료"
      : "Free";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex flex-col items-center gap-0.5 rounded-sm px-1 py-1 text-center transition-colors w-14 md:w-16 ${
        isSelected
          ? "bg-primary/20 border border-primary/60 shadow-sm"
          : "hover:bg-muted/60 border border-transparent"
      }`}
    >
      <img
        src={`https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${item.id}.png`}
        alt={item.name}
        className="w-8 h-8 md:w-9 md:h-9 rounded-sm border border-border/60 bg-black/40 flex-shrink-0"
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

  const { itemsByTier } = useMemo(() => {
    const result = {
      itemsByTier: {
        starter: [] as Item[],
        basic: [] as Item[],
        epic: [] as Item[],
        legendary: [] as Item[],
      },
    };

    if (!items) return result;

    const searchMatches = (item: Item): boolean => {
      if (!term) return true;
      const haystack = `${item.name} ${item.plaintext ?? ""}`.toLowerCase();
      return haystack.includes(term);
    };

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

      const tier = getItemTier(item);
      result.itemsByTier[tier].push(item);
    });

    (Object.keys(result.itemsByTier) as ItemTier[]).forEach((tier) => {
      result.itemsByTier[tier].sort(
        (a, b) => (a.gold?.total ?? 0) - (b.gold?.total ?? 0)
      );
    });

    return result;
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

  const detailContent = selectedItem && (
    <div className="flex flex-col gap-3 h-full min-h-0">
      {/* Builds into row */}
      <div className="space-y-1 text-[11px] pb-2 border-b border-border/60 flex-shrink-0">
        <div className="font-semibold">
          {lang === "ko_KR" ? "상위 아이템 (Builds into)" : "Builds into"}
        </div>
        <div className="overflow-x-auto pb-1">
          <div className="flex flex-nowrap gap-1.5 min-w-max">
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
      <div className="space-y-1.5 text-[11px] py-1.5 border-b border-border/60 flex-shrink-0">
        <div className="font-semibold">
          {lang === "ko_KR" ? "아이템 트리" : "Item Tree"}
        </div>
        {(() => {
          const tree = buildItemTree(selectedItem);

          const renderTree = (node: ItemTreeNode): JSX.Element => {
            const hasChildren = node.children.length > 0;

            return (
              <div className="flex flex-col items-center gap-1">
                <ItemCell
                  item={node.item}
                  version={version}
                  isSelected={selectedItem.id === node.item.id}
                  onSelect={() => setSelectedItem(node.item)}
                  lang={lang}
                />
                {hasChildren && (
                  <>
                    <svg
                      className="h-5 w-12 text-cyan-500 dark:text-cyan-400"
                      viewBox="0 0 48 20"
                      aria-hidden="true"
                    >
                      <path
                        d="M24 0 L24 10"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                      />
                      <path
                        d="M6 10 L42 10"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="flex flex-wrap items-start justify-center gap-2">
                      {node.children.map((child, index) => (
                        <div
                          key={`${child.item.id}-${index}`}
                          className="flex flex-col items-center gap-1"
                        >
                          {renderTree(child)}
                        </div>
                      ))}
                    </div>
                  </>
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

          return <div className="pt-1 flex justify-center">{renderTree(tree)}</div>;
        })()}
      </div>

      {/* 하단 설명 (스크롤 가능) */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-2 pt-2 pr-4">
          <div className="flex items-start gap-3">
            <img
              src={`https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${selectedItem.id}.png`}
              alt={selectedItem.name}
              className="w-10 h-10 rounded-sm border border-border/60 bg-black/40 flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold truncate">
                  {selectedItem.name}
                </div>
                {shouldShowPrice(selectedItem) && (
                  <div className="text-xs text-amber-600 dark:text-amber-400 font-semibold whitespace-nowrap">
                    {selectedItem.gold.total.toLocaleString()}
                  </div>
                )}
              </div>
              {selectedItem.plaintext && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  {selectedItem.plaintext}
                </div>
              )}
            </div>
          </div>

          <div className="font-semibold text-[11px]">
            {lang === "ko_KR" ? "설명" : "Description"}
          </div>
          <div className="text-[11px] leading-relaxed">
            <span
              dangerouslySetInnerHTML={{
                __html: selectedItem.description,
              }}
            />
          </div>
        </div>
      </ScrollArea>
    </div>
  );

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
        case "starter":
          return "시작 아이템";
        case "basic":
          return "기본 아이템";
        case "epic":
          return "서사급 아이템";
        case "legendary":
          return "전설 아이템";
      }
    }
    switch (tier) {
      case "starter":
        return "Starter";
      case "basic":
        return "Basic";
      case "epic":
        return "Epic";
      case "legendary":
        return "Legendary";
    }
  };

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
          <div className="p-2 space-y-2">
            {(Object.keys(itemsByTier) as ItemTier[]).map((tier) => {
              const list = itemsByTier[tier];
              if (!list || list.length === 0) return null;
              return (
                <div key={tier} className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-muted-foreground">
                    {tierLabel(tier)}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
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
            <div className="p-1.5 space-y-1.5">
              {(Object.keys(itemsByTier) as ItemTier[]).map((tier) => {
                const list = itemsByTier[tier];
                if (!list || list.length === 0) return null;
                return (
                  <div key={tier} className="space-y-1">
                    <div className="text-[11px] font-semibold text-muted-foreground">
                      {tierLabel(tier)}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
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


