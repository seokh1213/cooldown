import { Champion } from "@/types";
import type { Language } from "@/i18n";
import type { StaticDataSources } from "@/data/contracts/staticData";

export interface ChampionWithInfo extends Champion {
  fullInfo?: Champion;
  isLoading?: boolean;
  skinIndex?: number;
}

export interface Tab {
  mode: 'normal';
  champions: string[]; // 챔피언 ID 한 명
  id: string; // 탭 고유 ID
}

export interface EncyclopediaPageProps {
  championList: Champion[] | null;
  lang: Language;
  /** 정적 데이터 경로/캐시 키로 쓰는 Riot 공식 패치 버전 (예: 26.17) */
  patchVersion: string;
  /** Data Dragon CDN 요청용 내부 버전 (예: 16.17.1) */
  ddragonVersion: string;
  sources: StaticDataSources;
}
