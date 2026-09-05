import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import type { DataLocale, StaticDataSources } from "@/data/contracts/staticData";
import { getNormalizedItems } from "@/data/queries/gameDataQueries";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useDeviceType } from "@/hooks/useDeviceType";
import { useTranslation } from "@/i18n";
import type { ItemTier } from "@/lib/itemTierUtils";
import { ItemCell, ItemDetail } from "./ItemDetail";
import {
  groupItemsByTier,
  shouldShowInStore,
  type Item,
} from "./itemCatalogModel";

interface ItemsTabProps {
  patchVersion: string;
  sources: StaticDataSources;
  ddragonVersion: string;
  lang: DataLocale;
}

function uniqueStoreItems(items: readonly Item[]): Item[] {
  const names = new Set<string>();
  return items.filter(shouldShowInStore).filter((item) => {
    if (names.has(item.name)) return false;
    names.add(item.name);
    return true;
  });
}

function ItemSearch(props: {
  value: string;
  placeholder: string;
  mobile: boolean;
  onChange: (value: string) => void;
}) {
  const { value, placeholder, mobile, onChange } = props;
  return (
    <div className={`relative group ${mobile ? "" : "w-full sm:w-52 md:w-64"}`}>
      <Search className={`absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none group-focus-within:text-primary ${mobile ? "h-3.5 w-3.5" : "h-4 w-4"}`} />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={`${mobile ? "h-9 pl-7 text-xs" : "h-8 pl-8 text-xs md:text-sm"} border-neutral-400 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary`}
      />
    </div>
  );
}

function ItemGrid(props: {
  itemsByTier: Record<ItemTier, Item[]>;
  ddragonVersion: string;
  selectedId: string | undefined;
  tierLabel: (tier: ItemTier) => string;
  onSelect: (item: Item) => void;
}) {
  const { itemsByTier, ddragonVersion, selectedId, tierLabel, onSelect } = props;
  return (
    <div className="p-1 space-y-1">
      {(Object.keys(itemsByTier) as ItemTier[]).map((tier) => {
        const items = itemsByTier[tier];
        if (items.length === 0) return null;
        return (
          <div key={tier} className="space-y-0.5">
            <div className="text-[11px] font-semibold text-muted-foreground">{tierLabel(tier)}</div>
            <div className="flex flex-wrap gap-1">
              {items.map((item) => (
                <ItemCell
                  key={item.id}
                  item={item}
                  ddragonVersion={ddragonVersion}
                  isSelected={selectedId === item.id}
                  onSelect={() => onSelect(item)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ItemsTab({ patchVersion, sources, ddragonVersion, lang }: ItemsTabProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isMobile = useDeviceType() === "mobile";
  const [items, setItems] = useState<Item[] | null>(null);
  const [storeItems, setStoreItems] = useState<Item[] | null>(null);
  const [search, setSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(false);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getNormalizedItems({ patchVersion, sources }, lang)
      .then((data) => {
        if (cancelled) return;
        const store = uniqueStoreItems(data);
        setItems(data);
        setStoreItems(store);
        setSelectedItem((current) => current ?? store[0] ?? null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [patchVersion, sources, lang]);

  const itemMap = useMemo(
    () => new Map((items ?? []).map((item) => [item.id, item])),
    [items],
  );
  const debouncedSearch = useDebouncedValue(search, isMobile ? 220 : 180);
  const itemsByTier = useMemo(
    () => groupItemsByTier(storeItems, debouncedSearch),
    [storeItems, debouncedSearch],
  );
  const tierLabel = (tier: ItemTier) => t.encyclopedia.items.tiers[tier];
  const selectMobileItem = (item: Item) => {
    setSelectedItem(item);
    setMobileDetailOpen(true);
  };

  if (loading && !storeItems) {
    return <div className="mt-4 text-sm text-muted-foreground">{t.championSelector.loading}</div>;
  }
  if (!storeItems || storeItems.length === 0) {
    return <div className="mt-4 text-sm text-muted-foreground">{t.championSelector.emptyList}</div>;
  }
  const detail = selectedItem && (
    <ItemDetail
      item={selectedItem}
      itemMap={itemMap}
      ddragonVersion={ddragonVersion}
      locale={lang}
      onSelect={setSelectedItem}
      onUseInSimulation={() => navigate(`/simulation?i=${selectedItem.id}`)}
    />
  );

  if (isMobile) {
    return (
      <div className="mt-4 space-y-3">
        <ItemSearch value={search} placeholder={t.encyclopedia.items.searchPlaceholder} mobile onChange={setSearch} />
        <div className="rounded-md border bg-card/40">
          <ItemGrid itemsByTier={itemsByTier} ddragonVersion={ddragonVersion} selectedId={selectedItem?.id} tierLabel={tierLabel} onSelect={selectMobileItem} />
        </div>
        <Dialog open={mobileDetailOpen && selectedItem !== null} onOpenChange={setMobileDetailOpen}>
          <DialogContent className="w-[calc(100vw-32px)] max-w-lg h-[70vh] p-0 rounded-xl overflow-hidden flex flex-col">
            <VisuallyHidden>
              <DialogTitle>{selectedItem?.name ?? "Item"}</DialogTitle>
              <DialogDescription>{selectedItem?.name ?? "Item"}</DialogDescription>
            </VisuallyHidden>
            <div className="flex-1 min-h-0 overflow-y-auto"><div className="p-4">{detail}</div></div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <ItemSearch value={search} placeholder={t.encyclopedia.items.searchPlaceholder} mobile={false} onChange={setSearch} />
      <div className="rounded-md border bg-card/40 md:h-[calc(100vh-12rem)] flex flex-col md:flex-row">
        <div className="md:flex-1 md:border-r border-border/60 flex flex-col min-w-0 min-h-0">
          <div className="px-3 py-2 border-b border-border/60 text-[11px] font-semibold text-muted-foreground shrink-0">
            {t.encyclopedia.items.listTitle}
          </div>
          <ScrollArea className="flex-1 min-h-0">
            <ItemGrid itemsByTier={itemsByTier} ddragonVersion={ddragonVersion} selectedId={selectedItem?.id} tierLabel={tierLabel} onSelect={setSelectedItem} />
          </ScrollArea>
        </div>
        <div className="md:w-[340px] hidden md:flex flex-col p-3 min-h-0">
          {detail ?? <div className="text-xs text-muted-foreground h-full flex items-center justify-center text-center px-4">{t.encyclopedia.items.detailEmpty}</div>}
        </div>
      </div>
    </div>
  );
}
