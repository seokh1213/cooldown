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
  return fetchData<ChampionData>(
    CHAMP_INFO_URL(version, lang, name),
    (res) => {
      if (res && typeof res === "object" && "data" in res && name in res.data) {
        return res.data[name];
      }
      throw new Error(`Champion ${name} not found`);
    }
  );
}
