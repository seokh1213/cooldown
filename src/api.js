const VERSION_URL = "https://ddragon.leagueoflegends.com/api/versions.json";
const CHAMP_LIST_URL = (VERSION, LANG) =>
  `https://ddragon.leagueoflegends.com/cdn/${VERSION}/data/${LANG}/champion.json`;
const CHAMP_INFO_URL = (VERSION, LANG, NAME) =>
  `https://ddragon.leagueoflegends.com/cdn/${VERSION}/data/${LANG}/champion/${NAME}.json`;

export const SKILL_IMG_URL = (VERSION, NAME) =>
  `https://ddragon.leagueoflegends.com/cdn/${VERSION}/img/spell/${NAME}.png`;

export const SPLASH_IMG_URL = (NAME) =>
  `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${NAME}.jpg`;
export const LOADING_IMG_URL = (NAME) =>
  `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${NAME}.jpg`;
export const CHAMP_ICON_URL = (VERSION, NAME) =>
  `https://ddragon.leagueoflegends.com/cdn/${VERSION}/img/champion/${NAME}.png`;
export const PASSIVE_ICON_URL = (VERSION, NAME) =>
  `https://ddragon.leagueoflegends.com/cdn/${VERSION}/img/passive/${NAME}`;
export const SKILL_ICON_URL = (VERSION, NAME) =>
  `https://ddragon.leagueoflegends.com/cdn/${VERSION}/img/spell/${NAME}.png`;

function fetchData(URL, f) {
  return fetch(URL)
    .then((res) => res.json())
    .then((res) => f(res))
    .catch((err) => console.log(err));
}

export function getVersion() {
  return fetchData(VERSION_URL, (res) => res[0]);
}

export function getChampionList(version, lang) {
  return fetchData(CHAMP_LIST_URL(version, lang), (res) => res.data).then(
    (data) =>
      Object.values(data).sort((a, b) => {
        return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
      })
  );
}
export function getChampionInfo(version, lang, name) {
  return fetchData(
    CHAMP_INFO_URL(version, lang, name),
    (res) => res.data[name]
  );
}
