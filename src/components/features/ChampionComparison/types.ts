import { Champion } from "@/types";

export interface ChampionComparisonProps {
  champions: Champion[];
  /** 정적 데이터 경로/캐시 키로 쓰는 Riot 공식 패치 버전 */
  patchVersion: string;
  /** Data Dragon CDN 요청용 내부 버전 */
  ddragonVersion: string;
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
  /** 정적 데이터 경로/캐시 키로 쓰는 Riot 공식 패치 버전 */
  patchVersion: string;
  /** Data Dragon CDN 요청용 내부 버전 */
  ddragonVersion: string;
  championList?: Champion[] | null;
  onAddChampion?: (champion: Champion) => void;
  onRemoveChampion?: (championId: string) => void;
  onReorderChampions?: (oldIndex: number, newIndex: number) => void;
  vsMode?: {
    championA: Champion;
    championB: Champion;
  };
}
