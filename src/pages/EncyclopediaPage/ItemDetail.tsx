import type { DataLocale } from "@/data/contracts/staticData";
import { ItemIcon } from "@/components/ui/item-icon";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslation } from "@/i18n";
import { getOfficialLikeItemTier } from "@/lib/itemTierUtils";
import { useMemo } from "react";
import {
  buildItemTree,
  buildStatLabelIcons,
  collectUpgradeItems,
  getItemName,
  getItemPriceLabel,
  shouldShowPrice,
  type Item,
  type ItemTreeNode,
} from "./itemCatalogModel";
import { ItemEffects } from "./ItemEffects";

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
      <ItemIcon
        id={item.id}
        ddragonVersion={ddragonVersion}
        alt={getItemName(item)}
        className="block w-7 h-7 md:w-8 md:h-8 rounded-sm border border-border/60 bg-black/40 shrink-0"
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
}) {
  const { item, itemMap, ddragonVersion, onSelect } = props;
  const { t } = useTranslation();
  const upgrades = collectUpgradeItems(item, itemMap);
  /*
   * 능력치 줄에 붙일 글리프는 자료에서 뽑는다. 이름이 그 나라 말이라 언어마다
   * 손으로 적는 대신, 줄과 스탯이 하나씩인 아이템에서 짝을 읽는다.
   */
  const statIcons = useMemo(() => buildStatLabelIcons(itemMap.values()), [itemMap]);
  return (
    <ScrollArea className="h-full min-h-0">
      <div className="space-y-5 pr-3" data-testid="item-detail">
        <div className="flex items-center gap-3 border-b border-border/60 pb-4">
          <ItemIcon key={item.id} id={item.id} ddragonVersion={ddragonVersion} size={44} className="block size-11 shrink-0 rounded" />
          <div className="min-w-0 flex-1">
            <h2 className="break-words text-base font-semibold">{item.name}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t.encyclopedia.items.tiers[getOfficialLikeItemTier(item)]}</p>
          </div>
          {shouldShowPrice(item) && <span className="text-sm font-semibold text-amber-600 tabular-nums dark:text-amber-300">{getItemPriceLabel(item, t)}</span>}
        </div>
        <ItemEffects item={item} statIcons={statIcons} />
        <div className="space-y-3 border-t border-border/60 pt-4">
          <h3 className="text-xs font-medium text-muted-foreground">{t.encyclopedia.items.treeTitle}</h3>
          <BuildTree item={item} itemMap={itemMap} ddragonVersion={ddragonVersion} onSelect={onSelect} />
        </div>
        {upgrades.length > 0 && <div className="space-y-3 pb-4">
          <h3 className="text-xs font-medium text-muted-foreground">{t.encyclopedia.items.buildsIntoTitle}</h3>
          <div className="flex flex-wrap gap-2">{upgrades.map((upgrade) => <ItemCell key={upgrade.id} item={upgrade} ddragonVersion={ddragonVersion} isSelected={item.id === upgrade.id} onSelect={() => onSelect(upgrade)} />)}</div>
        </div>}
      </div>
    </ScrollArea>
  );
}
