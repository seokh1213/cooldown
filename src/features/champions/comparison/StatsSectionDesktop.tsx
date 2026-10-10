import { useState } from "react";
import { cn } from "@/shared/lib/utils";
import { Plus } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import ChampionSelector from "../selection/ChampionSelector";
import { getStatFields } from "./constants";
import { ChampionStatValue } from "./ChampionStatValue";
import { SectionProps } from "./types";
import { useTranslation } from "@/shared/i18n";
import { DndContext, closestCenter } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { useChampionReordering } from "./useChampionReordering";
import { SortableChampionHeader } from "./SortableChampionHeader";
import { SortableChampionCell } from "./SortableChampionCell";

export function StatsSectionDesktop({
  champions,
  ddragonVersion,
  championList,
  onAddChampion,
  onRemoveChampion,
  onReorderChampions,
}: SectionProps) {
  const { t, lang } = useTranslation();
  const [showAddSlot, setShowAddSlot] = useState(false);
  const STAT_FIELDS = getStatFields(lang);

  const { sensors, handleDragEnd } = useChampionReordering({ champions, onReorderChampions });

  return (
    <div className="relative">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <div className="border border-border/30 rounded-lg overflow-hidden">
          <Table className="border-collapse table-fixed w-auto">
            <TableHeader>
              <TableRow className="border-b border-border/30 select-none">
                <TableHead className="text-left p-1.5 pl-2 text-[11px] font-semibold text-foreground sticky left-0 bg-card z-20 w-[90px] min-w-[90px] border-r border-border/30 select-none" style={{ left: 0 }}>
                  {t.stats.label}
                </TableHead>
                <SortableContext
                  items={champions.map((c) => c.id)}
                  strategy={horizontalListSortingStrategy}
                >
                  {champions.map((champion, idx) => (
                    <SortableChampionHeader
                      key={champion.id}
                      champion={champion}
                      isLast={idx === champions.length - 1}
                      layout="stats"
                      ddragonVersion={ddragonVersion}
                      onRemoveChampion={onRemoveChampion}
                      onReorderChampions={onReorderChampions}
                    />
                  ))}
                </SortableContext>
              {onAddChampion && (
                <TableHead className="text-center p-1.5 text-[11px] font-semibold text-foreground w-[100px] min-w-[100px] border-l border-border/30 select-none">
                  <Button
                    onClick={() => setShowAddSlot(true)}
                    variant="outline"
                    className="w-full flex flex-row items-center justify-center gap-2 p-1.5 h-auto border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30 group"
                  >
                    <div className="w-8 h-8 rounded-full bg-muted/30 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                      <Plus className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                    <div className="text-[10px] text-muted-foreground group-hover:text-primary transition-colors whitespace-nowrap">
                      {t.encyclopedia.add}
                    </div>
                  </Button>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {STAT_FIELDS.map((field) => {
              const values = champions.map((c) => c.stats?.[field.key] ?? 0);
              const maxValue = Math.max(...values);
              const minValue = Math.min(...values);

              return (
                <TableRow
                  key={field.key}
                  className="border-b border-border/30 hover:bg-muted/30 transition-colors"
                >
                  <TableCell className="p-1.5 pl-2 text-[11px] font-medium sticky left-0 bg-card z-20 border-r border-border/30 select-none" style={{ wordBreak: 'keep-all', left: 0 }}>
                    {field.label}
                  </TableCell>
                  {champions.map((champion, idx) => {
                    const value = champion.stats?.[field.key] ?? 0;
                    const isMax = value === maxValue && maxValue !== minValue;
                    const isMin = value === minValue && maxValue !== minValue;

                    return (
                      <SortableChampionCell
                        key={champion.id}
                        champion={champion}
                        className={cn(
                          "p-1.5 text-[11px] text-center",
                          idx < champions.length - 1 && "border-r border-border/30",
                          isMax && "text-primary font-semibold",
                          isMin && "text-muted-foreground"
                        )}
                      >
                        <ChampionStatValue field={field} stats={champion.stats} />
                      </SortableChampionCell>
                    );
                  })}
                  {onAddChampion && (
                    <TableCell className="p-1.5 text-center border-l border-border/30">
                      <div className="w-full h-full min-h-[24px]" />
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </div>
      </DndContext>
      {showAddSlot && onAddChampion && championList && (
        <ChampionSelector
          championList={championList}
          selectedChampions={champions}
          onSelect={(champion) => {
            onAddChampion(champion);
          }}
          onClose={() => setShowAddSlot(false)}
        />
      )}
    </div>
  );
}
