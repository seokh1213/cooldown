import type { CSSProperties } from "react";
import type { Rune, RuneStatShard, RuneTree } from "@/types";
import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { VisuallyHidden } from "@/components/ui/visually-hidden";

export interface StatShardRow {
  label: string;
  perks: RuneStatShard[];
}

interface RuneDetailProps {
  rune: Rune;
  warning: string;
}

function runeIconUrl(icon: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/img/${icon}`;
}

function statShardIconUrl(iconPath: string): string {
  const prefix = "/lol-game-data/assets/v1";
  const trimmed = iconPath.startsWith(prefix)
    ? iconPath.slice(prefix.length)
    : iconPath;
  return `https://ddragon.leagueoflegends.com/cdn/img${trimmed}`;
}

function sanitizeStatShardDescription(perk: RuneStatShard): string {
  return (perk.shortDesc || perk.longDesc || "")
    .replace(/<font[^>]*>/gi, "")
    .replace(/<\/font>/gi, "");
}

function RuneDetail({ rune, warning }: RuneDetailProps) {
  const description = (rune.descriptionHtml || "")
    .replace(/@\{[^}]+\}@/g, ' <span class="text-destructive dark:text-red-400">?</span> ')
    .replace(/@[^@]+@/g, ' <span class="text-destructive dark:text-red-400">?</span> ');
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <img
          src={runeIconUrl(rune.icon)}
          alt={rune.name}
          loading="lazy"
          decoding="async"
          width={32}
          height={32}
          className="w-8 h-8 rounded-full border border-border/60 bg-transparent"
        />
        <span className="text-sm font-semibold">{rune.name}</span>
      </div>
      <div
        className="text-xs text-muted-foreground leading-relaxed"
        dangerouslySetInnerHTML={{ __html: description }}
      />
      <div className="text-xs text-muted-foreground/80 italic border-t pt-3 mt-3 flex items-center gap-1.5">
        <AlertTriangle className="w-2.5 h-2.5 text-yellow-600 dark:text-yellow-500 shrink-0" />
        <span>{warning}</span>
      </div>
    </div>
  );
}

interface RuneIconProps {
  rune: Rune;
  style: CSSProperties;
  isMobile: boolean;
  warning: string;
  onSelect: (rune: Rune) => void;
}

function RuneIcon(props: RuneIconProps) {
  const { rune, style, isMobile, warning, onSelect } = props;
  const button = (
    <button
      type="button"
      onClick={isMobile ? () => onSelect(rune) : undefined}
      className={`flex flex-col items-center gap-1 focus:outline-none min-w-0 ${
        isMobile ? "" : "cursor-help"
      }`}
      style={style}
    >
      <img
        src={runeIconUrl(rune.icon)}
        alt={rune.name}
        loading="lazy"
        decoding="async"
        width={40}
        height={40}
        className="w-10 h-10 rounded-full border border-border/60 bg-transparent shrink-0"
      />
      <span className="text-[10px] text-center leading-tight line-clamp-2 w-full">
        {rune.name}
      </span>
    </button>
  );
  if (isMobile) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="top" align="center" sideOffset={8} className="max-w-xs p-3">
        <RuneDetail rune={rune} warning={warning} />
      </TooltipContent>
    </Tooltip>
  );
}

function gridColumn(maxRunes: number, runeCount: number, index: number): string {
  if (runeCount === 1) return "1 / -1";
  if (maxRunes === 4 && runeCount === 2) return index === 0 ? "1" : "4";
  if (maxRunes === 4 && runeCount === 3) {
    return ["1", "2 / span 2", "4"][index];
  }
  return String(index + 1);
}

interface RuneTreeCardProps {
  tree: RuneTree;
  isMobile: boolean;
  warning: string;
  onSelect: (rune: Rune) => void;
}

function RuneTreeCard({ tree, isMobile, warning, onSelect }: RuneTreeCardProps) {
  const maxRunes = Math.max(...tree.slots.map((slot) => slot.runes.length));
  return (
    <Card className="p-4 flex flex-col gap-3 bg-background/60 border-border/70">
      <div className="flex items-center gap-3">
        <img
          src={runeIconUrl(tree.icon)}
          alt={tree.name}
          width={32}
          height={32}
          className="w-8 h-8 rounded-full border border-border/60 bg-transparent"
        />
        <div className="flex flex-col">
          <span className="text-sm font-semibold">{tree.name}</span>
          <span className="text-xs text-muted-foreground">{tree.key}</span>
        </div>
      </div>
      <div className="space-y-3">
        {tree.slots.map((slot, slotIndex) => (
          <div
            key={slotIndex}
            className="grid gap-y-2 gap-x-2 md:gap-x-4"
            style={{ gridTemplateColumns: `repeat(${maxRunes}, minmax(0, 1fr))` }}
          >
            {slot.runes.map((rune, index) => (
              <RuneIcon
                key={rune.id}
                rune={rune}
                isMobile={isMobile}
                warning={warning}
                onSelect={onSelect}
                style={{ gridColumn: gridColumn(maxRunes, slot.runes.length, index) }}
              />
            ))}
          </div>
        ))}
      </div>
    </Card>
  );
}

function StatShardCard({ rows, title, warning }: {
  rows: StatShardRow[];
  title: string;
  warning: string;
}) {
  if (rows.length === 0) return null;
  return (
    <Card className="p-4 flex flex-col gap-3 bg-background/60 border-border/70 md:col-span-2 xl:col-span-3">
      <div className="flex flex-col mb-1.5">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-xs text-muted-foreground">{warning}</span>
      </div>
      <div className="space-y-3 mt-1">
        {rows.map((row, index) => (
          <div key={`${row.label || "row"}-${index}`} className="flex flex-col gap-1">
            {row.label && (
              <div className="text-[11px] font-semibold text-muted-foreground mb-0.5">
                {row.label}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {row.perks.map((perk) => (
                <div key={perk.id} className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-background/80 px-2 py-1">
                  <img src={statShardIconUrl(perk.iconPath)} alt={perk.name} width={24} height={24} className="w-6 h-6 rounded-full border border-border/60 shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="text-[11px] font-semibold truncate">{perk.name}</span>
                    <span className="text-[10px] text-muted-foreground line-clamp-2" dangerouslySetInnerHTML={{ __html: sanitizeStatShardDescription(perk) }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function RuneCatalog(props: {
  trees: RuneTree[];
  statShardRows: StatShardRow[];
  selectedRune: Rune | null;
  isMobile: boolean;
  warning: string;
  statShardsTitle: string;
  onSelectRune: (rune: Rune | null) => void;
}) {
  const { trees, statShardRows, selectedRune, isMobile, warning, statShardsTitle, onSelectRune } = props;
  return (
    <TooltipProvider delayDuration={200}>
      <div className="mt-4">
        <ScrollArea className="rounded-md border bg-card/40">
          <div className="p-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {trees.map((tree) => (
              <RuneTreeCard key={tree.id} tree={tree} isMobile={isMobile} warning={warning} onSelect={onSelectRune} />
            ))}
            <StatShardCard rows={statShardRows} title={statShardsTitle} warning={warning} />
          </div>
        </ScrollArea>
        {isMobile && (
          <Dialog open={selectedRune !== null} onOpenChange={(open) => !open && onSelectRune(null)}>
            <DialogContent className="w-[calc(100vw-32px)] max-w-lg h-[70vh] p-0 rounded-xl overflow-hidden flex flex-col">
              <VisuallyHidden>
                <DialogTitle>{selectedRune?.name ?? "Rune"}</DialogTitle>
                <DialogDescription>{selectedRune?.name ?? "Rune"}</DialogDescription>
              </VisuallyHidden>
              <ScrollArea className="flex-1 min-h-0">
                <div className="p-4">{selectedRune && <RuneDetail rune={selectedRune} warning={warning} />}</div>
              </ScrollArea>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </TooltipProvider>
  );
}
