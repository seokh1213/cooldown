import { Champion } from "@/types";
import type { StoredSelectedChampionList } from "@/lib/storageSchema";

export interface ChampionWithInfo extends Champion {
  fullInfo?: Champion;
  isLoading?: boolean;
  skinIndex?: number;
}

export interface Tab {
  mode: 'vs' | 'normal';
  champions: string[]; // 챔피언 ID 배열 (vs: 2명, normal: 1명)
  id: string; // 탭 고유 ID
}

export interface VsSelectorMode {
  mode: 'select-second' | 'change-champion-a' | 'change-champion-b';
  tabId: string; // VS 모드를 시작하는 탭 ID
  championIndex?: number; // 변경할 챔피언 인덱스 (change 모드일 때만)
}

export interface EncyclopediaPageProps {
  lang: string;
  championList: Champion[] | null;
  version: string;
  cdragonVersion: string | null;
  initialSelectedChampions: StoredSelectedChampionList | null;
  initialTabs: Tab[] | null;
  initialSelectedTabId: string | null;
}

