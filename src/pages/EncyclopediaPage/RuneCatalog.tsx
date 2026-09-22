import type { CSSProperties } from "react";
import type { Rune, RuneStatShard, RuneTree } from "@/types";
import { runeIconKey, runeIconUrl } from "@/data/assets/riotAssetUrls";
import { SpriteIcon, useSpriteSheet, type SheetState } from "@/components/ui/sprite-icon";
import { createContext, useContext, useMemo } from "react";
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
import { SafeBlockHtml, SafeInlineHtml } from "@/components/ui/safe-html";

export interface StatShardRow {
  label: string;
  perks: RuneStatShard[];
}

interface RuneDetailProps {
  rune: Rune;
  warning: string;
}

// 같은 함수를 여기에 한 벌 더 두고 있었다. 룬과 스탯 파편이 경로 꼴이 달라 둘로
// 갈라 두었는데, 공용 `runeIconUrl` 이 두 꼴을 다 받는다. 한 자리만 남겼고, 지금은
// `RuneSprite` 가 두 꼴을 함께 받으므로 이름도 따로 두지 않는다.

/*
 * 룬 아이콘 스프라이트.
 *
 * 룬 화면은 아이콘 일흔여섯 장을 한꺼번에 그린다. 낱장으로 받으면 그만큼 요청이
 * 날아가는데, 재 보니 이 화면이 셋 중 가장 무거웠다(25장에 854KB). 한 장으로 붙여
 * 137KB 한 건이 되었다.
 *
 * 그리는 자리가 넷으로 흩어져 있어 맥락으로 내려보낸다. 없으면 낱장으로 돌아간다.
 */
const RuneSpriteContext = createContext<SheetState | null>(null);

function RuneSprite({ iconPath, size, alt, className }: { iconPath: string; size: number; alt: string; className: string }) {
  const sheet = useContext(RuneSpriteContext);
  const id = runeIconKey(iconPath);
  if (sheet?.index.has(id)) {
    return <SpriteIcon state={sheet} id={id} size={size} alt={alt} className={`block bg-cover ${className}`} />;
  }
  return <img src={runeIconUrl(iconPath)} alt={alt} width={size} height={size} loading="lazy" className={className} />;
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
      <SafeBlockHtml
        className="text-xs text-muted-foreground leading-relaxed"
        html={description}
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
      className={`flex flex-col items-center gap-1 focus:outline-hidden min-w-0 ${
        isMobile ? "" : "cursor-help"
      }`}
      style={style}
    >
      <RuneSprite
        iconPath={rune.icon}
        alt={rune.name}
        size={40}
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
        <RuneSprite
          iconPath={tree.icon}
          alt={tree.name}
          size={32}
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
                  <RuneSprite iconPath={perk.iconPath} alt={perk.name} size={24} className="w-6 h-6 rounded-full border border-border/60 shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="text-[11px] font-semibold truncate">{perk.name}</span>
                    <SafeInlineHtml
                      className="text-[10px] text-muted-foreground line-clamp-2"
                      html={perk.shortDesc || perk.longDesc || ""}
                    />
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
  /*
   * 시트 칸 자리는 이름 차례로 센다. 생성기도 같은 차례로 붙인다 — 룬과 파편이
   * 자료에서 서로 다른 자리에 있어 실린 차례를 화면이 되살리기 어렵기 때문이다.
   */
  const runeIds = useMemo(() => {
    const keys = new Set<string>();
    for (const tree of trees) {
      keys.add(runeIconKey(tree.icon));
      for (const slot of tree.slots) for (const rune of slot.runes) keys.add(runeIconKey(rune.icon));
    }
    for (const row of statShardRows) for (const perk of row.perks) keys.add(runeIconKey(perk.iconPath));
    return [...keys].sort();
  }, [trees, statShardRows]);
  const sprite = useSpriteSheet("rune", "", runeIds);
  return (
    <RuneSpriteContext.Provider value={sprite}>
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
    </RuneSpriteContext.Provider>
  );
}
