import Hangul from "hangul-js";
import { Champion } from "@/types";
import { logger } from "@/lib/logger";
import { getStaticDataPath } from "@/lib/staticDataUtils";

const VERSION_URL = "https://ddragon.leagueoflegends.com/api/versions.json";
const CHAMP_LIST_URL = (VERSION: string, LANG: string) =>
  `https://ddragon.leagueoflegends.com/cdn/${VERSION}/data/${LANG}/champion.json`;
const CHAMP_INFO_URL = (VERSION: string, LANG: string, NAME: string) =>
  `https://ddragon.leagueoflegends.com/cdn/${VERSION}/data/${LANG}/champion/${NAME}.json`;

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


async function fetchData<T>(URL: string, transform: (res: unknown) => T): Promise<T> {
  const res_1 = await fetch(URL);
  if (!res_1.ok) {
    const error = new Error(`HTTP error! status: ${res_1.status}`);
    logger.error("API request failed:", error);
    throw error;
  }
  
  try {
    const res_2 = await res_1.json();
    return transform(res_2);
  } catch (err) {
    logger.error("API request failed:", err);
    throw err;
  }
}

export async function getVersion(): Promise<string> {
  try {
    const basePath = import.meta.env.BASE_URL || '/';
    const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`;
    const versionUrl = `${normalizedBase}data/version.json`;
    const response = await fetch(versionUrl);
    
    if (response.ok) {
      const versionInfo = await response.json();
      if (versionInfo && versionInfo.version) {
        return versionInfo.version;
      }
    }
  } catch (error) {
    logger.warn("[Version] Failed to get version from static data, falling back to API:", error);
  }

  const latestVersion = await fetchData<string>(VERSION_URL, (res) => {
    if (Array.isArray(res) && res.length > 0 && typeof res[0] === "string") {
      return res[0];
    }
    throw new Error("Invalid version response format");
  });
  
  return latestVersion;
}

export function cleanOldVersionCache(currentVersion: string): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  try {
    const keysToRemove: string[] = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      if (key.startsWith("champion_list_")) {
        const rest = key.substring("champion_list_".length);
        const firstUnderscoreIndex = rest.indexOf("_");
        if (firstUnderscoreIndex > 0) {
          const version = rest.substring(0, firstUnderscoreIndex);
          if (version !== currentVersion) {
            keysToRemove.push(key);
          }
        } else {
          keysToRemove.push(key);
        }
      }
      
      if (key.startsWith("champion_info_")) {
        const rest = key.substring("champion_info_".length);
        const firstUnderscoreIndex = rest.indexOf("_");
        if (firstUnderscoreIndex > 0) {
          const version = rest.substring(0, firstUnderscoreIndex);
          if (version !== currentVersion) {
            keysToRemove.push(key);
          }
        } else {
          keysToRemove.push(key);
        }
      }
      
      if (key.startsWith("cd_spell_data_")) {
        const rest = key.substring("cd_spell_data_".length);
        const firstUnderscoreIndex = rest.indexOf("_");
        if (firstUnderscoreIndex > 0) {
          const version = rest.substring(0, firstUnderscoreIndex);
          if (version !== currentVersion && version !== "latest") {
            keysToRemove.push(key);
          }
        } else {
          keysToRemove.push(key);
        }
      }
    }

    for (const key of keysToRemove) {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        logger.warn(`Failed to remove cache key: ${key}`, error);
      }
    }
  } catch (error) {
    logger.warn("[Cache] Failed to clean old version cache:", error);
  }
}

export async function getChampionList(version: string, lang: string): Promise<Champion[]> {
  const cacheKey = `champion_list_${version}_${lang}`;
  
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && Array.isArray(parsed) && parsed.length > 0) {
        return Promise.resolve(parsed);
      }
    }
  } catch (error) {
    logger.warn("Failed to parse cached champion list:", error);
  }

  try {
    const staticUrl = getStaticDataPath(version, `champions-${lang}.json`);
    const response = await fetch(staticUrl);
    
    if (response.ok) {
      const staticData = await response.json();
      if (staticData && staticData.champions && Array.isArray(staticData.champions)) {
        const champions = staticData.champions
          .map((e: Champion) => {
            const champion: Champion = {
              ...e,
              hangul: lang === "ko_KR"
                ? Hangul.d(e.name, true).reduce(
                  (acc: string, array: string[]) => acc + array[0],
                  ""
                )
                : "",
            };
            return champion;
          });
        
        try {
          localStorage.setItem(cacheKey, JSON.stringify(champions));
        } catch (error) {
          logger.warn("Failed to cache champion list:", error);
        }
        
        return champions;
      }
    }
  } catch (error) {
    logger.warn("[StaticData] Failed to load champion list from static data, falling back to API:", error);
  }

  const data = await fetchData<ChampionData>(CHAMP_LIST_URL(version, lang), (res) => {
    if (res && typeof res === "object" && "data" in res) {
      return res as ChampionData;
    }
    throw new Error("Invalid champion list response format");
  });
  
  const champions = Object.values(data.data)
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((e) => {
      const champion: Champion = {
        ...e,
        hangul: lang === "ko_KR"
          ? Hangul.d(e.name, true).reduce(
            (acc: string, array: string[]) => acc + array[0],
            ""
          )
          : "",
      };
      return champion;
    });
  
  try {
    localStorage.setItem(cacheKey, JSON.stringify(champions));
  } catch (error) {
    logger.warn("Failed to cache champion list:", error);
  }
  
  return champions;
}

export async function getChampionInfo(version: string, lang: string, name: string): Promise<Champion> {
  const cacheKey = `champion_info_${version}_${lang}_${name}`;
  
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && typeof parsed === "object" && parsed.id) {
        return Promise.resolve(parsed);
      }
    }
  } catch (error) {
    logger.warn("Failed to parse cached champion info:", error);
  }

  try {
    const staticUrl = getStaticDataPath(version, 'champions', `${name}-${lang}.json`);
    const response = await fetch(staticUrl);
    
    if (response.ok) {
      const staticData = await response.json();
      if (staticData && staticData.champion) {
        const championInfo = staticData.champion;
        
        try {
          localStorage.setItem(cacheKey, JSON.stringify(championInfo));
        } catch (error) {
          logger.warn("Failed to cache champion info:", error);
        }
        
        return championInfo;
      }
    }
  } catch (error) {
    logger.warn("[StaticData] Failed to load champion info from static data, falling back to API:", error);
  }

  return fetchData<Champion>(
    CHAMP_INFO_URL(version, lang, name),
    (res) => {
      if (res && typeof res === "object" && "data" in res) {
        const data = res as ChampionData;
        if (name in data.data) {
          const championInfo = data.data[name];
          
          try {
            localStorage.setItem(cacheKey, JSON.stringify(championInfo));
          } catch (error) {
            logger.warn("Failed to cache champion info:", error);
          }
          
          return championInfo;
        }
      }
      throw new Error(`Champion ${name} not found`);
    }
  );
}

function convertChampionIdToCommunityDragon(championId: string): string {
  return championId.toLowerCase();
}

function findActualChampionPath(
  data: Record<string, unknown>,
  championId: string
): string | null {
  const lowerChampionId = championId.toLowerCase();
  const path = `Characters/${championId}/CharacterRecords/Root`;

  if (path in data) {
    return path.split('/').slice(0, 2).join('/');
  }

  const matchingKeys = Object.keys(data).filter(key => {
    const keyLower = key.toLowerCase();
    return keyLower.includes(`characters/${lowerChampionId}/`) || 
           keyLower.includes(`characters/${championId.toLowerCase()}/`);
  });
  
  if (matchingKeys.length > 0) {
    const firstKey = matchingKeys[0];
    const match = firstKey.match(/Characters\/([^/]+)/i);
    if (match && match[1]) {
      return `Characters/${match[1]}`;
    }
  }
  
  return null;
}

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
    const spellPaths = root.spells as string[];
    return { spellOrder: spellPaths, actualChampionPath };
  }
  
  return { spellOrder: [], actualChampionPath };
}

export interface CommunityDragonSpellResult {
  /** 스킬 데이터 맵 (인덱스/이름 -> 데이터) */
  spellDataMap: Record<string, Record<string, any>>;
  /** 실제로 사용한 CDragon 버전 (예: 15.23, latest). 정적 데이터에 없으면 null */
  cdragonVersion: string | null;
  /** 기준이 된 DDragon 버전 (정적 데이터의 version 또는 인자로 받은 version) */
  ddragonVersion: string | null;
}

export async function getCommunityDragonSpellData(
  championId: string,
  version?: string
): Promise<CommunityDragonSpellResult> {
  const cdChampionId = convertChampionIdToCommunityDragon(championId);
  const versionForCache = version || 'unknown';
  const cacheKey = `cd_spell_data_${versionForCache}_${cdChampionId}`;

  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && typeof parsed === "object") {
        // 새로운 포맷: { spellDataMap, cdragonVersion, ddragonVersion }
        if ("spellDataMap" in parsed && parsed.spellDataMap && typeof parsed.spellDataMap === "object") {
          const spellDataMap = parsed.spellDataMap as Record<string, Record<string, any>>;
          if (Object.keys(spellDataMap).length > 0) {
            return Promise.resolve({
              spellDataMap,
              cdragonVersion: typeof parsed.cdragonVersion === "string" ? parsed.cdragonVersion : null,
              ddragonVersion: typeof parsed.ddragonVersion === "string"
                ? parsed.ddragonVersion
                : (version || null),
            });
          }
        } else {
          // 이전 포맷: spellDataMap만 저장되어 있는 경우
          const legacyMap = parsed as Record<string, Record<string, any>>;
          if (Object.keys(legacyMap).length > 0) {
            return Promise.resolve({
              spellDataMap: legacyMap,
              cdragonVersion: null,
              ddragonVersion: version || null,
            });
          } else {
            localStorage.removeItem(cacheKey);
          }
        }
      }
    }
  } catch (error) {
    logger.warn("[CD] Failed to parse cached Community Dragon data:", error);
  }

  if (version) {
    try {
      const staticUrl = getStaticDataPath(version, 'spells', `${championId}.json`);
      const response = await fetch(staticUrl);
      
      if (response.ok) {
        const staticData = await response.json();
        
        if (staticData && staticData.spellData && typeof staticData.spellData === 'object') {
          const spellDataMap = staticData.spellData as Record<string, Record<string, any>>;
          const cdragonVersion =
            typeof staticData.cdragonVersion === "string" ? staticData.cdragonVersion : null;
          const ddragonVersion =
            typeof staticData.ddragonVersion === "string"
              ? staticData.ddragonVersion
              : (typeof staticData.version === "string" ? staticData.version : version || null);
          
          if (Object.keys(spellDataMap).length > 0) {
            const result: CommunityDragonSpellResult = {
              spellDataMap,
              cdragonVersion,
              ddragonVersion,
            };
            try {
              localStorage.setItem(cacheKey, JSON.stringify(result));
            } catch (error) {
              logger.warn("[CD] Failed to cache Community Dragon data:", error);
            }
            
            return result;
          }
        }
      }
    } catch (error) {
      logger.warn("[StaticData] Failed to load CD spell data from static data, falling back to API:", error);
    }
  } else {
    logger.warn(`[StaticData] No version provided for ${championId}, skipping static data and using API`);
  }

  const url = `https://raw.communitydragon.org/latest/game/data/characters/${cdChampionId}/${cdChampionId}.bin.json`;

  let response: Response;
  try {
    response = await fetch(url);
    if (!response.ok) {
      const error = new Error(`HTTP error! status: ${response.status}`);
      logger.error("Failed to fetch Community Dragon data:", error);
      try {
        localStorage.removeItem(cacheKey);
      } catch (removeError) {
        logger.warn("Failed to remove cache on error:", removeError);
      }
      return {};
    }
  } catch (error) {
    logger.error("Failed to fetch Community Dragon data:", error);
    try {
      localStorage.removeItem(cacheKey);
    } catch (removeError) {
      logger.warn("Failed to remove cache on error:", removeError);
    }
    return {};
  }

  try {
    const data = await response.json();
    
    const { spellOrder, actualChampionPath } = extractSpellOrderMapping(data, cdChampionId);
    
    if (!actualChampionPath) {
      logger.warn(`[CD] Could not find champion path for ${cdChampionId}`);
    }
    
    const spellDataMap: Record<string, Record<string, any>> = {};
    
    for (let i = 0; i < spellOrder.length; i++) {
      const spellPath = spellOrder[i];
      if (!spellPath) continue;
      
      // 전체 경로에서 스킬 객체 찾기
      const spellObj = data[spellPath] as Record<string, unknown> | undefined;
      
      if (!spellObj) {
        logger.warn(`[CD] Spell path not found: ${spellPath}`);
        continue;
      }
      
      if (spellObj && spellObj.mSpell) {
        const mSpell = spellObj.mSpell as Record<string, unknown>;
        const spellData: Record<string, any> = {};
        
        if (mSpell.DataValues && Array.isArray(mSpell.DataValues)) {
          const dataValues: Record<string, (number | string)[]> = {};
          for (const dv of mSpell.DataValues as Array<{ mName?: string; mValues?: (number | string)[] }>) {
            if (dv.mName && dv.mValues && Array.isArray(dv.mValues)) {
              dataValues[dv.mName] = dv.mValues;
            }
          }
          
          if (mSpell.mAmmoRechargeTime && Array.isArray(mSpell.mAmmoRechargeTime)) {
            dataValues["mAmmoRechargeTime"] = mSpell.mAmmoRechargeTime as (number | string)[];
          }
          
          if (Object.keys(dataValues).length > 0) {
            spellData.DataValues = dataValues;
          }
        }
        
        if (mSpell.mSpellCalculations && typeof mSpell.mSpellCalculations === 'object' && mSpell.mSpellCalculations !== null) {
          spellData.mSpellCalculations = mSpell.mSpellCalculations;
        }
        
        if (spellObj.mClientData && typeof spellObj.mClientData === 'object' && spellObj.mClientData !== null) {
          spellData.mClientData = spellObj.mClientData;
        }
        
        if (Object.keys(spellData).length > 0) {
          spellDataMap[i.toString()] = spellData;
          const spellName = spellPath.split("/").pop() || "";
          if (spellName) {
            spellDataMap[spellName] = spellData;
          }
        } else {
          logger.warn(`[CD] Spell ${i} (${spellPath}) has no extractable data`);
        }
      } else {
        logger.warn(`[CD] Spell ${i} (${spellPath}) has no mSpell`);
      }
    }
    
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
            const spellName = rootSpellPath.split("/").pop() || "";
            
            if (!spellDataMap[spellName]) {
              const spellData: Record<string, any> = {};
              
              if (mSpell.DataValues && Array.isArray(mSpell.DataValues)) {
                const dataValues: Record<string, (number | string)[]> = {};
                for (const dv of mSpell.DataValues as Array<{ mName?: string; mValues?: (number | string)[] }>) {
                  if (dv.mName && dv.mValues && Array.isArray(dv.mValues)) {
                    dataValues[dv.mName] = dv.mValues;
                  }
                }
                
                if (mSpell.mAmmoRechargeTime && Array.isArray(mSpell.mAmmoRechargeTime)) {
                  dataValues["mAmmoRechargeTime"] = mSpell.mAmmoRechargeTime as (number | string)[];
                }
                
                if (Object.keys(dataValues).length > 0) {
                  spellData.DataValues = dataValues;
                }
              }
              
              if (mSpell.mSpellCalculations && typeof mSpell.mSpellCalculations === 'object' && mSpell.mSpellCalculations !== null) {
                spellData.mSpellCalculations = mSpell.mSpellCalculations;
              }
              
              if (spellObj.mClientData && typeof spellObj.mClientData === 'object' && spellObj.mClientData !== null) {
                spellData.mClientData = spellObj.mClientData;
              }
              
              if (Object.keys(spellData).length > 0) {
                spellDataMap[spellName] = spellData;
              }
            }
          }
        }
      }
    }
    
    const spellDataKeys = Object.keys(spellDataMap);
    
    if (spellDataKeys.length > 0) {
      const result: CommunityDragonSpellResult = {
        spellDataMap,
        cdragonVersion: "latest",
        ddragonVersion: version || null,
      };
      try {
        localStorage.setItem(cacheKey, JSON.stringify(result));
      } catch (error) {
        logger.warn("[CD] Failed to cache Community Dragon data:", error);
      }
      return result;
    } else {
      try {
        localStorage.removeItem(cacheKey);
      } catch (error) {
        logger.warn("[CD] Failed to remove empty cache:", error);
      }
      logger.warn(`[CD] No spell data found for champion: ${cdChampionId}. Spell order: ${spellOrder.length}, Ability objects: ${abilityObjectCount}`);
      return {
        spellDataMap: {},
        cdragonVersion: null,
        ddragonVersion: version || null,
      };
    }
  } catch (error) {
    logger.error("Failed to parse Community Dragon data:", error);
    try {
      localStorage.removeItem(cacheKey);
    } catch (removeError) {
      logger.warn("Failed to remove cache on error:", removeError);
    }
    return {
      spellDataMap: {},
      cdragonVersion: null,
      ddragonVersion: version || null,
    };
  }
}
