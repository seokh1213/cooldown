import React, { useState } from "react";
import { Champion } from "@/types";
import { CHAMP_ICON_URL } from "@/services/api";
import { getIntegratedSpellDataForChampions, SpellData } from "@/services/spellDataService";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";
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
import {
  TooltipProvider,
} from "@/components/ui/tooltip";
import ChampionSelector from "../ChampionSelector";
import { SectionProps } from "./types";
import { SkillTooltip } from "./SkillTooltip";
import { getCooldownForLevel } from "./utils";
import { useTranslation } from "@/i18n";
import { ChampionSpell } from "@/types";
import { useVersionContext } from "@/context/VersionContext";
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

export function SkillsSectionDesktop({
  champions,
  version,
  championList,
  onAddChampion,
  onRemoveChampion,
  onReorderChampions,
  vsMode: _vsMode,
}: SectionProps) {
  const { t } = useTranslation();
  const { cdragonVersion, setCDragonVersion } = useVersionContext();
  const [showAddSlot, setShowAddSlot] = useState(false);
  const [spellDataMap, setSpellDataMap] = React.useState<Record<string, SpellData[]>>({});

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

  // 통합 스킬 데이터 로드
  React.useEffect(() => {
    const loadSpellData = async () => {
      try {
        const data = await getIntegratedSpellDataForChampions(champions, version);
        setSpellDataMap(data);

        // CDragon 버전 추출 후 전역 컨텍스트에 저장
        // 초기 로딩 시 받은 cdragonVersion이 없을 때만 스킬 데이터에서 감지한 버전 사용
        if (!cdragonVersion) {
          try {
            let detectedVersion: string | null = null;
            for (const championId of Object.keys(data)) {
              const spells = data[championId];
              if (spells && spells.length > 0) {
                detectedVersion = spells[0].cdragonVersion ?? null;
                if (detectedVersion) break;
              }
            }
            if (detectedVersion) {
              setCDragonVersion(detectedVersion);
            }
          } catch (metaError) {
            logger.warn("Failed to extract CDragon version from integrated spell data:", metaError);
          }
        }
      } catch (error) {
        logger.warn("Failed to load integrated spell data:", error);
        setSpellDataMap({});
      }
    };

    if (champions.length > 0) {
      loadSpellData();
    }
  }, [champions, version, cdragonVersion, setCDragonVersion]);

  const maxLevel = React.useMemo(() => {
    return Math.max(
      ...champions.map((c) =>
        c.spells ? Math.max(...c.spells.map((s) => s.maxrank)) : 0
      )
    );
  }, [champions]);

  // 스킬 데이터 가져오기 헬퍼 함수
  const getSpellData = React.useCallback((championId: string, spellIndex: number): SpellData | null => {
    const spellDataList = spellDataMap[championId];
    if (!spellDataList || spellDataList.length <= spellIndex) {
      return null;
    }
    return spellDataList[spellIndex];
  }, [spellDataMap]);

  const skillRows = React.useMemo(() => {
    return Array.from({ length: maxLevel }, (_, levelIdx) => {
      const level = levelIdx + 1;
      return {
        level,
        skills: champions.map((champion) => {
          if (!champion.spells) return null;
          return champion.spells.map((skill, skillIdx) => {
            const spellData = getSpellData(champion.id, skillIdx);
            const cooldown = getCooldownForLevel(skill, level, spellData);
            return {
              skill,
              cooldown,
            };
          });
        }),
      };
    });
  }, [champions, maxLevel, getSpellData]);

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
          "text-center p-2 text-xs font-semibold text-foreground w-[220px] lg:w-[240px] min-w-[200px] lg:min-w-[220px] select-none",
          index < champions.length - 1 && "border-r border-border/30",
          isDragging && "z-50"
        )}
      >
        <div className="flex flex-row items-center justify-center gap-2 relative">
          {onReorderChampions && (
            <button
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing p-1 opacity-60 hover:opacity-100 transition-opacity -ml-1"
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
          <div className="flex flex-col items-start">
            <div className="text-[11px] font-semibold leading-tight text-foreground">{champion.name}</div>
            <div className="text-[9px] text-muted-foreground leading-tight">
              {champion.title}
            </div>
          </div>
        </div>
      </TableHead>
    );
  };

  return (
    <TooltipProvider delayDuration={0} skipDelayDuration={150}>
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
                      index={idx}
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
                      추가
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
                <SortableCell
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
                        isPassive
                        passiveName={champion.passive.name}
                        passiveDescription={champion.passive.description}
                        passiveImageFull={champion.passive.image.full}
                        skill={{} as ChampionSpell}
                        skillIdx={0}
                        version={version}
                      />
                    )}
                    {/* Skills */}
                    {champion.spells?.map((skill, skillIdx) => {
                      const spellData = getSpellData(champion.id, skillIdx);
                      return (
                        <SkillTooltip
                          key={skill.id}
                          skill={skill}
                          skillIdx={skillIdx}
                          version={version}
                          spellData={spellData}
                        />
                      );
                    })}
                  </div>
                </SortableCell>
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
                  {row.level}{t.common.level}
                </TableCell>
                {row.skills.map((championSkills, champIdx) => {
                  const champion = champions[champIdx];
                  
                  return (
                    <SortableCell
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
                              {skillData.cooldown !== ""
                                ? `${skillData.cooldown}${t.common.seconds}`
                                : "-"}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </SortableCell>
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

