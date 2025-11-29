import React, { useState } from "react";
import { Champion } from "@/types";
import { CHAMP_ICON_URL } from "@/services/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import ChampionSelector from "../ChampionSelector";
import { STAT_FIELDS } from "./constants";
import { SectionProps } from "./types";

export function StatsSectionMobile({
  champions,
  version,
  championList,
  onAddChampion,
  onRemoveChampion,
}: SectionProps) {
  const [showAddSlot, setShowAddSlot] = useState(false);

  return (
    <div className="space-y-4">
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
            <div className="space-y-2">
              {STAT_FIELDS.map((field) => {
                const value = champion.stats?.[field.key] ?? 0;
                return (
                  <div
                    key={field.key}
                    className="flex justify-between items-center py-3 px-2 border-b border-border/50 last:border-0"
                  >
                    <span className="text-sm font-medium">
                      {field.label}
                    </span>
                    <span className="text-sm font-semibold">{field.format(value)}</span>
                  </div>
                );
              })}
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
  );
}
