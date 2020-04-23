const VERSION_URL = "https://ddragon.leagueoflegends.com/api/versions.json";
const CHAMPLIST_URL = (VERSION) =>
  `https://ddragon.leagueoflegends.com/cdn/${VERSION}/data/ko_KR/champion.json`;

function fetchData(URL, f) {
  return fetch(URL)
    .then((res) => res.json())
    .then((res) => f(res))
    .catch((err) => console.log(err));
}

async function main() {
  const VERSION = await fetchData(VERSION_URL, (res) => res[0]);
  const championList = await fetchData(
    CHAMPLIST_URL(VERSION),
    (res) => res.data
  );
  console.log(championList);
}
