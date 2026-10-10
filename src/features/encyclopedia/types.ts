import type { Champion } from "@/domain/game/types";
import type { Language } from "@/shared/i18n";
import type { StaticDataSources } from "@/domain/game/contracts/staticData";

export interface EncyclopediaPageProps {
  championList: Champion[] | null;
  lang: Language;
  /** 정적 데이터 경로/캐시 키로 쓰는 Riot 공식 패치 버전 (예: 26.17) */
  patchVersion: string;
  /** Data Dragon CDN 요청용 내부 버전 (예: 16.17.1) */
  ddragonVersion: string;
  sources: StaticDataSources;
}
