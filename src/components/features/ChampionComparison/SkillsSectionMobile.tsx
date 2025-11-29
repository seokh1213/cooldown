import React, { useMemo, useState, useEffect } from "react";
import { Champion } from "@/types";
import { CHAMP_ICON_URL } from "@/services/api";
import { getIntegratedSpellDataForChampions, SpellData } from "@/services/spellDataService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  const [showAddSlot, setShowAddSlot] = useState(false);
  const [spellDataMap, setSpellDataMap] = useState<Record<string, SpellData[]>>({});

  // 통합 스킬 데이터 로드
  useEffect(() => {
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

  // 스킬 데이터 가져오기 헬퍼 함수
  const getSpellData = (championId: string, spellIndex: number): SpellData | null => {
    const spellDataList = spellDataMap[championId];
    if (!spellDataList || spellDataList.length <= spellIndex) {
      return null;
    }
    return spellDataList[spellIndex];
  };

  return (
    <TooltipProvider delayDuration={0} skipDelayDuration={150}>
      <div className="space-y-6">
      {champions.map((champion) => (
        <Card key={champion.id}>
          <CardHeader>
            <div className="flex items-center justify-between">
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
              {onRemoveChampion && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full bg-destructive/90 hover:bg-destructive text-white hover:scale-110 transition-transform shadow-md"
                  onClick={() => onRemoveChampion(champion.id)}
                  aria-label={`Remove ${champion.name}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Skills */}
              {(champion.passive || champion.spells) && (
                <div>
                  <h4 className="text-sm font-semibold mb-3">스킬 쿨타임</h4>
                  <div className="space-y-4">
                    {/* Passive */}
                    {champion.passive && (
                      <div className="space-y-2">
                        <SkillTooltip
                          isPassive
                          passiveName={champion.passive.name}
                          passiveDescription={champion.passive.description}
                          passiveImageFull={champion.passive.image.full}
                          skill={{} as any}
                          skillIdx={0}
                          version={version}
                        />
                      </div>
                    )}
                    {/* Skills */}
                    {champion.spells?.map((skill, idx) => {
                      const maxRank = skill.maxrank;
                      const spellData = getSpellData(champion.id, idx);

                      return (
                        <div key={skill.id} className="space-y-2">
                          <SkillTooltip
                            skill={skill}
                            skillIdx={idx}
                            version={version}
                            spellData={spellData}
                          />
                          {/* 레벨별 쿨타임을 세로 스택으로 표시 */}
                          <div className="space-y-2 pl-12">
                            {Array.from({ length: maxRank }, (_, i) => {
                              const cooldown = getCooldownForLevel(skill, i + 1, spellData);
                              const displayValue = cooldown !== "" ? `${cooldown}s` : "-";

                              return (
                                <div
                                  key={i}
                                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-border/30"
                                >
                                  <span className="text-sm font-medium text-muted-foreground">
                                    {i + 1}레벨
                                  </span>
                                  <span className="text-base font-semibold">
                                    {displayValue}
                                  </span>
                                </div>
                              );
                            })}
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
      
      {/* Add Champion Button */}
      {onAddChampion && (
        <Card>
          <CardContent className="p-6">
            <Button
              onClick={() => setShowAddSlot(true)}
              variant="outline"
              className="w-full flex flex-row items-center justify-center gap-2 p-4 h-auto border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30 group"
            >
              <div className="w-10 h-10 rounded-full bg-muted/30 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                <Plus className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <span className="text-sm font-medium text-muted-foreground group-hover:text-primary transition-colors">
                챔피언 추가하기
              </span>
            </Button>
          </CardContent>
        </Card>
      )}

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
