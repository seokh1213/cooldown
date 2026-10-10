import { GripVertical, X } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Champion } from "@/domain/game/types";
import { ChampionIcon } from "@/shared/ui/champion-icon";
import { Button } from "@/shared/ui/button";
import { TableHead } from "@/shared/ui/table";
import { cn } from "@/shared/lib/utils";
import type { SectionProps } from "./types";

interface SortableChampionHeaderProps extends Pick<SectionProps, "ddragonVersion" | "onRemoveChampion" | "onReorderChampions"> {
  champion: Champion;
  layout: "skills" | "stats";
  isLast: boolean;
}

const layouts = {
  skills: {
    head: "text-center p-2 text-xs font-semibold text-foreground w-[220px] lg:w-[240px] min-w-[200px] lg:min-w-[220px] select-none",
    content: "flex flex-row items-center justify-center gap-2 relative",
    handle: "-ml-1",
  },
  stats: {
    head: "text-center p-1.5 text-[11px] font-semibold text-foreground w-[100px] min-w-[100px] select-none",
    content: "flex flex-col items-center justify-center gap-1.5 relative",
    handle: "absolute -left-2 top-1/2 -translate-y-1/2",
  },
};

export function SortableChampionHeader({ champion, layout, isLast, ddragonVersion, onRemoveChampion, onReorderChampions }: SortableChampionHeaderProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: champion.id });
  const styles = layouts[layout];
  return (
    <TableHead ref={setNodeRef} style={{
      transform: transform ? CSS.Transform.toString(transform) : undefined,
      transition: isDragging ? transition : undefined,
      opacity: isDragging ? 0.5 : 1,
    }} className={cn(styles.head, !isLast && "border-r border-border/30", isDragging && "z-50")}>
      <div className={styles.content}>
        {onReorderChampions && (
          <button {...attributes} {...listeners}
            className={cn("cursor-grab active:cursor-grabbing p-1 opacity-60 hover:opacity-100 transition-opacity", styles.handle)}
            aria-label="Drag to reorder">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
        <div className="relative">
          <ChampionIcon id={champion.id} ddragonVersion={ddragonVersion} alt={champion.name} className="block w-8 h-8 rounded-full" />
          {onRemoveChampion && (
            <Button variant="ghost" size="icon"
              className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive/90 hover:bg-destructive text-white hover:scale-110 transition-transform shadow-md"
              onClick={event => { event.stopPropagation(); onRemoveChampion(champion.id); }}
              aria-label={`Remove ${champion.name}`}>
              <X className="h-2.5 w-2.5" />
            </Button>
          )}
        </div>
        {layout === "skills" ? (
          <div className="flex flex-col items-start">
            <div className="text-[11px] font-semibold leading-tight text-foreground">{champion.name}</div>
            <div className="text-[9px] text-muted-foreground leading-tight">{champion.title}</div>
          </div>
        ) : (
          <div className="text-[10px] font-semibold leading-tight text-center wrap-break-word text-foreground">{champion.name}</div>
        )}
      </div>
    </TableHead>
  );
}
