import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useDeviceType } from "@/hooks/useDeviceType";
import { StatsSectionDesktop } from "./ChampionComparison/StatsSectionDesktop";
import { StatsSectionMobile } from "./ChampionComparison/StatsSectionMobile";
import { SkillsSectionDesktop } from "./ChampionComparison/SkillsSectionDesktop";
import { SkillsSectionMobile } from "./ChampionComparison/SkillsSectionMobile";
import { ChampionComparisonProps } from "./ChampionComparison/types";

function ChampionComparison({
  champions,
  version,
  activeTab,
  championList,
  onAddChampion,
  onRemoveChampion,
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
              version={version}
              championList={championList}
              onAddChampion={onAddChampion}
              onRemoveChampion={onRemoveChampion}
            />
          ) : (
            <StatsSectionDesktop
              champions={champions}
              version={version}
              championList={championList}
              onAddChampion={onAddChampion}
              onRemoveChampion={onRemoveChampion}
            />
          )
        ) : (
          isMobile ? (
            <SkillsSectionMobile
              champions={champions}
              version={version}
              championList={championList}
              onAddChampion={onAddChampion}
              onRemoveChampion={onRemoveChampion}
            />
          ) : (
            <SkillsSectionDesktop
              champions={champions}
              version={version}
              championList={championList}
              onAddChampion={onAddChampion}
              onRemoveChampion={onRemoveChampion}
            />
          )
        )}
      </CardContent>
    </Card>
  );
}

export default React.memo(ChampionComparison);

