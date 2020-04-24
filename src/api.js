const VERSION_URL = "https://ddragon.leagueoflegends.com/api/versions.json";
const CHAMPLIST_URL = (VERSION) =>
  `https://ddragon.leagueoflegends.com/cdn/${VERSION}/data/ko_KR/champion.json`;
const CHAMPINFO_URL = (VERSION, NAME) =>
  `https://ddragon.leagueoflegends.com/cdn/${VERSION}/data/ko_KR/champion/${NAME}.json`;
export const CHAMPIONIMG_URL = (VERSION, NAME) =>
  `http://ddragon.leagueoflegends.com/cdn/${VERSION}/img/champion/${NAME}.png`;

function fetchData(URL, f) {
  return fetch(URL)
    .then((res) => res.json())
    .then((res) => f(res))
    .catch((err) => console.log(err));
}

export function getVersion() {
  return fetchData(VERSION_URL, (res) => res[0]);
}

export function getChampionList(version) {
  return fetchData(CHAMPLIST_URL(version), (res) => res.data);
}
export function getChampionInfo(version, name) {
  return fetchData(CHAMPINFO_URL(version, name), (res) => res.data[name]);
}
