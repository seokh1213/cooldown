import React from "react";
import { Card, CardContent } from "@/shared/ui/card";
import { useDeviceType } from "@/shared/hooks/useDeviceType";
import { StatsSectionDesktop } from "./stats/StatsSectionDesktop";
import { StatsSectionMobile } from "./stats/StatsSectionMobile";
import { SkillsSectionDesktop } from "./skills/SkillsSectionDesktop";
import { SkillsSectionMobile } from "./skills/SkillsSectionMobile";
import { ChampionComparisonProps } from "./types";

function ChampionComparison({
  champions,
  patchVersion,
  ddragonVersion,
  activeTab,
  championList,
  onAddChampion,
  onRemoveChampion,
  onReorderChampions,
}: ChampionComparisonProps) {
  const deviceType = useDeviceType();
  
  if (champions.length === 0) return null;

  const isMobile = deviceType === "mobile";

  return (
    <Card>
      <CardContent className="p-0">
        {activeTab === "stats" ? (
          isMobile ? (
            <StatsSectionMobile
              champions={champions}
              patchVersion={patchVersion}
              ddragonVersion={ddragonVersion}
              championList={championList}
              onAddChampion={onAddChampion}
              onRemoveChampion={onRemoveChampion}
            />
          ) : (
            <StatsSectionDesktop
              champions={champions}
              patchVersion={patchVersion}
              ddragonVersion={ddragonVersion}
              championList={championList}
              onAddChampion={onAddChampion}
              onRemoveChampion={onRemoveChampion}
              onReorderChampions={onReorderChampions}
            />
          )
        ) : (
          isMobile ? (
            <SkillsSectionMobile
              champions={champions}
              patchVersion={patchVersion}
              ddragonVersion={ddragonVersion}
              championList={championList}
              onAddChampion={onAddChampion}
              onRemoveChampion={onRemoveChampion}
            />
          ) : (
            <SkillsSectionDesktop
              champions={champions}
              patchVersion={patchVersion}
              ddragonVersion={ddragonVersion}
              championList={championList}
              onAddChampion={onAddChampion}
              onRemoveChampion={onRemoveChampion}
              onReorderChampions={onReorderChampions}
            />
          )
        )}
      </CardContent>
    </Card>
  );
}

export default React.memo(ChampionComparison);
