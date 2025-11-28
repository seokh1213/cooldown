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
