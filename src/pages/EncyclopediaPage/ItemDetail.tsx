import { AlertTriangle, Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SafeBlockHtml } from "@/components/ui/safe-html";
import type { DataLocale } from "@/data/contracts/staticData";
import { itemIconUrl } from "@/data/assets/riotAssetUrls";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslation } from "@/i18n";
import { getOfficialLikeItemTier } from "@/lib/itemTierUtils";
import {
  buildItemTree,
  collectUpgradeItems,
  getItemName,
  getItemPriceLabel,
  getItemStatLines,
  shouldShowPrice,
  type Item,
  type ItemTreeNode,
} from "./itemCatalogModel";

export function ItemCell(props: {
  item: Item;
  ddragonVersion: string;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { item, ddragonVersion, isSelected, onSelect } = props;
  const { t } = useTranslation();
  const priceLabel = getItemPriceLabel(item, t);
  const compactPrice = priceLabel === t.encyclopedia.items.price.unavailable;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex flex-col items-center gap-0 rounded-sm px-0.5 w-9 md:w-10 transition-colors ${
        isSelected
          ? "bg-primary/20 border border-primary/60 shadow-xs"
          : "hover:bg-muted/60 border border-transparent"
      }`}
    >
      <img
        src={itemIconUrl(ddragonVersion, item.id)}
        alt={getItemName(item)}
        loading="lazy"
        decoding="async"
        width={32}
        height={32}
        className="w-7 h-7 md:w-8 md:h-8 object-cover rounded-sm border border-border/60 bg-black/40 shrink-0"
      />
      <span className={`${compactPrice ? "text-[8px] md:text-[9px]" : "text-[9px] md:text-[10px]"} text-amber-600 dark:text-amber-400 font-semibold whitespace-nowrap leading-tight`}>
        {priceLabel}
      </span>
      <span className="sr-only absolute">{getItemName(item)}</span>
    </button>
  );
}

function ItemTreeBranch(props: {
  node: ItemTreeNode;
  selectedId: string;
  ddragonVersion: string;
  onSelect: (item: Item) => void;
}) {
  const { node, selectedId, ddragonVersion, onSelect } = props;
  return (
    <div className="flex flex-col items-center gap-0">
      <ItemCell
        item={node.item}
        ddragonVersion={ddragonVersion}
        isSelected={selectedId === node.item.id}
        onSelect={() => onSelect(node.item)}
      />
      {node.children.length > 0 && (
        <div className="flex flex-col items-stretch">
          <div className="flex justify-center"><div className="h-1 w-[2px] bg-primary/60" /></div>
          <div className="relative flex flex-nowrap items-start justify-center pt-0">
            {node.children.map((child, index) => {
              const last = node.children.length - 1;
              const horizontal = index === 0
                ? "left-1/2 right-0"
                : index === last
                  ? "left-0 right-1/2"
                  : "left-0 right-0";
              return (
                <div key={`${child.item.id}-${index}`} className="relative flex flex-col items-center pt-0.5 px-1">
                  {node.children.length > 1 && (
                    <div className={`pointer-events-none absolute top-0 h-[2px] bg-primary/60 ${horizontal}`} />
                  )}
                  <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 h-2 w-[2px] bg-primary/60" />
                  <ItemTreeBranch
                    node={child}
                    selectedId={selectedId}
                    ddragonVersion={ddragonVersion}
                    onSelect={onSelect}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function BuildTree(props: {
  item: Item;
  itemMap: ReadonlyMap<string, Item>;
  ddragonVersion: string;
  onSelect: (item: Item) => void;
}) {
  const { item, itemMap, ddragonVersion, onSelect } = props;
  const { t } = useTranslation();
  const tree = buildItemTree(item, itemMap);
  if (tree.children.length === 0 && !tree.item.buildsFrom?.length) {
    return <span className="text-[10px] text-muted-foreground">{t.encyclopedia.items.treeEmpty}</span>;
  }
  return (
    <div className="w-full rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 overflow-x-auto scrollbar-hide">
      <div className="min-w-max flex justify-center">
        <ItemTreeBranch node={tree} selectedId={item.id} ddragonVersion={ddragonVersion} onSelect={onSelect} />
      </div>
    </div>
  );
}

export function ItemDetail(props: {
  item: Item;
  itemMap: ReadonlyMap<string, Item>;
  ddragonVersion: string;
  locale: DataLocale;
  onSelect: (item: Item) => void;
  onUseInSimulation: () => void;
}) {
  const { item, itemMap, ddragonVersion, locale, onSelect } = props;
  const { t } = useTranslation();
  const upgrades = collectUpgradeItems(item, itemMap);
  const statLines = getItemStatLines(item, locale);
  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      <div className="space-y-0.5 text-[11px] pb-1 border-b border-border/60 shrink-0">
        <div className="font-semibold">{t.encyclopedia.items.buildsIntoTitle}</div>
        <div className="overflow-x-auto pb-0.5">
          <div className="flex flex-nowrap gap-1 min-w-max">
            {upgrades.length > 0 ? upgrades.map((upgrade) => (
              <ItemCell key={upgrade.id} item={upgrade} ddragonVersion={ddragonVersion} isSelected={item.id === upgrade.id} onSelect={() => onSelect(upgrade)} />
            )) : (
              <span className="text-[10px] text-muted-foreground">{t.encyclopedia.items.buildsIntoEmpty}</span>
            )}
          </div>
        </div>
      </div>
      <div className="space-y-1 text-[11px] py-1 shrink-0">
        <div className="font-semibold">{t.encyclopedia.items.treeTitle}</div>
        <BuildTree item={item} itemMap={itemMap} ddragonVersion={ddragonVersion} onSelect={onSelect} />
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="pt-2 pr-3">
          <div className="rounded-md border border-border/70 dark:border-neutral-700/80 bg-card dark:bg-neutral-950 shadow-md px-3 py-2 text-[11px] space-y-2">
            <div className="flex items-start gap-2">
              <img src={itemIconUrl(ddragonVersion, item.id)} alt={item.name} className="w-9 h-9 rounded-sm border border-border/60 bg-black/40 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold truncate dark:text-amber-200">{item.name}</div>
                  {shouldShowPrice(item) && <div className="text-[11px] text-amber-600 dark:text-amber-300 font-semibold whitespace-nowrap">{getItemPriceLabel(item, t)}</div>}
                </div>
                <div className="mt-0.5 text-[10px] text-muted-foreground dark:text-slate-300">
                  {t.encyclopedia.items.tiers[getOfficialLikeItemTier(item)]}
                </div>
              </div>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={props.onUseInSimulation} className="h-8 w-full gap-1.5 text-[10px]">
              <Calculator aria-hidden="true" className="size-3" />
              {t.pages.simulation.addItemToSimulation}
            </Button>
            <div className="h-px bg-neutral-700/80" />
            {statLines.length > 0 && (
              <ul className="space-y-0.5 text-[11px] leading-snug">
                {statLines.map((line) => <li key={line} className="text-primary">{line}</li>)}
              </ul>
            )}
            {item.description && (
              <>
                <SafeBlockHtml
                  className="mt-2 text-[11px] leading-snug"
                  html={item.description}
                />
                <div className="text-xs text-muted-foreground/80 italic border-t pt-3 mt-3 flex items-center gap-1.5">
                  <AlertTriangle className="w-2.5 h-2.5 text-yellow-600 dark:text-yellow-500 shrink-0" />
                  <span>{t.encyclopedia.items.warning}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
