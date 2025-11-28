import React, { useMemo, useState } from "react";
import { Champion } from "@/types";
import { CHAMP_ICON_URL, PASSIVE_ICON_URL, SKILL_ICON_URL } from "@/services/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
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
        <div className="hidden md:block overflow-x-auto relative">
          <table className="border-collapse border border-border/30 rounded-lg overflow-hidden table-fixed w-auto">
            <thead>
              <tr className="border-b border-border/30">
                <th className="text-left p-2 pl-3 text-xs font-semibold sticky left-0 bg-card z-10 w-[90px] min-w-[90px] border-r border-border/30">
                  스탯
                </th>
                {champions.map((champion) => (
                  <th
                    key={champion.id}
                    className="text-center p-2 text-xs font-semibold w-[180px] md:w-[200px] lg:w-[220px] min-w-[160px] md:min-w-[180px] lg:min-w-[200px]"
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
                        <div className="text-[11px] font-semibold leading-tight">{champion.name}</div>
                        <div className="text-[9px] text-muted-foreground leading-tight">
                          {champion.title}
                        </div>
                      </div>
                    </div>
                  </th>
                ))}
                {onAddChampion && (
                  <th className="text-center p-2 text-xs font-semibold w-[180px] md:w-[200px] lg:w-[220px] min-w-[160px] md:min-w-[180px] lg:min-w-[200px] border-l border-border/30">
                    <button
                      onClick={() => setShowAddSlot(true)}
                      className="w-full flex flex-row items-center justify-center gap-2 p-1.5 rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30 transition-colors group"
                    >
                      <div className="w-8 h-8 rounded-full bg-muted/30 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                        <Plus className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <div className="text-[10px] text-muted-foreground group-hover:text-primary transition-colors whitespace-nowrap">
                        추가
                      </div>
                    </button>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {STAT_FIELDS.map((field) => {
                const values = champions.map((c) => c.stats?.[field.key] ?? 0);
                const maxValue = Math.max(...values);
                const minValue = Math.min(...values);

                return (
                  <tr
                    key={field.key}
                    className="border-b border-border/30 hover:bg-muted/30 transition-colors"
                  >
                    <td className="p-2 pl-3 text-xs font-medium sticky left-0 bg-card z-10 border-r border-border/30" style={{ wordBreak: 'keep-all' }}>
                      {field.label}
                    </td>
                    {champions.map((champion, idx) => {
                      const value = champion.stats?.[field.key] ?? 0;
                      const isMax = value === maxValue && maxValue !== minValue;
                      const isMin = value === minValue && maxValue !== minValue;

                      return (
                        <td
                          key={champion.id}
                          className={cn(
                            "p-2 text-xs text-center",
                            isMax && "text-primary font-semibold",
                            isMin && "text-muted-foreground"
                          )}
                        >
                          {field.format(value)}
                        </td>
                      );
                    })}
                    {onAddChampion && (
                      <td className="p-2 text-center border-l border-border/30">
                        <div className="w-full h-full min-h-[32px]" />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {showAddSlot && onAddChampion && championList && (
            <ChampionSelector
              championList={championList}
              selectedChampions={champions}
              onSelect={(champion) => {
                onAddChampion(champion);
                setShowAddSlot(false);
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
  
  const maxLevel = useMemo(() => {
    return Math.max(
      ...champions.map((c) =>
        c.spells
          ? Math.max(...c.spells.map((s) => s.maxrank))
          : 0
      )
    );
  }, [champions]);

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
    <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
      <div className="min-w-full">
        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto relative">
          <table className="border-collapse border border-border/30 rounded-lg overflow-hidden table-fixed w-auto">
            <thead>
              <tr className="border-b border-border/30">
                <th className="text-left p-2 pl-3 text-xs font-semibold sticky left-0 bg-card z-10 w-[80px] min-w-[80px] border-r border-border/30">
                  레벨
                </th>
                {champions.map((champion) => (
                  <th
                    key={champion.id}
                    className="text-center p-2 text-xs font-semibold w-[200px] md:w-[220px] lg:w-[240px] min-w-[180px] md:min-w-[200px] lg:min-w-[220px]"
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
                        <div className="text-[11px] font-semibold leading-tight">{champion.name}</div>
                        <div className="text-[9px] text-muted-foreground leading-tight">
                          {champion.title}
                        </div>
                      </div>
                    </div>
                  </th>
                ))}
                {onAddChampion && (
                  <th className="text-center p-2 text-xs font-semibold w-[200px] md:w-[220px] lg:w-[240px] min-w-[180px] md:min-w-[200px] lg:min-w-[220px] border-l border-border/30">
                    <button
                      onClick={() => setShowAddSlot(true)}
                      className="w-full flex flex-row items-center justify-center gap-2 p-1.5 rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30 transition-colors group"
                    >
                      <div className="w-8 h-8 rounded-full bg-muted/30 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                        <Plus className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <div className="text-[10px] text-muted-foreground group-hover:text-primary transition-colors whitespace-nowrap">
                        추가
                      </div>
                    </button>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {/* Passive Row */}
              <tr className="border-b border-border/30">
                <td className="p-2 pl-3 text-xs font-medium sticky left-0 bg-card z-10 border-r border-border/30">
                  패시브
                </td>
                {champions.map((champion) => (
                  <td key={champion.id} className="p-2 text-center">
                    {champion.passive ? (
                      <img
                        src={PASSIVE_ICON_URL(
                          version,
                          champion.passive.image.full
                        )}
                        alt="Passive"
                        className="w-8 h-8 mx-auto rounded"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </td>
                ))}
                {onAddChampion && (
                  <td className="p-2 text-center border-l border-border/30">
                    <div className="w-full h-full min-h-[32px]" />
                  </td>
                )}
              </tr>

              {/* Skills Header */}
              <tr className="border-b-2 border-border/30 bg-muted/30">
                <td className="p-2 pl-3 text-xs font-medium sticky left-0 bg-muted/30 z-10 border-r border-border/30">
                  스킬
                </td>
                {champions.map((champion) => (
                  <td key={champion.id} className="p-2">
                    <div className="flex justify-center gap-1.5">
                      {champion.spells?.map((skill, idx) => (
                        <div
                          key={skill.id}
                          className="flex flex-col items-center gap-0.5"
                        >
                          <img
                            src={SKILL_ICON_URL(version, skill.id)}
                            alt={SKILL_LETTERS[idx]}
                            className="w-8 h-8 rounded"
                          />
                          <span className="text-[9px] font-semibold">
                            {SKILL_LETTERS[idx]}
                          </span>
                        </div>
                      ))}
                    </div>
                  </td>
                ))}
                {onAddChampion && (
                  <td className="p-2 text-center border-l border-border/30">
                    <div className="w-full h-full min-h-[32px]" />
                  </td>
                )}
              </tr>

              {/* Skill Cooldowns by Level */}
              {skillRows.map((row) => (
                <tr
                  key={row.level}
                  className="border-b border-border/30 hover:bg-muted/30 transition-colors"
                >
                  <td className="p-2 pl-3 text-xs font-medium sticky left-0 bg-card z-10 border-r border-border/30">
                    {row.level}레벨
                  </td>
                  {row.skills.map((championSkills, champIdx) => (
                    <td key={champions[champIdx].id} className="p-2">
                      {championSkills ? (
                        <div className="flex justify-center gap-1.5">
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
                    </td>
                  ))}
                  {onAddChampion && (
                    <td className="p-2 text-center border-l border-border/30">
                      <div className="w-full h-full min-h-[32px]" />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {showAddSlot && onAddChampion && championList && (
            <ChampionSelector
              championList={championList}
              selectedChampions={champions}
              onSelect={(champion) => {
                onAddChampion(champion);
                setShowAddSlot(false);
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
                  {/* Passive */}
                  {champion.passive && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2">패시브</h4>
                      <img
                        src={PASSIVE_ICON_URL(
                          version,
                          champion.passive.image.full
                        )}
                        alt="Passive"
                        className="w-12 h-12 rounded"
                      />
                    </div>
                  )}

                  {/* Skills */}
                  {champion.spells && (
                    <div>
                      <h4 className="text-sm font-semibold mb-3">스킬 쿨타임</h4>
                      <div className="space-y-3">
                        {champion.spells.map((skill, idx) => {
                          const maxRank = skill.maxrank;
                          return (
                            <div key={skill.id} className="space-y-2">
                              <div className="flex items-center gap-2">
                                <img
                                  src={SKILL_ICON_URL(version, skill.id)}
                                  alt={SKILL_LETTERS[idx]}
                                  className="w-10 h-10 rounded"
                                />
                                <span className="font-semibold">
                                  {SKILL_LETTERS[idx]}
                                </span>
                              </div>
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

