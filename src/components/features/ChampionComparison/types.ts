import { Champion } from "@/types";

export interface ChampionComparisonProps {
  champions: Champion[];
  version: string;
  activeTab: "stats" | "skills";
  championList?: Champion[] | null;
  onAddChampion?: (champion: Champion) => void;
  onRemoveChampion?: (championId: string) => void;
  onReorderChampions?: (oldIndex: number, newIndex: number) => void;
  vsMode?: {
    championA: Champion;
    championB: Champion;
  };
}

export interface SectionProps {
  champions: Champion[];
  version: string;
  championList?: Champion[] | null;
  onAddChampion?: (champion: Champion) => void;
  onRemoveChampion?: (championId: string) => void;
  onReorderChampions?: (oldIndex: number, newIndex: number) => void;
  vsMode?: {
    championA: Champion;
    championB: Champion;
  };
}

