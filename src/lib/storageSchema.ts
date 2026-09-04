/**
 * localStorage / sessionStorage에 실제로 직렬화되어 저장되는 데이터들의 스키마 정의
 *
 * 앱 소유 키와 명시적인 스키마 버전은 data/storage/appStorage.ts에서 관리한다.
 *
 * - "상태(state)" 로직에서 사용하는 스토리지 구조는 반드시 여기 타입으로 표현하고,
 * - 구조를 바꿀 때 이 파일의 타입도 함께 수정하는 것을 원칙으로 한다.
 */



/**
 * 앱 전역 설정
 */
export type StorageTheme = "light" | "dark";
export type StorageLanguage = "ko_KR" | "en_US" | "zh_CN";

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
 * 저장된 값은 appStorage의 decoder를 통과한 뒤에만 앱 상태로 복원한다.
 */
