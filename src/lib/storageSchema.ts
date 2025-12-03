/**
 * localStorage / sessionStorage에 실제로 직렬화되어 저장되는 데이터들의 스키마 정의
 *
 * 이 파일은 Vite 빌드 시 해싱되어 `VITE_DEPLOYMENT_VERSION`을 만드는 데 사용된다.
 * 즉, 여기 정의된 타입(= 스키마)을 변경하면 배포 버전 해시가 바뀌고,
 * `checkAndClearStorageIfVersionMismatch`에 의해 한 번 전체 스토리지가 초기화된다.
 *
 * - "상태(state)" 로직에서 사용하는 스토리지 구조는 반드시 여기 타입으로 표현하고,
 * - 구조를 바꿀 때 이 파일의 타입도 함께 수정하는 것을 원칙으로 한다.
 */

import type { Champion } from "@/types";

/**
 * 앱 전역 설정
 */
export type StorageTheme = "light" | "dark";
export type StorageLanguage = "ko_KR" | "en_US";

/**
 * 챔피언 리스트 캐시 (champion_list_{version}_{lang})
 *
 * 현재는 도메인 타입 `Champion` 그대로를 저장하고 있음.
 * 만약 저장 구조를 슬림하게 바꾸고 싶다면 별도의 타입을 정의하고
 * 직렬화 시 이 타입으로 매핑하도록 리팩터링한다.
 */
export type StoredChampionListItem = Champion;
export type StoredChampionList = StoredChampionListItem[];

/**
 * 개별 챔피언 상세 캐시 (champion_info_{version}_{lang}_{name})
 * Data Dragon에서 내려오는 챔피언 상세 구조를 거의 그대로 저장.
 * 필요 시 별도 저장 타입으로 분리 가능.
 */
export type StoredChampionInfo = Champion;

/**
 * 백과사전에서 "선택된 챔피언 목록"을 직렬화할 때 사용하는 최소 정보
 * (encyclopedia_selected_champions)
 *
 * - id / key 만 저장하고, 나머지 메타 정보(name, title 등)는
 *   항상 최신 championList / championInfo에서 재구성한다.
 * - 이렇게 하면 Champion 타입 내부 구조 변경에 덜 민감해져서,
 *   선택했던 챔피언이 사소한 스키마 변경 때문에 날아갈 가능성을 줄인다.
 */
export interface StoredSelectedChampion {
  id: string;
  key?: string;
}

export type StoredSelectedChampionList = StoredSelectedChampion[];

/**
 * Community Dragon 스펠 데이터 캐시 (cd_spell_data_{version}_{championId})
 *
 * V2 스키마부터는 단순 맵이 아니라 메타데이터를 포함한 래퍼 객체를 저장한다:
 *
 * {
 *   spellDataMap: {
 *     "0": { ...CdSpellDataEntry },
 *     "Q": { ...CdSpellDataEntry },
 *     ...
 *   },
 *   cdragonVersion: "15.23" | "15.24" | "latest" | null, // 실제 CDragon 기준 버전
 *   ddragonVersion: "15.24.1" | null                     // 이 데이터가 대응하는 DDragon 버전
 * }
 *
 * 기존 V1 캐시는 CdSpellDataMap 그 자체를 저장하고 있었고,
 * 런타임에서 두 포맷을 모두 읽을 수 있도록 후방 호환 처리가 되어 있다.
 * 스키마 기준으로는 이 V2 형태를 최신으로 간주한다.
 */
export interface CdSpellDataEntry {
  DataValues?: Record<string, (number | string)[]>;
  mSpellCalculations?: Record<string, unknown>;
  mClientData?: Record<string, unknown>;
}

export type CdSpellDataMap = Record<string, CdSpellDataEntry>;

/**
 * cd_spell_data_* 키에 저장되는 실제 최상위 스키마 (V2)
 */
export interface StoredCdSpellCache {
  spellDataMap: CdSpellDataMap;
  cdragonVersion: string | null;
  ddragonVersion: string | null;
}

/**
 * 백과사전 탭/선택 챔피언 등 "상태" 관련 스키마는
 * 현재 `storageValidator.ts` 안에서 정의/검증하고 있으며,
 * 그 파일 자체도 해싱 대상에 포함된다.
 * 필요하면 해당 타입들을 여기로 옮겨서 일원화할 수 있다.
 */


