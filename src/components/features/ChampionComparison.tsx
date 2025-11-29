import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { StatsSection } from "./ChampionComparison/StatsSection";
import { SkillsSection } from "./ChampionComparison/SkillsSection";
import { ChampionComparisonProps } from "./ChampionComparison/types";

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

