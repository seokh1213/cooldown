import React, { useState } from "react";
import { CHAMP_ICON_URL } from "@/services/api";
import { cn } from "@/lib/utils";
import { X, Plus, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import ChampionSelector from "../ChampionSelector";
import { getStatFields } from "./constants";
import { SectionProps } from "./types";
import { Champion } from "@/types";
import { useTranslation } from "@/i18n";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export function StatsSectionDesktop({
  champions,
  version,
  championList,
  onAddChampion,
  onRemoveChampion,
  onReorderChampions,
}: SectionProps) {
  const { t, lang } = useTranslation();
  const [showAddSlot, setShowAddSlot] = useState(false);
  const STAT_FIELDS = getStatFields(lang);

  // 드래그 앤 드롭 센서 설정
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // 드래그 시작 핸들러
  const handleDragStart = (_event: DragStartEvent) => {
    // 드래그 시작 처리
  };

  // 드래그 종료 핸들러
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id && onReorderChampions) {
      const oldIndex = champions.findIndex((c) => c.id === active.id);
      const newIndex = champions.findIndex((c) => c.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        onReorderChampions(oldIndex, newIndex);
      }
    }
  };

  // SortableCell 컴포넌트 (각 행의 셀용)
  const SortableCell = ({ champion, children, className }: { champion: Champion; children: React.ReactNode; className?: string }) => {
    const {
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: champion.id, disabled: true }); // disabled로 드래그 불가능하게 설정

    const cellTransform = transform ? CSS.Transform.toString(transform) : undefined;

    const style = {
      transform: cellTransform,
      transition: isDragging ? transition : undefined,
      opacity: isDragging ? 0.5 : 1,
    };

    return (
      <TableCell
        ref={setNodeRef}
        style={style}
        className={className}
      >
        {children}
      </TableCell>
    );
  };

  // SortableChampionHeader 컴포넌트
  const SortableChampionHeader = ({ champion, index }: { champion: Champion; index: number }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: champion.id });

    const columnTransform = transform ? CSS.Transform.toString(transform) : undefined;

    const style = {
      transform: columnTransform,
      transition: isDragging ? transition : undefined,
      opacity: isDragging ? 0.5 : 1,
    };

    return (
      <TableHead
        ref={setNodeRef}
        style={style}
        className={cn(
          "text-center p-2 text-xs font-semibold text-foreground w-[100px] min-w-[100px] select-none",
          index < champions.length - 1 && "border-r border-border/30",
          isDragging && "z-50"
        )}
      >
        <div className="flex flex-col items-center justify-center gap-1.5 relative">
          {onReorderChampions && (
            <button
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing p-1 opacity-60 hover:opacity-100 transition-opacity absolute -left-2 top-1/2 -translate-y-1/2"
              aria-label="Drag to reorder"
            >
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
          <div className="relative">
            <img
              src={CHAMP_ICON_URL(version, champion.id)}
              alt={champion.name}
              className="w-8 h-8 rounded-full"
            />
            {onRemoveChampion && (
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "absolute -top-1 -right-1 h-4 w-4 rounded-full",
                  "bg-destructive/90 hover:bg-destructive text-white",
                  "hover:scale-110 transition-transform",
                  "shadow-md"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveChampion(champion.id);
                }}
                aria-label={`Remove ${champion.name}`}
              >
                <X className="h-2.5 w-2.5" />
              </Button>
            )}
          </div>
          <div className="text-[10px] font-semibold leading-tight text-center break-words text-foreground">
            {champion.name}
          </div>
        </div>
      </TableHead>
    );
  };

  return (
    <div className="relative">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="border border-border/30 rounded-lg overflow-hidden">
          <Table className="border-collapse table-fixed w-auto">
            <TableHeader>
              <TableRow className="border-b border-border/30 select-none">
                <TableHead className="text-left p-2 pl-3 text-xs font-semibold text-foreground sticky left-0 bg-card z-20 w-[90px] min-w-[90px] border-r border-border/30 select-none" style={{ left: 0 }}>
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
                      index={idx}
                    />
                  ))}
                </SortableContext>
              {onAddChampion && (
                <TableHead className="text-center p-2 text-xs font-semibold text-foreground w-[100px] min-w-[100px] border-l border-border/30 select-none">
                  <Button
                    onClick={() => setShowAddSlot(true)}
                    variant="outline"
                    className="w-full flex flex-row items-center justify-center gap-2 p-1.5 h-auto border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30 group"
                  >
                    <div className="w-8 h-8 rounded-full bg-muted/30 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                      <Plus className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                    <div className="text-[10px] text-muted-foreground group-hover:text-primary transition-colors whitespace-nowrap">
                      추가
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
                  <TableCell className="p-2 pl-3 text-xs font-medium sticky left-0 bg-card z-20 border-r border-border/30 select-none" style={{ wordBreak: 'keep-all', left: 0 }}>
                    {field.label}
                  </TableCell>
                  {champions.map((champion, idx) => {
                    const value = champion.stats?.[field.key] ?? 0;
                    const isMax = value === maxValue && maxValue !== minValue;
                    const isMin = value === minValue && maxValue !== minValue;

                    return (
                      <SortableCell
                        key={champion.id}
                        champion={champion}
                        className={cn(
                          "p-2 text-xs text-center",
                          idx < champions.length - 1 && "border-r border-border/30",
                          isMax && "text-primary font-semibold",
                          isMin && "text-muted-foreground"
                        )}
                      >
                        {field.format(value)}
                      </SortableCell>
                    );
                  })}
                  {onAddChampion && (
                    <TableCell className="p-2 text-center border-l border-border/30">
                      <div className="w-full h-full min-h-[32px]" />
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

