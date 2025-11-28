import React, { useMemo, useState, useEffect } from "react";
import { Champion } from "@/types";
import { CHAMP_ICON_URL, PASSIVE_ICON_URL, SKILL_ICON_URL, getCommunityDragonSpellData } from "@/services/api";
import { parseSpellTooltip } from "@/lib/spellTooltipParser";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { X, Plus } from "lucide-react";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import ChampionSelector from "./ChampionSelector";

interface ChampionComparisonProps {
  champions: Champion[];
  version: string;
  activeTab: "stats" | "skills";
  championList?: Champion[] | null;
  onAddChampion?: (champion: Champion) => void;
  onRemoveChampion?: (championId: string) => void;
}

const SKILL_LETTERS = ["Q", "W", "E", "R"] as const;

// 기본 스탯 필드 (중요한 것들만)
const STAT_FIELDS = [
  { key: "hp", label: "체력", format: (v: number) => Math.round(v) },
  { key: "hpperlevel", label: "레벨당 체력", format: (v: number) => v.toFixed(1) },
  { key: "mp", label: "마나", format: (v: number) => Math.round(v) },
  { key: "mpperlevel", label: "레벨당 마나", format: (v: number) => v.toFixed(1) },
  { key: "movespeed", label: "이동 속도", format: (v: number) => Math.round(v) },
  { key: "armor", label: "방어력", format: (v: number) => Math.round(v) },
  { key: "armorperlevel", label: "레벨당 방어력", format: (v: number) => v.toFixed(1) },
  { key: "spellblock", label: "마법 저항력", format: (v: number) => Math.round(v) },
  { key: "spellblockperlevel", label: "레벨당 마법 저항력", format: (v: number) => v.toFixed(1) },
  { key: "attackdamage", label: "공격력", format: (v: number) => Math.round(v) },
  { key: "attackdamageperlevel", label: "레벨당 공격력", format: (v: number) => v.toFixed(1) },
  { key: "attackspeed", label: "공격 속도", format: (v: number) => v.toFixed(3) },
  { key: "attackspeedperlevel", label: "레벨당 공격 속도", format: (v: number) => `${(v * 100).toFixed(1)}%` },
  { key: "attackrange", label: "사거리", format: (v: number) => Math.round(v) },
  { key: "crit", label: "치명타 확률", format: (v: number) => `${(v * 100).toFixed(1)}%` },
  { key: "critperlevel", label: "레벨당 치명타 확률", format: (v: number) => `${(v * 100).toFixed(1)}%` },
  { key: "hpregen", label: "체력 재생", format: (v: number) => v.toFixed(1) },
  { key: "hpregenperlevel", label: "레벨당 체력 재생", format: (v: number) => v.toFixed(1) },
  { key: "mpregen", label: "마나 재생", format: (v: number) => v.toFixed(1) },
  { key: "mpregenperlevel", label: "레벨당 마나 재생", format: (v: number) => v.toFixed(1) },
];

function StatsSection({ 
  champions, 
  version,
  championList,
  onAddChampion,
  onRemoveChampion 
}: { 
  champions: Champion[]; 
  version: string;
  championList?: Champion[] | null;
  onAddChampion?: (champion: Champion) => void;
  onRemoveChampion?: (championId: string) => void;
}) {
  const [showAddSlot, setShowAddSlot] = useState(false);
  
  return (
    <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
      <div className="min-w-full">
        {/* Desktop Table */}
        <div className="hidden md:block relative">
          <div className="border border-border/30 rounded-lg overflow-hidden">
            <Table className="border-collapse table-fixed w-auto">
              <TableHeader>
                <TableRow className="border-b border-border/30">
                  <TableHead className="text-left p-2 pl-3 text-xs font-semibold text-foreground sticky left-0 bg-card z-20 w-[90px] min-w-[90px] border-r border-border/30" style={{ left: 0 }}>
                    스탯
                  </TableHead>
                  {champions.map((champion, idx) => (
                    <TableHead
                      key={champion.id}
                      className={cn(
                        "text-center p-2 text-xs font-semibold text-foreground w-[100px] min-w-[100px]",
                        idx < champions.length - 1 && "border-r border-border/30"
                      )}
                    >
                      <div className="flex flex-col items-center justify-center gap-1.5 relative">
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
                  ))}
                  {onAddChampion && (
                    <TableHead className="text-center p-2 text-xs font-semibold text-foreground w-[100px] min-w-[100px] border-l border-border/30">
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
                      <TableCell className="p-2 pl-3 text-xs font-medium sticky left-0 bg-card z-20 border-r border-border/30" style={{ wordBreak: 'keep-all', left: 0 }}>
                        {field.label}
                      </TableCell>
                      {champions.map((champion, idx) => {
                        const value = champion.stats?.[field.key] ?? 0;
                        const isMax = value === maxValue && maxValue !== minValue;
                        const isMin = value === minValue && maxValue !== minValue;

                        return (
                          <TableCell
                            key={champion.id}
                            className={cn(
                              "p-2 text-xs text-center",
                              idx < champions.length - 1 && "border-r border-border/30",
                              isMax && "text-primary font-semibold",
                              isMin && "text-muted-foreground"
                            )}
                          >
                            {field.format(value)}
                          </TableCell>
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
          {showAddSlot && onAddChampion && championList && (
            <ChampionSelector
              championList={championList}
              selectedChampions={champions}
              onSelect={(champion) => {
                onAddChampion(champion);
                // 모달을 닫지 않고 계속 열어둠 (여러 명 선택 가능하도록)
              }}
              onClose={() => setShowAddSlot(false)}
            />
          )}
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden space-y-4">
          {champions.map((champion) => (
            <Card key={champion.id}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <img
                    src={CHAMP_ICON_URL(version, champion.id)}
                    alt={champion.name}
                    className="w-12 h-12 rounded-full"
                  />
                  <div>
                    <CardTitle className="text-lg">{champion.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {champion.title}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {STAT_FIELDS.map((field) => {
                    const value = champion.stats?.[field.key] ?? 0;
                    return (
                      <div
                        key={field.key}
                        className="flex justify-between items-center py-2 border-b border-border/50 last:border-0"
                      >
                        <span className="text-sm font-medium">
                          {field.label}
                        </span>
                        <span className="text-sm">{field.format(value)}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function SkillsSection({
  champions,
  version,
  championList,
  onAddChampion,
  onRemoveChampion,
}: {
  champions: Champion[];
  version: string;
  championList?: Champion[] | null;
  onAddChampion?: (champion: Champion) => void;
  onRemoveChampion?: (championId: string) => void;
}) {
  const [showAddSlot, setShowAddSlot] = useState(false);
  const [communityDragonData, setCommunityDragonData] = useState<
    Record<string, Record<string, Record<string, (number | string)[]>>>
  >({});
  
  // Community Dragon 데이터 로드
  useEffect(() => {
    const loadCommunityDragonData = async () => {
      const dataMap: Record<string, Record<string, Record<string, (number | string)[]>>> = {};
      
      for (const champion of champions) {
        if (!dataMap[champion.id]) {
          try {
            const spellData = await getCommunityDragonSpellData(champion.id, version);
            dataMap[champion.id] = spellData;
          } catch (error) {
            console.warn(`Failed to load Community Dragon data for ${champion.id}:`, error);
            dataMap[champion.id] = {};
          }
        }
      }
      
      setCommunityDragonData(dataMap);
    };
    
    if (champions.length > 0) {
      loadCommunityDragonData();
    }
  }, [champions, version]);
  
  const maxLevel = useMemo(() => {
    return Math.max(
      ...champions.map((c) =>
        c.spells
          ? Math.max(...c.spells.map((s) => s.maxrank))
          : 0
      )
    );
  }, [champions]);
  
  // 스킬 ID를 Community Dragon 스킬 데이터로 매핑하는 헬퍼 함수
  const getCommunityDragonSpellDataForSkill = (
    championId: string,
    spellId: string,
    spellIndex: number
  ): Record<string, (number | string)[]> => {
    const cdData = communityDragonData[championId];
    if (!cdData) return {};
    
    // 1. 스킬 인덱스로 직접 찾기 (Q=0, W=1, E=2, R=3)
    if (cdData[spellIndex.toString()]) {
      return cdData[spellIndex.toString()];
    }
    
    // 2. 스킬 ID로 찾기 시도
    const spellName = spellId.replace(championId, "");
    for (const key of Object.keys(cdData)) {
      if (key.toLowerCase().includes(spellName.toLowerCase()) || 
          key.toLowerCase().includes(spellId.toLowerCase())) {
        return cdData[key] || {};
      }
    }
    
    // 3. 스킬 순서로 찾기 (fallback)
    const spellKeys = Object.keys(cdData).filter(k => !isNaN(Number(k)));
    if (spellKeys.length > spellIndex) {
      const sortedKeys = spellKeys.sort((a, b) => Number(a) - Number(b));
      if (cdData[sortedKeys[spellIndex]]) {
        return cdData[sortedKeys[spellIndex]];
      }
    }
    
    return {};
  };

  const skillRows = useMemo(() => {
    return Array.from({ length: maxLevel }, (_, levelIdx) => {
      const level = levelIdx + 1;
      return {
        level,
        skills: champions.map((champion) => {
          if (!champion.spells) return null;
          return champion.spells.map((skill) => ({
            skill,
            cooldown: skill.cooldown[levelIdx] ?? "",
          }));
        }),
      };
    });
  }, [champions, maxLevel]);

  return (
    <TooltipProvider delayDuration={0} skipDelayDuration={150}>
      <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
      <div className="min-w-full">
        {/* Desktop Table */}
        <div className="hidden md:block relative">
          <div className="border border-border/30 rounded-lg overflow-hidden">
            <Table className="border-collapse table-fixed w-auto">
              <TableHeader>
                <TableRow className="border-b border-border/30">
                  <TableHead className="text-left p-2 pl-3 text-xs font-semibold text-foreground sticky left-0 bg-card z-20 w-[80px] min-w-[80px] border-r border-border/30" style={{ left: 0 }}>
                    레벨
                  </TableHead>
                  {champions.map((champion, idx) => (
                    <TableHead
                      key={champion.id}
                      className={cn(
                        "text-center p-2 text-xs font-semibold text-foreground w-[200px] md:w-[220px] lg:w-[240px] min-w-[180px] md:min-w-[200px] lg:min-w-[220px]",
                        idx < champions.length - 1 && "border-r border-border/30"
                      )}
                    >
                      <div className="flex flex-row items-center justify-center gap-2 relative">
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
                  ))}
                  {onAddChampion && (
                    <TableHead className="text-center p-2 text-xs font-semibold text-foreground w-[200px] md:w-[220px] lg:w-[240px] min-w-[180px] md:min-w-[200px] lg:min-w-[220px] border-l border-border/30">
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
                <TableRow className="border-b-2 border-border/30 bg-muted/30">
                  <TableCell className="p-2 pl-3 text-xs font-medium sticky left-0 bg-card z-20 border-r border-border/30" style={{ left: 0 }}>
                    스킬
                  </TableCell>
                  {champions.map((champion, idx) => (
                    <TableCell 
                      key={champion.id} 
                      className={cn(
                        "p-2",
                        idx < champions.length - 1 && "border-r border-border/30"
                      )}
                    >
                      <div className="flex justify-center gap-1.5">
                        {/* Passive */}
                        {champion.passive && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex flex-col items-center gap-0.5 cursor-help p-1 -m-1">
                                <img
                                  src={PASSIVE_ICON_URL(
                                    version,
                                    champion.passive.image.full
                                  )}
                                  alt="Passive"
                                  className="w-8 h-8 rounded"
                                />
                                <span className="text-[9px] font-semibold">
                                  P
                                </span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              align="center"
                              sideOffset={8}
                              className="max-w-xs p-3 space-y-2"
                            >
                              {champion.passive.name && (
                                <div className="font-semibold text-sm">
                                  {champion.passive.name}
                                </div>
                              )}
                              {champion.passive.description && (
                                <div className="text-xs leading-relaxed">
                                  <div
                                    dangerouslySetInnerHTML={{
                                      __html: parseSpellTooltip(
                                        champion.passive.description,
                                        undefined,
                                        1,
                                        true
                                      ),
                                    }}
                                  />
                                </div>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        )}
                        {/* Skills */}
                        {champion.spells?.map((skill, skillIdx) => (
                          <Tooltip key={skill.id}>
                            <TooltipTrigger asChild>
                              <div className="flex flex-col items-center gap-0.5 cursor-help p-1 -m-1">
                                <img
                                  src={SKILL_ICON_URL(version, skill.id)}
                                  alt={SKILL_LETTERS[skillIdx]}
                                  className="w-8 h-8 rounded"
                                />
                                <span className="text-[9px] font-semibold">
                                  {SKILL_LETTERS[skillIdx]}
                                </span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              align="center"
                              sideOffset={8}
                              className="max-w-xs p-3 space-y-2"
                            >
                              {skill.name && (
                                <div className="font-semibold text-sm">
                                  {skill.name}
                                </div>
                              )}
                              {skill.description && (
                                <div className="text-xs leading-relaxed">
                                  <div
                                    dangerouslySetInnerHTML={{
                                      __html: parseSpellTooltip(
                                        skill.description,
                                        skill,
                                        1,
                                        true,
                                        getCommunityDragonSpellDataForSkill(champion.id, skill.id, skillIdx)
                                      ),
                                    }}
                                  />
                                </div>
                              )}
                              {skill.tooltip && (
                                <div className="text-xs text-muted-foreground leading-relaxed border-t pt-2 mt-2">
                                  <div
                                    dangerouslySetInnerHTML={{
                                      __html: parseSpellTooltip(
                                        skill.tooltip,
                                        skill,
                                        1,
                                        true,
                                        getCommunityDragonSpellDataForSkill(champion.id, skill.id, skillIdx)
                                      ),
                                    }}
                                  />
                                </div>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        ))}
                      </div>
                    </TableCell>
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
                    <TableCell className={cn(
                      "p-2 pl-3 text-xs font-medium sticky left-0 bg-card z-20 border-r border-border/30",
                      rowIdx === skillRows.length - 1 && "rounded-bl-lg"
                    )} style={{ left: 0 }}>
                      {row.level}레벨
                    </TableCell>
                    {row.skills.map((championSkills, champIdx) => (
                      <TableCell 
                        key={champions[champIdx].id} 
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
                                    ? `${skillData.cooldown}s`
                                    : "-"}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    ))}
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
            {showAddSlot && onAddChampion && championList && (
              <ChampionSelector
                championList={championList}
                selectedChampions={champions}
                onSelect={(champion) => {
                  onAddChampion(champion);
                  // 모달을 닫지 않고 계속 열어둠 (여러 명 선택 가능하도록)
                }}
                onClose={() => setShowAddSlot(false)}
              />
            )}
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-6">
          {champions.map((champion) => (
            <Card key={champion.id}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <img
                    src={CHAMP_ICON_URL(version, champion.id)}
                    alt={champion.name}
                    className="w-12 h-12 rounded-full"
                  />
                  <div>
                    <CardTitle className="text-lg">{champion.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {champion.title}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Skills */}
                  {(champion.passive || champion.spells) && (
                    <div>
                      <h4 className="text-sm font-semibold mb-3">스킬 쿨타임</h4>
                      <div className="space-y-3">
                        {/* Passive */}
                        {champion.passive && (
                          <div className="space-y-2">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-2 cursor-help">
                                  <img
                                    src={PASSIVE_ICON_URL(
                                      version,
                                      champion.passive.image.full
                                    )}
                                    alt="Passive"
                                    className="w-10 h-10 rounded"
                                  />
                                  <span className="font-semibold">P</span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent
                                side="right"
                                align="center"
                                sideOffset={8}
                                className="max-w-xs p-3 space-y-2"
                              >
                                {champion.passive.name && (
                                  <div className="font-semibold text-sm">
                                    {champion.passive.name}
                                  </div>
                                )}
                                {champion.passive.description && (
                                  <div className="text-xs leading-relaxed">
                                    <div
                                      dangerouslySetInnerHTML={{
                                        __html: parseSpellTooltip(
                                          champion.passive.description,
                                          undefined,
                                          1,
                                          true
                                        ),
                                      }}
                                    />
                                  </div>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        )}
                        {/* Skills */}
                        {champion.spells?.map((skill, idx) => {
                          const maxRank = skill.maxrank;
                          return (
                            <div key={skill.id} className="space-y-2">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center gap-2 cursor-help">
                                    <img
                                      src={SKILL_ICON_URL(version, skill.id)}
                                      alt={SKILL_LETTERS[idx]}
                                      className="w-10 h-10 rounded"
                                    />
                                    <span className="font-semibold">
                                      {SKILL_LETTERS[idx]}
                                    </span>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent
                                  side="right"
                                  align="center"
                                  sideOffset={8}
                                  className="max-w-xs p-3 space-y-2"
                                >
                                  {skill.name && (
                                    <div className="font-semibold text-sm">
                                      {skill.name}
                                    </div>
                                  )}
                                  {skill.description && (
                                    <div className="text-xs leading-relaxed">
                                      <div
                                        dangerouslySetInnerHTML={{
                                          __html: parseSpellTooltip(
                                            skill.description,
                                            skill,
                                            1,
                                            true,
                                            getCommunityDragonSpellDataForSkill(champion.id, skill.id, idx)
                                          ),
                                        }}
                                      />
                                    </div>
                                  )}
                                  {skill.tooltip && (
                                    <div className="text-xs text-muted-foreground leading-relaxed border-t pt-2 mt-2">
                                      <div
                                        dangerouslySetInnerHTML={{
                                          __html: parseSpellTooltip(
                                            skill.tooltip,
                                            skill,
                                            1,
                                            true,
                                            getCommunityDragonSpellDataForSkill(champion.id, skill.id, idx)
                                          ),
                                        }}
                                      />
                                    </div>
                                  )}
                                </TooltipContent>
                              </Tooltip>
                              <div className="grid grid-cols-5 gap-2 pl-12">
                                {Array.from({ length: maxRank }, (_, i) => (
                                  <div
                                    key={i}
                                    className="text-center p-2 bg-muted/50 rounded"
                                  >
                                    <div className="text-xs text-muted-foreground">
                                      {i + 1}레벨
                                    </div>
                                    <div className="text-sm font-semibold">
                                      {skill.cooldown[i] !== undefined
                                        ? `${skill.cooldown[i]}s`
                                        : "-"}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

function ChampionComparison({
  champions,
  version,
  activeTab,
  championList,
  onAddChampion,
  onRemoveChampion,
}: ChampionComparisonProps) {
  if (champions.length === 0) return null;

  return (
    <Card>
      <CardContent className="p-0">
        {activeTab === "stats" ? (
          <StatsSection 
            champions={champions} 
            version={version}
            championList={championList}
            onAddChampion={onAddChampion}
            onRemoveChampion={onRemoveChampion}
          />
        ) : (
          <SkillsSection 
            champions={champions} 
            version={version}
            championList={championList}
            onAddChampion={onAddChampion}
            onRemoveChampion={onRemoveChampion}
          />
        )}
      </CardContent>
    </Card>
  );
}

export default React.memo(ChampionComparison);

