console.log("123");

fetch("http://ddragon.leagueoflegends.com/cdn/10.8.1/data/ko_KR/champion.json")
  .then((res) => res.json())
  .then((res) => console.log(res.data));
