import Hangul from "hangul-js";
import { Champion } from "./types";

const VERSION_URL = "https://ddragon.leagueoflegends.com/api/versions.json";
const CHAMP_LIST_URL = (VERSION: string, LANG: string) =>
  `https://ddragon.leagueoflegends.com/cdn/${VERSION}/data/${LANG}/champion.json`;
const CHAMP_INFO_URL = (VERSION: string, LANG: string, NAME: string) =>
  `https://ddragon.leagueoflegends.com/cdn/${VERSION}/data/${LANG}/champion/${NAME}.json`;

export const SKILL_IMG_URL = (VERSION: string, NAME: string) =>
  `https://ddragon.leagueoflegends.com/cdn/${VERSION}/img/spell/${NAME}.png`;

export const SPLASH_IMG_URL = (NAME: string) =>
  `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${NAME}.jpg`;
export const LOADING_IMG_URL = (NAME: string) =>
  `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${NAME}.jpg`;
export const CHAMP_ICON_URL = (VERSION: string, NAME: string) =>
  `https://ddragon.leagueoflegends.com/cdn/${VERSION}/img/champion/${NAME}.png`;
export const PASSIVE_ICON_URL = (VERSION: string, NAME: string) =>
  `https://ddragon.leagueoflegends.com/cdn/${VERSION}/img/passive/${NAME}`;
export const SKILL_ICON_URL = (VERSION: string, NAME: string) =>
  `https://ddragon.leagueoflegends.com/cdn/${VERSION}/img/spell/${NAME}.png`;

interface ChampionData {
  data: {
    [key: string]: Champion;
  };
}

interface VersionResponse extends Array<string> {}

function fetchData<T>(URL: string, transform: (res: unknown) => T): Promise<T> {
  return fetch(URL)
    .then((res) => {
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      return res.json();
    })
    .then((res) => transform(res))
    .catch((err) => {
      console.error("API request failed:", err);
      throw err;
    });
}

export function getVersion(): Promise<string> {
  return fetchData<VersionResponse>(VERSION_URL, (res) => {
    if (Array.isArray(res) && res.length > 0 && typeof res[0] === "string") {
      return res[0];
    }
    throw new Error("Invalid version response format");
  });
}

/**
 * 오래된 버전의 캐시를 제거합니다.
 * 현재 버전이 아닌 모든 champion_info와 cd_spell_data 캐시를 삭제합니다.
 * @param currentVersion 현재 버전
 */
export function cleanOldVersionCache(currentVersion: string): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  try {
    const keysToRemove: string[] = [];
    
    // localStorage의 모든 키를 순회
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      // champion_info_로 시작하는 캐시 키 확인
      // 형식: champion_info_${version}_${lang}_${name}
      if (key.startsWith("champion_info_")) {
        const prefix = "champion_info_";
        const rest = key.substring(prefix.length);
        // 버전은 첫 번째 언더스코어 전까지 (예: "15.1.1_ko_KR_Aatrox" -> "15.1.1")
        const firstUnderscoreIndex = rest.indexOf("_");
        if (firstUnderscoreIndex > 0) {
          const version = rest.substring(0, firstUnderscoreIndex);
          if (version !== currentVersion) {
            keysToRemove.push(key);
          }
        } else {
          // 형식이 맞지 않으면 제거 (구형 캐시)
          keysToRemove.push(key);
        }
      }
      
      // cd_spell_data_로 시작하는 캐시 키 확인
      // 형식: cd_spell_data_${version}_${championId}
      if (key.startsWith("cd_spell_data_")) {
        const prefix = "cd_spell_data_";
        const rest = key.substring(prefix.length);
        // 버전은 첫 번째 언더스코어 전까지
        const firstUnderscoreIndex = rest.indexOf("_");
        if (firstUnderscoreIndex > 0) {
          const version = rest.substring(0, firstUnderscoreIndex);
          // unknown이나 latest는 제외 (버전 정보가 없는 경우)
          if (version !== currentVersion && version !== "unknown" && version !== "latest") {
            keysToRemove.push(key);
          }
        } else {
          // 구형 형식: cd_spell_data_${championId} (버전 없음)
          keysToRemove.push(key);
        }
      }
    }

    // 오래된 캐시 제거
    let removedCount = 0;
    for (const key of keysToRemove) {
      try {
        localStorage.removeItem(key);
        removedCount++;
      } catch (error) {
        console.warn(`Failed to remove cache key: ${key}`, error);
      }
    }

    if (removedCount > 0) {
      console.log(`[Cache] Removed ${removedCount} old version cache entries (current version: ${currentVersion})`);
    }
  } catch (error) {
    console.warn("[Cache] Failed to clean old version cache:", error);
  }
}

export function getChampionList(version: string, lang: string): Promise<Champion[]> {
  return fetchData<ChampionData>(CHAMP_LIST_URL(version, lang), (res) => {
    if (res && typeof res === "object" && "data" in res) {
      return res.data;
    }
    throw new Error("Invalid champion list response format");
  }).then((data) =>
    Object.values(data)
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      .map((e) => {
        const champion: Champion = {
          ...e,
          hangul:
            lang === "ko_KR"
              ? Hangul.d(e.name, true).reduce(
                  (acc: string, array: string[]) => acc + array[0],
                  ""
                )
              : "",
        };
        return champion;
      })
  );
}

export function getChampionInfo(version: string, lang: string, name: string): Promise<Champion> {
  // 캐시 키 생성: 버전과 언어를 포함하여 버전별 캐싱
  const cacheKey = `champion_info_${version}_${lang}_${name}`;
  
  // localStorage에서 캐시 확인
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      // 캐시된 데이터가 유효한지 확인
      if (parsed && typeof parsed === "object" && parsed.id) {
        return Promise.resolve(parsed);
      }
    }
  } catch (error) {
    // 캐시 파싱 실패 시 무시하고 API 호출
    console.warn("Failed to parse cached champion info:", error);
  }

  // 캐시가 없거나 유효하지 않으면 API 호출
  return fetchData<ChampionData>(
    CHAMP_INFO_URL(version, lang, name),
    (res) => {
      if (res && typeof res === "object" && "data" in res && name in res.data) {
        const championInfo = res.data[name];
        
        // API 응답을 localStorage에 캐싱
        try {
          localStorage.setItem(cacheKey, JSON.stringify(championInfo));
        } catch (error) {
          // localStorage 저장 실패 시 무시 (quota exceeded 등)
          console.warn("Failed to cache champion info:", error);
        }
        
        return championInfo;
      }
      throw new Error(`Champion ${name} not found`);
    }
  );
}

/**
 * 챔피언 ID를 Community Dragon 형식으로 변환
 * Community Dragon은 챔피언 이름을 소문자로 사용
 * 예: "MonkeyKing" -> "monkeyking", "Aatrox" -> "aatrox"
 */
function convertChampionIdToCommunityDragon(championId: string): string {
  // Community Dragon은 챔피언 ID를 소문자로 사용
  return championId.toLowerCase();
}

/**
 * Community Dragon 데이터에서 실제 챔피언 경로 찾기 (대소문자 구분)
 * 데이터 키에서 실제 챔피언 경로를 찾아 반환
 */
function findActualChampionPath(
  data: Record<string, unknown>,
  championId: string
): string | null {
  // 소문자로 변환한 챔피언 ID
  const lowerChampionId = championId.toLowerCase();
  
  // 가능한 경로 패턴들
  const possiblePaths = [
    `Characters/${championId}/CharacterRecords/Root`, // 원본 케이스
    `Characters/${lowerChampionId}/CharacterRecords/Root`, // 소문자
    `Characters/${championId.charAt(0).toUpperCase() + championId.slice(1).toLowerCase()}/CharacterRecords/Root`, // 첫 글자 대문자
  ];
  
  // 먼저 정확한 경로 확인
  for (const path of possiblePaths) {
    if (path in data) {
      return path.split('/').slice(0, 2).join('/'); // Characters/ChampionName 반환
    }
  }
  
  // 정확한 경로가 없으면 데이터 키에서 검색
  const matchingKeys = Object.keys(data).filter(key => {
    const keyLower = key.toLowerCase();
    return keyLower.includes(`characters/${lowerChampionId}/`) || 
           keyLower.includes(`characters/${championId.toLowerCase()}/`);
  });
  
  if (matchingKeys.length > 0) {
    // 첫 번째 매칭 키에서 챔피언 경로 추출
    const firstKey = matchingKeys[0];
    const match = firstKey.match(/Characters\/([^/]+)/i);
    if (match && match[1]) {
      return `Characters/${match[1]}`;
    }
  }
  
  return null;
}

/**
 * Community Dragon 데이터에서 스킬 순서 매핑 추출
 * CharacterRecords/Root의 spells 배열을 사용하여 스킬 순서 확인
 */
function extractSpellOrderMapping(
  data: Record<string, unknown>,
  championId: string
): { spellOrder: string[]; actualChampionPath: string | null } {
  const actualChampionPath = findActualChampionPath(data, championId);
  
  if (!actualChampionPath) {
    return { spellOrder: [], actualChampionPath: null };
  }
  
  const rootPath = `${actualChampionPath}/CharacterRecords/Root`;
  const root = data[rootPath] as Record<string, unknown> | undefined;
  
  if (root && root.spells && Array.isArray(root.spells)) {
    // spells 배열에서 스킬 경로 추출 (전체 경로 반환)
    const spellPaths = root.spells as string[];
    return { spellOrder: spellPaths, actualChampionPath };
  }
  
  return { spellOrder: [], actualChampionPath };
}

/**
 * Community Dragon에서 챔피언의 스킬 데이터 가져오기
 * @param championId 챔피언 ID (예: "MonkeyKing")
 * @param version 버전 (무시됨, 항상 'latest' 사용)
 * @returns 스킬별 DataValues를 포함한 객체
 */
export async function getCommunityDragonSpellData(
  championId: string,
  version?: string
): Promise<Record<string, Record<string, (number | string)[]>>> {
  // 버전은 항상 'latest'로 고정 (API 요청용)
  const versionPath = "latest";
  const cdChampionId = convertChampionIdToCommunityDragon(championId);
  const url = `https://raw.communitydragon.org/${versionPath}/game/data/characters/${cdChampionId}/${cdChampionId}.bin.json`;
  
  // 캐시 키 생성: 조회 시점의 Data Dragon 버전 정보를 키에 포함
  // 버전이 없으면 'unknown'을 사용 (하위 호환성)
  const versionForCache = version || 'unknown';
  const cacheKey = `cd_spell_data_${versionForCache}_${cdChampionId}`;
  
  // 이전 형식의 캐시 키 정리 (버전이 없는 구형 키 삭제)
  try {
    const oldCacheKeyWithoutVersion = `cd_spell_data_${cdChampionId}`;
    localStorage.removeItem(oldCacheKeyWithoutVersion);
    // latest가 포함된 구형 키도 정리
    const oldCacheKeyWithLatest = `cd_spell_data_latest_${cdChampionId}`;
    localStorage.removeItem(oldCacheKeyWithLatest);
  } catch (error) {
    // 정리 실패 시 무시
    console.warn("Failed to clean old cache keys:", error);
  }
  
  // localStorage에서 캐시 확인
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      // 빈 객체는 유효한 캐시로 간주하지 않음
      if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) {
        console.log(`[CD] Using cached data for ${cdChampionId}: ${Object.keys(parsed).length} keys`);
        return Promise.resolve(parsed);
      } else if (parsed && typeof parsed === "object" && Object.keys(parsed).length === 0) {
        // 빈 객체 캐시는 삭제
        console.warn(`[CD] Found empty cache for ${cdChampionId}, removing it`);
        localStorage.removeItem(cacheKey);
      }
    }
  } catch (error) {
    console.warn("[CD] Failed to parse cached Community Dragon data:", error);
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    // 원본 데이터 구조 확인
    console.log(`[CD] Raw data for ${cdChampionId}:`, {
      totalKeys: Object.keys(data).length,
      sampleKeys: Object.keys(data).slice(0, 20),
      rootPath: `Characters/${cdChampionId}/CharacterRecords/Root`,
      rootExists: `Characters/${cdChampionId}/CharacterRecords/Root` in data,
      spellKeys: Object.keys(data).filter(k => k.includes('Spells')),
      abilityKeys: Object.keys(data).filter(k => k.includes('Ability'))
    });
    
    // 스킬 순서 매핑 추출 (실제 챔피언 경로도 함께 찾기)
    const { spellOrder, actualChampionPath } = extractSpellOrderMapping(data, cdChampionId);
    
    if (!actualChampionPath) {
      console.warn(`[CD] Could not find champion path for ${cdChampionId}`);
      // 대체 경로 시도
      const altPaths = Object.keys(data).filter(k => 
        k.toLowerCase().includes('characterrecords') || 
        k.toLowerCase().includes('root')
      );
      console.log(`[CD] Alternative paths found:`, altPaths.slice(0, 10));
    } else {
      const rootPath = `${actualChampionPath}/CharacterRecords/Root`;
      const root = data[rootPath] as Record<string, unknown> | undefined;
      if (root) {
        console.log(`[CD] Root object keys for ${cdChampionId}:`, Object.keys(root));
        console.log(`[CD] Root object:`, root);
      }
    }
    
    console.log(`[CD] Champion: ${cdChampionId}, Actual path: ${actualChampionPath || 'not found'}, Spell order found: ${spellOrder.length} spells`, spellOrder);
    
    // 스킬별 DataValues 추출
    const spellDataMap: Record<string, Record<string, (number | string)[]>> = {};
    
    // 스킬 순서에 따라 데이터 추출
    for (let i = 0; i < spellOrder.length; i++) {
      const spellPath = spellOrder[i];
      if (!spellPath) continue;
      
      // 전체 경로에서 스킬 객체 찾기
      const spellObj = data[spellPath] as Record<string, unknown> | undefined;
      
      if (!spellObj) {
        console.warn(`[CD] Spell path not found: ${spellPath}`);
        continue;
      }
      
      if (spellObj && spellObj.mSpell) {
        const mSpell = spellObj.mSpell as Record<string, unknown>;
        if (mSpell.DataValues && Array.isArray(mSpell.DataValues)) {
          // DataValues를 변수명: 값 배열 형태로 변환
          const dataValues: Record<string, (number | string)[]> = {};
          for (const dv of mSpell.DataValues as Array<{ mName?: string; mValues?: (number | string)[] }>) {
            if (dv.mName && dv.mValues && Array.isArray(dv.mValues)) {
              dataValues[dv.mName] = dv.mValues;
            }
          }
          
          // mAmmoRechargeTime도 추가 (ammo 스킬용)
          if (mSpell.mAmmoRechargeTime && Array.isArray(mSpell.mAmmoRechargeTime)) {
            dataValues["mAmmoRechargeTime"] = mSpell.mAmmoRechargeTime as (number | string)[];
          }
          
          if (Object.keys(dataValues).length > 0) {
            // 스킬 인덱스를 키로 사용 (Q=0, W=1, E=2, R=3)
            spellDataMap[i.toString()] = dataValues;
            // 스킬 이름도 키로 사용 (경로에서 마지막 부분)
            const spellName = spellPath.split("/").pop() || "";
            if (spellName) {
              spellDataMap[spellName] = dataValues;
            }
            console.log(`[CD] Found spell ${i} (${spellName}): ${Object.keys(dataValues).length} data values`);
          } else {
            console.warn(`[CD] Spell ${i} (${spellPath}) has no data values`);
          }
        } else {
          console.warn(`[CD] Spell ${i} (${spellPath}) has no DataValues array`);
        }
      } else {
        console.warn(`[CD] Spell ${i} (${spellPath}) has no mSpell`);
      }
    }
    
    // 추가로 모든 AbilityObject를 순회하며 누락된 스킬 찾기
    let abilityObjectCount = 0;
    const championPathForSearch = actualChampionPath || `Characters/${cdChampionId}`;
    for (const key in data) {
      const keyLower = key.toLowerCase();
      const searchPathLower = championPathForSearch.toLowerCase();
      if (keyLower.includes(`${searchPathLower}/spells/`) && keyLower.includes("ability")) {
        abilityObjectCount++;
        const abilityObj = data[key] as Record<string, unknown> | undefined;
        if (abilityObj && abilityObj.mRootSpell) {
          const rootSpellPath = abilityObj.mRootSpell as string;
          const spellObj = data[rootSpellPath] as Record<string, unknown> | undefined;
          
          if (spellObj && spellObj.mSpell) {
            const mSpell = spellObj.mSpell as Record<string, unknown>;
            if (mSpell.DataValues && Array.isArray(mSpell.DataValues)) {
              const spellName = rootSpellPath.split("/").pop() || "";
              
              // 이미 추가된 스킬이 아니면 추가
              if (!spellDataMap[spellName]) {
                const dataValues: Record<string, (number | string)[]> = {};
                for (const dv of mSpell.DataValues as Array<{ mName?: string; mValues?: (number | string)[] }>) {
                  if (dv.mName && dv.mValues && Array.isArray(dv.mValues)) {
                    dataValues[dv.mName] = dv.mValues;
                  }
                }
                
                // mAmmoRechargeTime도 추가 (ammo 스킬용)
                if (mSpell.mAmmoRechargeTime && Array.isArray(mSpell.mAmmoRechargeTime)) {
                  dataValues["mAmmoRechargeTime"] = mSpell.mAmmoRechargeTime as (number | string)[];
                }
                
                if (Object.keys(dataValues).length > 0) {
                  spellDataMap[spellName] = dataValues;
                  console.log(`[CD] Found additional spell (${spellName}): ${Object.keys(dataValues).length} data values`);
                }
              }
            }
          }
        }
      }
    }
    console.log(`[CD] Scanned ${abilityObjectCount} ability objects`);
    
    // 데이터가 있을 때만 캐싱 (빈 객체는 캐싱하지 않음)
    const spellDataKeys = Object.keys(spellDataMap);
    console.log(`[CD] Final spell data map for ${cdChampionId}: ${spellDataKeys.length} keys`, spellDataKeys);
    
    if (spellDataKeys.length > 0) {
      try {
        localStorage.setItem(cacheKey, JSON.stringify(spellDataMap));
        console.log(`[CD] Successfully cached data for ${cdChampionId}`);
      } catch (error) {
        console.warn("[CD] Failed to cache Community Dragon data:", error);
      }
    } else {
      // 빈 객체인 경우 기존 캐시가 있다면 삭제
      try {
        localStorage.removeItem(cacheKey);
      } catch (error) {
        console.warn("[CD] Failed to remove empty cache:", error);
      }
      console.warn(`[CD] No spell data found for champion: ${cdChampionId}. Spell order: ${spellOrder.length}, Ability objects: ${abilityObjectCount}`);
    }
    
    return spellDataMap;
  } catch (error) {
    console.error("Failed to fetch Community Dragon data:", error);
    // 에러 발생 시 빈 객체 반환 (캐싱하지 않음)
    // 기존 캐시가 있다면 삭제
    try {
      localStorage.removeItem(cacheKey);
    } catch (removeError) {
      console.warn("Failed to remove cache on error:", removeError);
    }
    return {};
  }
}
