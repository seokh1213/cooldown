/**
 * localStorage 데이터 구조 버전 관리 및 유효성 검사
 */

import { logger } from "./logger";

// 데이터 구조 버전 (구조가 변경되면 이 값을 증가시켜야 함)
export const DATA_STRUCTURE_VERSION = 1;

// localStorage 키와 버전 키 매핑
const STORAGE_VERSION_KEYS = {
  "encyclopedia_selected_champions": "encyclopedia_selected_champions_version",
  "encyclopedia_tabs": "encyclopedia_tabs_version",
  "encyclopedia_selected_tab_id": "encyclopedia_selected_tab_id_version",
} as const;

// Tab 인터페이스 유효성 검사
interface Tab {
  mode: 'vs' | 'normal';
  champions: string[]; // 챔피언 ID 배열 (vs: 2명, normal: 1명)
  id: string; // 탭 고유 ID
}

/**
 * Tab 배열의 유효성 검사
 */
function isValidTabArray(data: unknown): data is Tab[] {
  if (!Array.isArray(data)) {
    return false;
  }

  return data.every((tab) => {
    if (!tab || typeof tab !== 'object') {
      return false;
    }

    // mode 검사
    if (tab.mode !== 'vs' && tab.mode !== 'normal') {
      return false;
    }

    // champions 검사
    if (!Array.isArray(tab.champions)) {
      return false;
    }

    // champions가 모두 문자열인지 확인
    if (!tab.champions.every((id: unknown) => typeof id === 'string')) {
      return false;
    }

    // mode에 따른 champions 개수 검사
    if (tab.mode === 'normal' && tab.champions.length !== 1) {
      return false;
    }
    if (tab.mode === 'vs' && tab.champions.length !== 2) {
      return false;
    }

    // id 검사
    if (typeof tab.id !== 'string' || tab.id.length === 0) {
      return false;
    }

    return true;
  });
}

/**
 * Champion 배열의 유효성 검사 (최소한의 필수 필드만 확인)
 */
function isValidChampionArray(data: unknown): boolean {
  if (!Array.isArray(data)) {
    return false;
  }

  return data.every((champion) => {
    if (!champion || typeof champion !== 'object') {
      return false;
    }

    // 최소한 id는 있어야 함
    if (typeof champion.id !== 'string' || champion.id.length === 0) {
      return false;
    }

    return true;
  });
}

/**
 * 특정 localStorage 키의 데이터 구조 버전 확인 및 유효성 검사
 */
function validateStorageData(
  key: string,
  validator: (data: unknown) => boolean
): boolean {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) {
      return true; // 데이터가 없으면 유효함
    }

    const parsed = JSON.parse(stored);
    
    // 유효성 검사
    if (!validator(parsed)) {
      logger.warn(`Invalid data structure for ${key}, clearing...`);
      localStorage.removeItem(key);
      // 버전 정보도 삭제
      const versionKey = STORAGE_VERSION_KEYS[key as keyof typeof STORAGE_VERSION_KEYS];
      if (versionKey) {
        localStorage.removeItem(versionKey);
      }
      return false;
    }

    // 버전 확인
    const versionKey = STORAGE_VERSION_KEYS[key as keyof typeof STORAGE_VERSION_KEYS];
    if (versionKey) {
      const storedVersion = localStorage.getItem(versionKey);
      if (storedVersion !== String(DATA_STRUCTURE_VERSION)) {
        logger.warn(`Data structure version mismatch for ${key}, clearing...`);
        localStorage.removeItem(key);
        localStorage.removeItem(versionKey);
        return false;
      }
    }

    return true;
  } catch (error) {
    logger.error(`Error validating ${key}:`, error);
    // 파싱 실패 시 데이터 삭제
    localStorage.removeItem(key);
    const versionKey = STORAGE_VERSION_KEYS[key as keyof typeof STORAGE_VERSION_KEYS];
    if (versionKey) {
      localStorage.removeItem(versionKey);
    }
    return false;
  }
}

/**
 * 모든 localStorage 데이터의 유효성 검사 및 버전 확인
 * splash 화면이 띄워질 때 호출되어야 함
 */
export function validateAllStorageData(): void {
  // 탭 데이터 검사
  validateStorageData("encyclopedia_tabs", isValidTabArray);

  // 챔피언 데이터 검사
  validateStorageData("encyclopedia_selected_champions", isValidChampionArray);

  // 선택된 탭 ID는 단순 문자열이므로 별도 검사 불필요
  // 하지만 버전이 맞지 않으면 삭제
  const selectedTabIdVersionKey = STORAGE_VERSION_KEYS["encyclopedia_selected_tab_id"];
  if (selectedTabIdVersionKey) {
    const storedVersion = localStorage.getItem(selectedTabIdVersionKey);
    if (storedVersion !== String(DATA_STRUCTURE_VERSION)) {
      localStorage.removeItem("encyclopedia_selected_tab_id");
      localStorage.removeItem(selectedTabIdVersionKey);
    }
  }
}

/**
 * 데이터를 저장할 때 버전 정보도 함께 저장
 */
export function setStorageWithVersion(key: string, value: string): void {
  localStorage.setItem(key, value);
  const versionKey = STORAGE_VERSION_KEYS[key as keyof typeof STORAGE_VERSION_KEYS];
  if (versionKey) {
    localStorage.setItem(versionKey, String(DATA_STRUCTURE_VERSION));
  }
}

/**
 * 데이터를 삭제할 때 버전 정보도 함께 삭제
 */
export function removeStorageWithVersion(key: string): void {
  localStorage.removeItem(key);
  const versionKey = STORAGE_VERSION_KEYS[key as keyof typeof STORAGE_VERSION_KEYS];
  if (versionKey) {
    localStorage.removeItem(versionKey);
  }
}

