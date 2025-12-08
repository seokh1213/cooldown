import React from "react";
import { CHAMP_ICON_URL } from "@/services/api";
import { getIntegratedSpellDataForChampions, SpellData } from "@/services/spellDataService";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";
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
import { SectionProps } from "./types";
import { SkillTooltip } from "./SkillTooltip";
import { getCooldownForLevel } from "./utils";
import { useTranslation } from "@/i18n";
import { ChampionSpell } from "@/types";
import { useVersionContext } from "@/context/VersionContext";

export function SkillsSectionMobile({
  champions,
  version,
  vsMode,
}: SectionProps) {
  const { t } = useTranslation();
  const { cdragonVersion, setCDragonVersion } = useVersionContext();
  const [spellDataMap, setSpellDataMap] = React.useState<Record<string, SpellData[]>>({});

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
            logger.warn("Failed to extract CDragon version from integrated spell data (mobile):", metaError);
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

  // VS 모드 레이아웃
  if (vsMode && champions.length === 2) {
    const championA = vsMode.championA;
    const championB = vsMode.championB;

    return (
      <TooltipProvider delayDuration={0} skipDelayDuration={150}>
        <div className="overflow-x-auto -mx-4 px-4">
          <div className="min-w-full">
            <div className="relative">
              <div className="border border-border/30 rounded-lg overflow-hidden">
                <Table className="border-collapse table-fixed w-auto min-w-full">
                  <TableHeader>
                    <TableRow className="border-b border-border/30 select-none">
                      <TableHead className="text-left p-1.5 pl-2 text-[10px] font-semibold text-foreground sticky left-0 bg-card z-20 w-[50px] min-w-[50px] border-r border-border/30 select-none" style={{ left: 0 }}>
                        {t.common.level}
                      </TableHead>
                      <TableHead className="text-center p-1.5 text-[10px] font-semibold text-foreground w-[calc((100%-90px)/2)] min-w-[100px] border-r border-border/30 select-none">
                        <div className="flex flex-col items-center justify-center gap-0.5">
                          <img
                            src={CHAMP_ICON_URL(version, championA.id)}
                            alt={championA.name}
                            className="w-6 h-6 rounded-full"
                            draggable="false"
                          />
                          <div className="text-xs font-semibold leading-tight text-center text-foreground">
                            {championA.name}
                          </div>
                        </div>
                      </TableHead>
                      <TableHead className="text-center p-1.5 text-[10px] font-semibold text-foreground w-[40px] min-w-[40px] border-r border-border/30 bg-muted/20 select-none">
                        <div className="text-[9px] font-bold">VS</div>
                      </TableHead>
                      <TableHead className="text-center p-1.5 text-[10px] font-semibold text-foreground w-[calc((100%-90px)/2)] min-w-[100px] select-none">
                        <div className="flex flex-col items-center justify-center gap-0.5">
                          <img
                            src={CHAMP_ICON_URL(version, championB.id)}
                            alt={championB.name}
                            className="w-6 h-6 rounded-full"
                            draggable="false"
                          />
                          <div className="text-xs font-semibold leading-tight text-center text-foreground">
                            {championB.name}
                          </div>
                        </div>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* Skills Header */}
                    <TableRow className="border-b-2 border-border/30 bg-muted/30 select-none">
                      <TableCell className="p-1.5 pl-2 text-[10px] font-medium sticky left-0 bg-card z-20 border-r border-border/30 select-none" style={{ left: 0 }}>
                        {t.skills.label}
                      </TableCell>
                      <TableCell className="p-1.5 border-r border-border/30">
                        <div className="flex justify-center gap-0.5">
                          {championA.passive && (
                            <SkillTooltip
                              isPassive
                              passiveName={championA.passive.name}
                              passiveDescription={championA.passive.description}
                              passiveImageFull={championA.passive.image.full}
                              skill={{} as ChampionSpell}
                              skillIdx={0}
                              version={version}
                              size="small"
                            />
                          )}
                          {championA.spells?.map((skill, skillIdx) => {
                            const spellData = getSpellData(championA.id, skillIdx);
                            return (
                              <SkillTooltip
                                key={skill.id}
                                skill={skill}
                                skillIdx={skillIdx}
                                version={version}
                                spellData={spellData}
                                size="small"
                              />
                            );
                          })}
                        </div>
                      </TableCell>
                      <TableCell className="p-1.5 border-r border-border/30 bg-muted/20 select-none"></TableCell>
                      <TableCell className="p-1.5">
                        <div className="flex justify-center gap-0.5">
                          {championB.passive && (
                            <SkillTooltip
                              isPassive
                              passiveName={championB.passive.name}
                              passiveDescription={championB.passive.description}
                              passiveImageFull={championB.passive.image.full}
                              skill={{} as ChampionSpell}
                              skillIdx={0}
                              version={version}
                              size="small"
                            />
                          )}
                          {championB.spells?.map((skill, skillIdx) => {
                            const spellData = getSpellData(championB.id, skillIdx);
                            return (
                              <SkillTooltip
                                key={skill.id}
                                skill={skill}
                                skillIdx={skillIdx}
                                version={version}
                                spellData={spellData}
                                size="small"
                              />
                            );
                          })}
                        </div>
                      </TableCell>
                    </TableRow>

                    {/* Skill Cooldowns by Level */}
                    {skillRows.map((row, rowIdx) => {
                      const championASkills = row.skills[0];
                      const championBSkills = row.skills[1];
                      
                      return (
                        <TableRow
                          key={row.level}
                          className="border-b border-border/30 hover:bg-muted/30 transition-colors"
                        >
                          <TableCell
                            className={cn(
                              "p-1.5 pl-2 text-[10px] font-medium sticky left-0 bg-card z-20 border-r border-border/30 select-none",
                              rowIdx === skillRows.length - 1 && "rounded-bl-lg"
                            )}
                            style={{ left: 0 }}
                          >
                            {row.level}{t.common.level}
                          </TableCell>
                          <TableCell className="p-1.5 border-r border-border/30">
                            {championASkills ? (
                              <div className="flex justify-center gap-0.5">
                                <div className="flex flex-col items-center min-w-[20px]">
                                  <span className="text-[9px] text-muted-foreground">-</span>
                                </div>
                                {championASkills.map((skillData, skillIdx) => (
                                  <div
                                    key={skillIdx}
                                    className="flex flex-col items-center min-w-[20px]"
                                  >
                                    <span className="text-[9px] font-semibold">
                                      {skillData.cooldown !== ""
                                        ? `${skillData.cooldown}${t.common.seconds}`
                                        : "-"}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[9px] text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="p-1.5 border-r border-border/30 bg-muted/20 select-none"></TableCell>
                          <TableCell className="p-1.5">
                            {championBSkills ? (
                              <div className="flex justify-center gap-0.5">
                                <div className="flex flex-col items-center min-w-[20px]">
                                  <span className="text-[9px] text-muted-foreground">-</span>
                                </div>
                                {championBSkills.map((skillData, skillIdx) => (
                                  <div
                                    key={skillIdx}
                                    className="flex flex-col items-center min-w-[20px]"
                                  >
                                    <span className="text-[9px] font-semibold">
                                      {skillData.cooldown !== ""
                                        ? `${skillData.cooldown}${t.common.seconds}`
                                        : "-"}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[9px] text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={0} skipDelayDuration={150}>
      <div className="overflow-x-auto -mx-4 px-4">
        <div className="min-w-full">
          <div className="relative">
            <div className="border border-border/30 rounded-lg overflow-hidden">
              <Table className="border-collapse table-fixed w-auto min-w-full">
                <TableHeader>
                  <TableRow className="border-b border-border/30 select-none">
                    <TableHead className="text-left p-2 pl-3 text-xs font-semibold text-foreground sticky left-0 bg-card z-20 w-[60px] min-w-[60px] border-r border-border/30 select-none" style={{ left: 0 }}>
                      {t.common.level}
                    </TableHead>
                    {champions.map((champion) => (
                      <TableHead
                        key={champion.id}
                        className="text-center p-2 text-xs font-semibold text-foreground w-full select-none"
                      >
                        <div className="flex flex-col items-center justify-center gap-1">
                          <img
                            src={CHAMP_ICON_URL(version, champion.id)}
                            alt={champion.name}
                            className="w-8 h-8 rounded-full"
                            draggable="false"
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
                  <TableRow className="border-b-2 border-border/30 bg-muted/30 select-none">
                    <TableCell className="p-2 pl-3 text-xs font-medium sticky left-0 bg-card z-20 border-r border-border/30 select-none" style={{ left: 0 }}>
                      {t.skills.label}
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
                          "p-2 pl-3 text-xs font-medium sticky left-0 bg-card z-20 border-r border-border/30 select-none",
                          rowIdx === skillRows.length - 1 && "rounded-bl-lg"
                        )}
                        style={{ left: 0 }}
                      >
                        {row.level}{t.common.level}
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
                                      ? `${skillData.cooldown}${t.common.seconds}`
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

