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
 * 예: "MonkeyKing" -> "MonkeyKing", "Aatrox" -> "Aatrox"
 * 대부분의 경우 그대로 사용하지만, 특수 케이스 처리 가능
 */
function convertChampionIdToCommunityDragon(championId: string): string {
  // Community Dragon은 대부분 챔피언 ID를 그대로 사용
  // 특수 케이스가 있다면 여기에 추가
  return championId;
}

/**
 * Community Dragon 데이터에서 스킬 순서 매핑 추출
 * CharacterRecords/Root의 spells 배열을 사용하여 스킬 순서 확인
 */
function extractSpellOrderMapping(
  data: Record<string, unknown>,
  championId: string
): string[] {
  const rootPath = `Characters/${championId}/CharacterRecords/Root`;
  const root = data[rootPath] as Record<string, unknown> | undefined;
  
  if (root && root.spells && Array.isArray(root.spells)) {
    // spells 배열에서 스킬 경로 추출 (전체 경로 반환)
    const spellPaths = root.spells as string[];
    return spellPaths;
  }
  
  return [];
}

/**
 * Community Dragon에서 챔피언의 스킬 데이터 가져오기
 * @param championId 챔피언 ID (예: "MonkeyKing")
 * @param version 버전 (선택적, 없으면 'latest' 사용)
 * @returns 스킬별 DataValues를 포함한 객체
 */
export async function getCommunityDragonSpellData(
  championId: string,
  version?: string
): Promise<Record<string, Record<string, (number | string)[]>>> {
  const versionPath = version || "latest";
  const cdChampionId = convertChampionIdToCommunityDragon(championId);
  const url = `https://raw.communitydragon.org/${versionPath}/game/data/characters/${cdChampionId}/${cdChampionId}.bin.json`;
  
  // 캐시 키 생성
  const cacheKey = `cd_spell_data_${versionPath}_${cdChampionId}`;
  
  // localStorage에서 캐시 확인
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && typeof parsed === "object") {
        return Promise.resolve(parsed);
      }
    }
  } catch (error) {
    console.warn("Failed to parse cached Community Dragon data:", error);
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    // 스킬 순서 매핑 추출
    const spellOrder = extractSpellOrderMapping(data, cdChampionId);
    
    // 스킬별 DataValues 추출
    const spellDataMap: Record<string, Record<string, (number | string)[]>> = {};
    
    // 스킬 순서에 따라 데이터 추출
    for (let i = 0; i < spellOrder.length; i++) {
      const spellPath = spellOrder[i];
      if (!spellPath) continue;
      
      // 전체 경로에서 스킬 객체 찾기
      const spellObj = data[spellPath] as Record<string, unknown> | undefined;
      
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
          
          if (Object.keys(dataValues).length > 0) {
            // 스킬 인덱스를 키로 사용 (Q=0, W=1, E=2, R=3)
            spellDataMap[i.toString()] = dataValues;
            // 스킬 이름도 키로 사용 (경로에서 마지막 부분)
            const spellName = spellPath.split("/").pop() || "";
            if (spellName) {
              spellDataMap[spellName] = dataValues;
            }
          }
        }
      }
    }
    
    // 추가로 모든 AbilityObject를 순회하며 누락된 스킬 찾기
    for (const key in data) {
      if (key.includes(`Characters/${cdChampionId}/Spells/`) && key.includes("Ability")) {
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
                
                if (Object.keys(dataValues).length > 0) {
                  spellDataMap[spellName] = dataValues;
                }
              }
            }
          }
        }
      }
    }
    
    // 캐싱
    try {
      localStorage.setItem(cacheKey, JSON.stringify(spellDataMap));
    } catch (error) {
      console.warn("Failed to cache Community Dragon data:", error);
    }
    
    return spellDataMap;
  } catch (error) {
    console.error("Failed to fetch Community Dragon data:", error);
    // 에러 발생 시 빈 객체 반환 (fallback)
    return {};
  }
}
