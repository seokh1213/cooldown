import type { NormalizedItem } from "@/types/combatNormalized";
import { itemIconUrl } from "@/data/assets/riotAssetUrls";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslation } from "@/i18n";

export function SimulationItemPicker(props: {
  open: boolean;
  activeSlotIndex: number | null;
  selectedItemId: string | null;
  items: readonly NormalizedItem[];
  ddragonVersion: string;
  onOpenChange: (open: boolean) => void;
  onSelect: (itemId: string | null) => void;
}) {
  const {
    open,
    activeSlotIndex,
    selectedItemId,
    items,
    ddragonVersion,
    onOpenChange,
    onSelect,
  } = props;
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-base">{t.pages.simulation.itemModalTitle}</DialogTitle>
          <DialogDescription className="text-xs">{t.pages.simulation.itemModalDescription}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="text-[11px] text-muted-foreground">{t.pages.simulation.itemModalHint}</div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => onSelect(null)}
              disabled={activeSlotIndex === null}
            >
              {t.pages.simulation.clearItemSlot}
            </Button>
          </div>
          <ScrollArea className="h-80 rounded-md border bg-background/60">
            <div className="p-2 space-y-1">
              {items.slice(0, 300).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className={`w-full flex items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] transition-colors ${
                    selectedItemId === item.id
                      ? "bg-primary/10 text-primary border border-primary/40"
                      : "hover:bg-muted/60 text-foreground/80"
                  }`}
                >
                  <img
                    src={itemIconUrl(ddragonVersion, item.id)}
                    alt={item.name || item.id}
                    className="w-6 h-6 rounded-sm border border-border/60 bg-black/40"
                  />
                  <span className="flex-1 truncate">{item.name || item.id}</span>
                  {(item.priceTotal ?? 0) > 0 && (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                      {item.priceTotal.toLocaleString()}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
