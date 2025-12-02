/**
 * localStorage 데이터 구조 버전 관리 및 유효성 검사
 */

import { logger } from "./logger";

// 데이터 구조 버전 (구조가 변경되면 이 값을 증가시켜야 함)
export const DATA_STRUCTURE_VERSION = 1;

// 배포 버전 해시 키 (로컬 스토리지에 저장되는 키)
const DEPLOYMENT_VERSION_STORAGE_KEY = "app_deployment_version";

// 현재 배포 버전 해시 (빌드 시점에 주입됨)
const CURRENT_DEPLOYMENT_VERSION = import.meta.env.VITE_DEPLOYMENT_VERSION || "dev";

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

/**
 * 모든 localStorage 데이터를 초기화
 */
function clearAllLocalStorage(): void {
  try {
    // 모든 localStorage 키를 가져와서 삭제
    const keys = Object.keys(localStorage);
    keys.forEach((key) => {
      localStorage.removeItem(key);
    });
    logger.info("All localStorage data cleared");
  } catch (error) {
    logger.error("Error clearing localStorage:", error);
  }
}

/**
 * 배포 버전을 확인하고, 버전이 다르면 모든 로컬 스토리지 데이터를 초기화
 * 스플래시 로딩 시점에 호출되어야 함
 */
export function checkAndClearStorageIfVersionMismatch(): void {
  try {
    const storedVersion = localStorage.getItem(DEPLOYMENT_VERSION_STORAGE_KEY);
    
    // 저장된 버전이 없거나 현재 버전과 다르면 모든 데이터 초기화
    if (storedVersion !== CURRENT_DEPLOYMENT_VERSION) {
      logger.warn(
        `Deployment version mismatch. Stored: ${storedVersion}, Current: ${CURRENT_DEPLOYMENT_VERSION}. Clearing all localStorage data.`
      );
      clearAllLocalStorage();
      
      // 새로운 배포 버전 저장
      localStorage.setItem(DEPLOYMENT_VERSION_STORAGE_KEY, CURRENT_DEPLOYMENT_VERSION);
    } else {
      logger.debug(`Deployment version matches: ${CURRENT_DEPLOYMENT_VERSION}`);
    }
  } catch (error) {
    logger.error("Error checking deployment version:", error);
    // 에러 발생 시 안전을 위해 초기화
    clearAllLocalStorage();
    try {
      localStorage.setItem(DEPLOYMENT_VERSION_STORAGE_KEY, CURRENT_DEPLOYMENT_VERSION);
    } catch (e) {
      logger.error("Failed to set deployment version:", e);
    }
  }
}

