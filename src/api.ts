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

function fetchData<T>(URL: string, f: (res: any) => T): Promise<T> {
  return fetch(URL)
    .then((res) => res.json())
    .then((res) => f(res))
    .catch((err) => {
      console.log(err);
      throw err;
    });
}

export function getVersion(): Promise<string> {
  return fetchData<string[]>(VERSION_URL, (res) => res[0]);
}

export function getChampionList(version: string, lang: string): Promise<Champion[]> {
  return fetchData<ChampionData>(CHAMP_LIST_URL(version, lang), (res) => res.data).then(
    (data) =>
      Object.values(data)
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
        .map((e) => {
          e["hangul"] =
            lang === "ko_KR"
              ? Hangul.d(e.name, true).reduce(
                  (acc: string, array: string[]) => acc + array[0],
                  ""
                )
              : "";
          return e;
        })
  );
}

export function getChampionInfo(version: string, lang: string, name: string): Promise<Champion> {
  return fetchData<ChampionData>(
    CHAMP_INFO_URL(version, lang, name),
    (res) => res.data[name]
  );
}

