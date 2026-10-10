import React, { useState } from "react";
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
import {
  TooltipProvider,
} from "@/shared/ui/tooltip";
import ChampionSelector from "../selection/ChampionSelector";
import { SectionProps } from "./types";
import { SkillTooltip } from "./SkillTooltip";
import { SkillRankCooldown } from "./SkillRankCooldown";
import { buildSkillRows } from "./utils";
import { useTranslation } from "@/shared/i18n";
import { fill } from "@/shared/i18n/fill";
import { DndContext, closestCenter } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { useChampionReordering } from "./useChampionReordering";
import { SortableChampionHeader } from "./SortableChampionHeader";
import { SortableChampionCell } from "./SortableChampionCell";

export function SkillsSectionDesktop({
  champions,
  patchVersion,
  ddragonVersion,
  championList,
  onAddChampion,
  onRemoveChampion,
  onReorderChampions,
}: SectionProps) {
  const { t } = useTranslation();
  const [showAddSlot, setShowAddSlot] = useState(false);

  const { sensors, handleDragEnd } = useChampionReordering({ champions, onReorderChampions });
  const skillRows = React.useMemo(() => buildSkillRows(champions), [champions]);

  return (
    <TooltipProvider delayDuration={0} skipDelayDuration={150}>
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
                <TableHead className="text-left p-2 pl-3 text-xs font-semibold text-foreground sticky left-0 bg-card z-20 w-[80px] min-w-[80px] border-r border-border/30 select-none" style={{ left: 0 }}>
                  {t.common.level}
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
                      layout="skills"
                      ddragonVersion={ddragonVersion}
                      onRemoveChampion={onRemoveChampion}
                      onReorderChampions={onReorderChampions}
                    />
                  ))}
                </SortableContext>
              {onAddChampion && (
                <TableHead className="text-center p-2 text-xs font-semibold text-foreground w-[220px] lg:w-[240px] min-w-[200px] lg:min-w-[220px] border-l border-border/30 select-none">
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
            {/* Skills Header */}
            <TableRow className="border-b-2 border-border/30 bg-muted/30 select-none">
              <TableCell className="p-2 pl-3 text-xs font-medium sticky left-0 bg-card z-20 border-r border-border/30 select-none" style={{ left: 0 }}>
                {t.skills.label}
              </TableCell>
              {champions.map((champion, idx) => (
                <SortableChampionCell
                  key={champion.id}
                  champion={champion}
                  className={cn(
                    "p-2",
                    idx < champions.length - 1 && "border-r border-border/30"
                  )}
                >
                  <div className="flex justify-center gap-1.5">
                    {/* Passive */}
                    {champion.passive && (
                      <SkillTooltip
                        passive={champion.passive}
                        skillIdx={0}
                        patchVersion={patchVersion}
                        ddragonVersion={ddragonVersion}
                      />
                    )}
                    {/* Skills */}
                    {champion.spells?.map((skill, skillIdx) => (
                        <SkillTooltip
                          key={skill.id}
                          skill={skill}
                          skillIdx={skillIdx}
                          patchVersion={patchVersion}
                          ddragonVersion={ddragonVersion}
                        />
                    ))}
                  </div>
                </SortableChampionCell>
              ))}
              {onAddChampion && (
                <TableCell className="p-2 text-center border-l border-border/30">
                  <div className="w-full h-full min-h-[32px]" />
                </TableCell>
              )}
            </TableRow>

            {/* Skill Cooldowns by Level */}
            {skillRows.map((row, rowIdx) => (
              <TableRow
                key={row.level}
                className="border-b border-border/30 hover:bg-muted/30 transition-colors"
              >
                <TableCell
                  className={cn(
                    "p-2 pl-3 text-xs font-medium sticky left-0 bg-card z-20 border-r border-border/30 select-none",
                    rowIdx === skillRows.length - 1 && "rounded-bl-lg"
                  )}
                  style={{ left: 0 }}
                >
                  {fill(t.common.levelN, { n: row.level })}
                </TableCell>
                {row.skills.map((championSkills, champIdx) => {
                  const champion = champions[champIdx];
                  
                  return (
                    <SortableChampionCell
                      key={champion.id}
                      champion={champion}
                      className={cn(
                        "p-2",
                        champIdx < champions.length - 1 && "border-r border-border/30"
                      )}
                    >
                    {championSkills ? (
                      <div className="flex justify-center gap-1.5">
                        {/* Passive dummy slot */}
                        <div className="flex flex-col items-center min-w-[32px]">
                          <span className="text-xs text-muted-foreground">-</span>
                        </div>
                        {/* Skills */}
                        {championSkills.map((skillData, skillIdx) => (
                          <div
                            key={skillIdx}
                            className="flex flex-col items-center min-w-[32px]"
                          >
                            <span className="text-xs font-semibold">
                              <SkillRankCooldown skill={skillData.skill} rank={row.level} cooldown={skillData.cooldown} />
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </SortableChampionCell>
                  );
                })}
                {onAddChampion && (
                  <TableCell className="p-2 text-center border-l border-border/30">
                    <div className="w-full h-full min-h-[32px]" />
                  </TableCell>
                )}
              </TableRow>
            ))}
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
    </TooltipProvider>
  );
}
