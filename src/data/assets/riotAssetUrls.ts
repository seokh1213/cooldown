/*
 * 목록에 쓰는 아이콘은 **미리 줄여 둔 사본**을 쓴다.
 *
 * Data Dragon 원본은 챔피언 128px PNG 27KB, 아이템 64px PNG 6.5KB 다. 1,041장이면
 * 10.2MB 인데 화면에서 가장 크게 쓰는 자리가 40px 이다. CI 가 96px/64px WebP 로
 * 줄여 `public/img/<ddragon>/` 에 넣어 두었고(1.9MB, 81% 절감) 여기서 그것을 가리킨다.
 *
 * 만드는 대상은 자료에 있는 챔피언·아이템 전부다. 빠지는 것이 생기면 시험이 잡는다.
 * 원본이 필요한 자리(스플래시)는 그대로 Data Dragon 을 본다.
 */
const local = (ddragonVersion: string, kind: string, name: string) =>
  `${import.meta.env.BASE_URL}img/${ddragonVersion}/${kind}/${name}.webp`;

export const championIconUrl = (ddragonVersion: string, fileName: string) =>
  local(ddragonVersion, "champion", fileName);

export const championSplashUrl = (championId: string, skinNum: number) =>
  `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${championId}_${skinNum}.jpg`;

export const passiveIconUrl = (ddragonVersion: string, fileName: string) =>
  `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/passive/${fileName}`;

export const spellIconUrl = (ddragonVersion: string, spellId: string) =>
  `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/spell/${spellId}.png`;

export const itemIconUrl = (ddragonVersion: string, itemId: string) =>
  local(ddragonVersion, "item", itemId);

export const summonerSpellIconUrl = (
  ddragonVersion: string,
  fileName: string
) =>
  `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/spell/${fileName}`;

export const runeIconUrl = (iconPath: string) =>
  `https://ddragon.leagueoflegends.com/cdn/img/${iconPath}`;
