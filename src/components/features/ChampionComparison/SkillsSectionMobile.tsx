import React from "react";
import { ChampionIcon } from "@/components/ui/champion-icon";
import { cn } from "@/lib/utils";
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
import { SkillRankCooldown } from "./SkillRankCooldown";
import { getCooldownForLevel } from "./utils";
import { useTranslation } from "@/i18n";

export function SkillsSectionMobile({
  champions,
  patchVersion,
  ddragonVersion,
}: SectionProps) {
  const { t } = useTranslation();
  const maxLevel = React.useMemo(() => {
    return Math.max(
      ...champions.map((c) =>
        c.spells ? Math.max(...c.spells.map((s) => s.maxrank)) : 0
      )
    );
  }, [champions]);

  const skillRows = React.useMemo(() => {
    return Array.from({ length: maxLevel }, (_, levelIdx) => {
      const level = levelIdx + 1;
      return {
        level,
        skills: champions.map((champion) => {
          if (!champion.spells) return null;
          return champion.spells.map((skill) => {
            const cooldown = getCooldownForLevel(skill, level);
            return {
              skill,
              cooldown,
            };
          });
        }),
      };
    });
  }, [champions, maxLevel]);

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
                          <ChampionIcon id={champion.id} ddragonVersion={ddragonVersion} alt={champion.name} className="block w-8 h-8 rounded-full" />
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
                                    <SkillRankCooldown skill={skillData.skill} rank={row.level} cooldown={skillData.cooldown} />
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
