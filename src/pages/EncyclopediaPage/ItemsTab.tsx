import { useEffect, useMemo, useState } from "react";
import { getItems } from "@/services/api";
import type { Item } from "@/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useTranslation } from "@/i18n";

interface ItemsTabProps {
  version: string;
  lang: string;
}

type ItemFilter = "all" | "mythic" | "legendary" | "boots";

export function ItemsTab({ version, lang }: ItemsTabProps) {
  const { t } = useTranslation();
  const [items, setItems] = useState<Item[] | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [search, setSearch] = useState<string>("");
  const [filter, setFilter] = useState<ItemFilter>("all");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getItems(version, lang)
      .then((data) => {
        if (!cancelled) {
          setItems(data);
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

  const filteredItems = useMemo(() => {
    if (!items) return [];

    const term = search.trim().toLowerCase();

    return items
      .filter((item) => {
        // 소환사 협곡(맵 ID 11)에서 사용 가능한 아이템만 노출
        // maps 정보가 없거나 11이 false/undefined인 경우 모두 제외
        if (!item.maps || !item.maps["11"]) {
          return false;
        }

        // 일반 유저가 "상점에서 직접 구매"할 수 없는 특수/내부 아이템은 숨김
        // 단, 장신구(Trinket)는 0원이어도 구매/교체가 가능하므로 항상 허용
        const isTrinket = item.tags?.includes("Trinket");
        if (!isTrinket && item.gold && item.gold.purchasable === false) {
          return false;
        }

        if (filter === "boots" && !item.tags?.includes("Boots")) {
          return false;
        }

        // Data Dragon 에는 신화/전설 플래그가 명확히 없으므로 태그/골드 기준 간단 필터
        if (filter === "mythic") {
          // 대략적인 기준: 높은 총 가격 + Legendary/Masterwork 태그
          if (
            !item.tags?.some((t) =>
              ["Mythic", "Legendary"].includes(t)
            ) &&
            item.gold.total < 3000
          ) {
            return false;
          }
        }

        if (filter === "legendary") {
          if (
            !item.tags?.includes("Legendary") &&
            item.gold.total < 2500
          ) {
            return false;
          }
        }

        if (!term) return true;

        const haystack = `${item.name} ${item.plaintext ?? ""}`.toLowerCase();
        return haystack.includes(term);
      })
      .sort((a, b) => a.gold.total - b.gold.total);
  }, [items, search, filter]);

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

  const shouldShowPrice = (item: Item): boolean => {
    if (!item.gold) return false;
    if (item.gold.total <= 0) return false;
    if (item.gold.purchasable === false) return false;
    if (item.inStore === false) return false;
    return true;
  };

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-col md:flex-row gap-2 md:items-center">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={
            lang === "ko_KR" ? "아이템 이름 검색..." : "Search item name..."
          }
          className="h-8 text-xs md:text-sm"
        />
        <Select
          value={filter}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
            setFilter(e.target.value as ItemFilter)
          }
          className="h-8 w-full md:w-40 text-xs md:text-sm"
        >
          <option value="all">
            {lang === "ko_KR" ? "전체" : "All"}
          </option>
          <option value="mythic">
            {lang === "ko_KR" ? "신화/고가 아이템" : "Mythic / expensive"}
          </option>
          <option value="legendary">
            {lang === "ko_KR" ? "전설 아이템" : "Legendary"}
          </option>
          <option value="boots">
            {lang === "ko_KR" ? "신발" : "Boots"}
          </option>
        </Select>
      </div>

      <ScrollArea className="rounded-md border bg-card/40">
        <div className="p-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filteredItems.map((item) => (
            <Card
              key={item.id}
              className="p-3 flex flex-col gap-2 bg-background/60 border-border/70"
            >
              <div className="flex items-start gap-3">
                <img
                  src={`https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${item.id}.png`}
                  alt={item.name}
                  className="w-9 h-9 rounded-sm border border-border/60 bg-black/40"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold truncate">
                      {item.name}
                    </div>
                    {shouldShowPrice(item) && (
                      <div className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold whitespace-nowrap">
                        {item.gold.total.toLocaleString()}
                      </div>
                    )}
                  </div>
                  {item.plaintext && (
                    <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                      {item.plaintext}
                    </div>
                  )}
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground mt-1 line-clamp-4">
                <span
                  dangerouslySetInnerHTML={{
                    __html: item.description,
                  }}
                />
              </div>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}


