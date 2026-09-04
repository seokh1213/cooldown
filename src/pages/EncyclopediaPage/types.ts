import { Champion } from "@/types";
import type { Language } from "@/i18n";
import type { StaticDataSources } from "@/data/contracts/staticData";

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
  lang: Language;
  /** 정적 데이터 경로/캐시 키로 쓰는 Riot 공식 패치 버전 (예: 26.17) */
  patchVersion: string;
  /** Data Dragon CDN 요청용 내부 버전 (예: 16.17.1) */
  ddragonVersion: string;
  sources: StaticDataSources;
}
