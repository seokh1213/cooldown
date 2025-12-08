/**
 * localStorage / sessionStorage에 실제로 직렬화되어 저장되는 데이터들의 스키마 정의
 *
 * 이 파일은 Vite 빌드 시 해싱되어 `VITE_SERIALIZATION_VERSION`을 만드는 데 사용된다.
 * 즉, 여기 정의된 타입(= 스키마)을 변경하면 직렬화 버전 해시가 바뀌고,
 * `checkAndClearStorageIfVersionMismatch`에 의해 한 번 전체 스토리지가 초기화된다.
 *
 * - "상태(state)" 로직에서 사용하는 스토리지 구조는 반드시 여기 타입으로 표현하고,
 * - 구조를 바꿀 때 이 파일의 타입도 함께 수정하는 것을 원칙으로 한다.
 */



/**
 * 앱 전역 설정
 */
export type StorageTheme = "light" | "dark";
export type StorageLanguage = "ko_KR" | "en_US";

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
 * 백과사전 탭/선택 챔피언 등 "상태" 관련 스키마는
 * 현재 `storageValidator.ts` 안에서 정의/검증하고 있으며,
 * 그 파일 자체도 해싱 대상에 포함된다.
 * 필요하면 해당 타입들을 여기로 옮겨서 일원화할 수 있다.
 */


