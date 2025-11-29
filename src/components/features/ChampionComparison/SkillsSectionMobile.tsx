import React from "react";
import { Champion } from "@/types";
import { CHAMP_ICON_URL } from "@/services/api";
import { getIntegratedSpellDataForChampions, SpellData } from "@/services/spellDataService";
import { cn } from "@/lib/utils";
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

export function SkillsSectionMobile({
  champions,
  version,
  championList,
  onAddChampion,
  onRemoveChampion,
}: SectionProps) {
  const [spellDataMap, setSpellDataMap] = React.useState<Record<string, SpellData[]>>({});

  // 통합 스킬 데이터 로드
  React.useEffect(() => {
    const loadSpellData = async () => {
      try {
        const data = await getIntegratedSpellDataForChampions(champions, version);
        setSpellDataMap(data);
      } catch (error) {
        console.warn("Failed to load integrated spell data:", error);
        setSpellDataMap({});
      }
    };

    if (champions.length > 0) {
      loadSpellData();
    }
  }, [champions, version]);

  const maxLevel = React.useMemo(() => {
    return Math.max(
      ...champions.map((c) =>
        c.spells ? Math.max(...c.spells.map((s) => s.maxrank)) : 0
      )
    );
  }, [champions]);

  // 스킬 데이터 가져오기 헬퍼 함수
  const getSpellData = (championId: string, spellIndex: number): SpellData | null => {
    const spellDataList = spellDataMap[championId];
    if (!spellDataList || spellDataList.length <= spellIndex) {
      return null;
    }
    return spellDataList[spellIndex];
  };

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
  }, [champions, maxLevel, spellDataMap]);

  return (
    <TooltipProvider delayDuration={0} skipDelayDuration={150}>
      <div className="overflow-x-auto -mx-4 px-4">
        <div className="min-w-full">
          <div className="relative">
            <div className="border border-border/30 rounded-lg overflow-hidden">
              <Table className="border-collapse table-fixed w-auto min-w-full">
                <TableHeader>
                  <TableRow className="border-b border-border/30">
                    <TableHead className="text-left p-2 pl-3 text-xs font-semibold text-foreground sticky left-0 bg-card z-20 w-[60px] min-w-[60px] border-r border-border/30" style={{ left: 0 }}>
                      레벨
                    </TableHead>
                    {champions.map((champion, idx) => (
                      <TableHead
                        key={champion.id}
                        className="text-center p-2 text-xs font-semibold text-foreground w-full"
                      >
                        <div className="flex flex-col items-center justify-center gap-1">
                          <img
                            src={CHAMP_ICON_URL(version, champion.id)}
                            alt={champion.name}
                            className="w-8 h-8 rounded-full"
                          />
                          <div className="text-sm font-semibold leading-tight text-center text-foreground">
                            {champion.name}
                          </div>
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Skills Header */}
                  <TableRow className="border-b-2 border-border/30 bg-muted/30">
                    <TableCell className="p-2 pl-3 text-xs font-medium sticky left-0 bg-card z-20 border-r border-border/30" style={{ left: 0 }}>
                      스킬
                    </TableCell>
                    {champions.map((champion) => (
                      <TableCell
                        key={champion.id}
                        className="p-2"
                      >
                        <div className="flex justify-center gap-1">
                          {/* Passive */}
                          {champion.passive && (
                            <SkillTooltip
                              isPassive
                              passiveName={champion.passive.name}
                              passiveDescription={champion.passive.description}
                              passiveImageFull={champion.passive.image.full}
                              skill={{} as any}
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
                      </TableCell>
                    ))}
                  </TableRow>

                  {/* Skill Cooldowns by Level */}
                  {skillRows.map((row, rowIdx) => (
                    <TableRow
                      key={row.level}
                      className="border-b border-border/30 hover:bg-muted/30 transition-colors"
                    >
                      <TableCell
                        className={cn(
                          "p-2 pl-3 text-xs font-medium sticky left-0 bg-card z-20 border-r border-border/30",
                          rowIdx === skillRows.length - 1 && "rounded-bl-lg"
                        )}
                        style={{ left: 0 }}
                      >
                        {row.level}레벨
                      </TableCell>
                      {row.skills.map((championSkills, champIdx) => (
                        <TableCell
                          key={champions[champIdx].id}
                          className="p-2"
                        >
                          {championSkills ? (
                            <div className="flex justify-center gap-1">
                              {/* Passive dummy slot */}
                              <div className="flex flex-col items-center min-w-[24px]">
                                <span className="text-[10px] text-muted-foreground">-</span>
                              </div>
                              {/* Skills */}
                              {championSkills.map((skillData, skillIdx) => (
                                <div
                                  key={skillIdx}
                                  className="flex flex-col items-center min-w-[24px]"
                                >
                                  <span className="text-[10px] font-semibold">
                                    {skillData.cooldown !== ""
                                      ? `${skillData.cooldown}s`
                                      : "-"}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

