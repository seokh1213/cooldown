import React, { useEffect, useMemo, useState } from "react";
import { getItems } from "@/services/api";
import type { Item } from "@/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
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

type ItemRole = "all" | "fighter" | "mage" | "assassin" | "support" | "tank";

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

function getItemRole(item: Item): Exclude<ItemRole, "all"> | "all" {
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
}

const ItemCell: React.FC<ItemCellProps> = ({
  item,
  version,
  isSelected,
  onSelect,
}) => {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex items-center gap-2 rounded-sm px-1.5 py-1 text-left transition-colors ${
        isSelected
          ? "bg-primary/20 border border-primary/60"
          : "hover:bg-muted/60 border border-transparent"
      }`}
    >
      <img
        src={`https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${item.id}.png`}
        alt={item.name}
        className="w-7 h-7 rounded-sm border border-border/60 bg-black/40 flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium truncate">{item.name}</span>
          {shouldShowPrice(item) && (
            <span className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold whitespace-nowrap">
              {item.gold.total.toLocaleString()}
            </span>
          )}
        </div>
        {item.plaintext && (
          <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
            {item.plaintext}
          </div>
        )}
      </div>
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
  const [roleFilter, setRoleFilter] = useState<ItemRole>("all");
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getItems(version, lang)
      .then((data) => {
        if (!cancelled) {
          const valid = data.filter(shouldShowInStore);
          setItems(valid);
          if (!selectedItem && valid.length > 0) {
            setSelectedItem(valid[0]);
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

  const { trinketItems, bootItems, mainItemsByTier } = useMemo(() => {
    const result = {
      trinketItems: [] as Item[],
      bootItems: [] as Item[],
      mainItemsByTier: {
        starter: [] as Item[],
        basic: [] as Item[],
        epic: [] as Item[],
        legendary: [] as Item[],
      },
    };

    if (!items) return result;

    const roleMatches = (item: Item): boolean => {
      if (roleFilter === "all") return true;
      const role = getItemRole(item);
      if (role === "all") return true;
      return role === roleFilter;
    };

    const searchMatches = (item: Item): boolean => {
      if (!term) return true;
      const haystack = `${item.name} ${item.plaintext ?? ""}`.toLowerCase();
      return haystack.includes(term);
    };

    items.forEach((item) => {
      if (!searchMatches(item)) return;

      if (isTrinketOrWardOrPotion(item)) {
        result.trinketItems.push(item);
        return;
      }

      if (isBoots(item)) {
        result.bootItems.push(item);
        return;
      }

      if (!roleMatches(item)) return;

      const tier = getItemTier(item);
      result.mainItemsByTier[tier].push(item);
    });

    (Object.keys(result.mainItemsByTier) as ItemTier[]).forEach((tier) => {
      result.mainItemsByTier[tier].sort(
        (a, b) => (a.gold?.total ?? 0) - (b.gold?.total ?? 0)
      );
    });

    result.trinketItems.sort(
      (a, b) => (a.gold?.total ?? 0) - (b.gold?.total ?? 0)
    );
    result.bootItems.sort(
      (a, b) => (a.gold?.total ?? 0) - (b.gold?.total ?? 0)
    );

    return result;
  }, [items, term, roleFilter]);

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

  const detailContent = selectedItem && (
    <div className="flex flex-col gap-3 h-full">
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

      <div className="space-y-2 text-[11px]">
        <div className="space-y-1">
          <div className="font-semibold text-[11px]">
            {lang === "ko_KR" ? "아이템 트리" : "Item Tree"}
          </div>
          <div className="space-y-1">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-muted-foreground">
                {lang === "ko_KR" ? "구성 아이템" : "Builds from"}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {selectedItem.from && selectedItem.from.length > 0 ? (
                  selectedItem.from.map((id) => {
                    const component = itemMap.get(id);
                    if (!component) return null;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setSelectedItem(component)}
                        className="flex items-center gap-1 rounded-sm px-1 py-0.5 bg-muted/60 hover:bg-muted text-[10px]"
                      >
                        <img
                          src={`https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${component.id}.png`}
                          alt={component.name}
                          className="w-5 h-5 rounded-sm border border-border/60 bg-black/40"
                        />
                        <span className="max-w-[90px] truncate">
                          {component.name}
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <span className="text-[10px] text-muted-foreground">
                    {lang === "ko_KR" ? "구성 아이템 없음" : "No components"}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-muted-foreground">
                {lang === "ko_KR" ? "업그레이드" : "Builds into"}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {selectedItem.into && selectedItem.into.length > 0 ? (
                  selectedItem.into.map((id) => {
                    const upgrade = itemMap.get(id);
                    if (!upgrade) return null;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setSelectedItem(upgrade)}
                        className="flex items-center gap-1 rounded-sm px-1 py-0.5 bg-muted/60 hover:bg-muted text-[10px]"
                      >
                        <img
                          src={`https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${upgrade.id}.png`}
                          alt={upgrade.name}
                          className="w-5 h-5 rounded-sm border border-border/60 bg-black/40"
                        />
                        <span className="max-w-[90px] truncate">
                          {upgrade.name}
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <span className="text-[10px] text-muted-foreground">
                    {lang === "ko_KR" ? "업그레이드 없음" : "No upgrades"}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0">
          <div className="font-semibold text-[11px] mb-1">
            {lang === "ko_KR" ? "설명" : "Description"}
          </div>
          <ScrollArea className="h-40 rounded-md border bg-background/60">
            <div className="p-2 text-[11px] leading-relaxed">
              <span
                dangerouslySetInnerHTML={{
                  __html: selectedItem.description,
                }}
              />
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );

  const roleLabel = (role: ItemRole) => {
    if (lang === "ko_KR") {
      switch (role) {
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
      }
    }

    switch (role) {
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
            {(["all", "fighter", "mage", "assassin", "support", "tank"] as ItemRole[]).map(
              (role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setRoleFilter(role)}
                  className={`px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap border ${
                    roleFilter === role
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/60 text-muted-foreground border-border/60"
                  }`}
                >
                  {roleLabel(role)}
                </button>
              )
            )}
          </div>
        </div>

        <ScrollArea className="rounded-md border bg-card/40 max-h-[70vh]">
          <div className="p-3 space-y-4">
            {trinketItems.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-muted-foreground">
                  {lang === "ko_KR"
                    ? "장신구 / 와드 / 포션"
                    : "Trinkets / Wards / Potions"}
                </div>
                <div className="grid grid-cols-1 gap-1.5">
                  {trinketItems.map((item) => (
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
            )}

            {bootItems.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-muted-foreground">
                  {lang === "ko_KR" ? "신발" : "Boots"}
                </div>
                <div className="grid grid-cols-1 gap-1.5">
                  {bootItems.map((item) => (
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
            )}

            {(Object.keys(mainItemsByTier) as ItemTier[]).map((tier) => {
              const list = mainItemsByTier[tier];
              if (!list || list.length === 0) return null;
              return (
                <div key={tier} className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-muted-foreground">
                    {tierLabel(tier)}
                  </div>
                  <div className="grid grid-cols-1 gap-1.5">
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

        <Dialog
          open={!!selectedItem}
          onOpenChange={(open) => !open && setSelectedItem(null)}
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
      <div className="flex items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={
            lang === "ko_KR" ? "아이템 이름 검색..." : "Search item name..."
          }
          className="h-8 text-xs md:text-sm max-w-xs"
        />
        <div className="flex gap-1">
          {(["all", "fighter", "mage", "assassin", "support", "tank"] as ItemRole[]).map(
            (role) => (
              <button
                key={role}
                type="button"
                onClick={() => setRoleFilter(role)}
                className={`px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap border ${
                  roleFilter === role
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/60 text-muted-foreground border-border/60"
                }`}
              >
                {roleLabel(role)}
              </button>
            )
          )}
        </div>
      </div>

      <div className="rounded-md border bg-card/40">
        <div className="flex h-[520px] lg:h-[580px]">
          {/* Trinkets / Wards / Potions */}
          <div className="w-[220px] border-r border-border/60 flex flex-col">
            <div className="px-3 py-2 border-b border-border/60">
              <div className="text-[11px] font-semibold text-muted-foreground">
                {lang === "ko_KR"
                  ? "장신구 / 와드 / 포션"
                  : "Trinkets / Wards / Potions"}
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1.5">
                {trinketItems.map((item) => (
                  <ItemCell
                    key={item.id}
                    item={item}
                    version={version}
                    isSelected={selectedItem?.id === item.id}
                    onSelect={() => setSelectedItem(item)}
                  />
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Boots */}
          <div className="w-[220px] border-r border-border/60 flex flex-col">
            <div className="px-3 py-2 border-b border-border/60">
              <div className="text-[11px] font-semibold text-muted-foreground">
                {lang === "ko_KR" ? "신발" : "Boots"}
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1.5">
                {bootItems.map((item) => (
                  <ItemCell
                    key={item.id}
                    item={item}
                    version={version}
                    isSelected={selectedItem?.id === item.id}
                    onSelect={() => setSelectedItem(item)}
                  />
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Main items by tier */}
          <div className="flex-1 border-r border-border/60 flex flex-col min-w-0">
            <div className="px-3 py-2 border-b border-border/60 flex items-center justify-between">
              <div className="text-[11px] font-semibold text-muted-foreground">
                {lang === "ko_KR" ? "아이템" : "Items"}
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-3">
                {(Object.keys(mainItemsByTier) as ItemTier[]).map((tier) => {
                  const list = mainItemsByTier[tier];
                  if (!list || list.length === 0) return null;
                  return (
                    <div key={tier} className="space-y-1.5">
                      <div className="text-[11px] font-semibold text-muted-foreground">
                        {tierLabel(tier)}
                      </div>
                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-1.5">
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
          <div className="w-[320px] hidden md:flex flex-col p-3">
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
    </div>
  );
}


