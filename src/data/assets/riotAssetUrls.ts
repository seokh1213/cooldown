/*
 * 목록에 쓰는 아이콘은 **미리 줄여 둔 사본**을 쓴다.
 *
 * Data Dragon 원본은 챔피언 128px PNG 27KB, 아이템 64px PNG 6.5KB 다. 1,041장이면
 * 10.2MB 인데 화면에서 가장 크게 쓰는 자리가 40px 이다. CI 가 96px/64px WebP 로
 * 줄여 `public/img/<ddragon>/` 에 넣어 두었고(1.9MB, 81% 절감) 여기서 그것을 가리킨다.
 *
 * 만드는 대상은 자료에 있는 것 전부다 — 챔피언·아이템·룬·소환사 주문·스킬·패시브.
 * 빠지는 것이 생기면 시험이 잡는다.
 *
 * 스플래시 아트만 그대로 Data Dragon 을 본다. 한 장이 수백 KB 이고 스킨마다 따로라,
 * 줄여 두는 값보다 저장소에 쌓이는 값이 크다.
 */
const local = (ddragonVersion: string, kind: string, name: string) =>
  `${import.meta.env.BASE_URL}img/${ddragonVersion}/${kind}/${name}.webp`;

export const championIconUrl = (ddragonVersion: string, fileName: string) =>
  local(ddragonVersion, "champion", fileName);

export const championSplashUrl = (championId: string, skinNum: number) =>
  `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${championId}_${skinNum}.jpg`;

export const passiveIconUrl = (ddragonVersion: string, fileName: string) =>
  local(ddragonVersion, "passive", fileName.replace(/\.png$/, ""));

export const spellIconUrl = (ddragonVersion: string, spellId: string) =>
  local(ddragonVersion, "spell", spellId);

export const itemIconUrl = (ddragonVersion: string, itemId: string) =>
  local(ddragonVersion, "item", itemId);

export const summonerSpellIconUrl = (ddragonVersion: string, fileName: string) =>
  local(ddragonVersion, "summoner", fileName.replace(/\.png$/, ""));

/**
 * 변신 스킬 아이콘(엘리스·니달리·제이스·그웬 스물일곱 장).
 *
 * 이것만 화면이 Community Dragon 을 직접 보고 있었다. 서비스워커가 맡지 못하고,
 * 그쪽이 흔들리면 그림이 통째로 빈다. 경로를 눕혀 이름으로 삼아 우리 자리에 둔다 —
 * 생성기의 `formIconKey` 와 같은 규칙이고, 어긋나면 시험이 잡는다.
 */
export const formIconKey = (iconPath: string) =>
  iconPath.replace(/^\//, "").replace(/\.png$/i, "").replace(/[^a-zA-Z0-9]+/g, "-");

export const formIconUrl = (ddragonVersion: string, iconPath: string) =>
  local(ddragonVersion, "form", formIconKey(iconPath));

/**
 * 룬 아이콘. 자료에 박힌 경로를 그대로 쓰되 우리 자리를 본다.
 *
 * 이것만 외부 호스트를 직접 보고 있었다. 25장에 854KB — 셋 중 가장 무거운데
 * 서비스워커가 맡지도 못했다. 판본 자리로 옮기면서 64px WebP 로 줄였다.
 *
 * 룬 자료에는 판본이 안 들어 있어 경로를 부르는 쪽이 값을 모른다. Data Dragon 도
 * 룬 아이콘만은 판본 없는 주소(`cdn/img/...`)로 주므로, 우리도 판본 없는 자리에
 * 둔다. 대신 `runes` 라는 이름으로 갈라 두어 판본 갈이 때 덮어써진다.
 */
/**
 * 자료에 박힌 룬 아이콘 경로를 파일 이름으로 바꾼다.
 *
 * 두 꼴이 섞여 온다. 룬은 `perk-images/Styles/...` 처럼 상대 경로이고, 스탯 파편만
 * `/lol-game-data/assets/v1/perk-images/StatMods/...` 처럼 절대 경로다. Data Dragon
 * 은 뒤엣것의 접두사를 뺀 자리에 파일을 둔다. 썸네일 생성기도 같은 규칙을 쓴다 —
 * 어긋나면 그림이 깨지므로 시험이 짝을 확인한다.
 */
export const runeIconKey = (iconPath: string) =>
  iconPath.replace(/^\/lol-game-data\/assets\/v1\//, "").replace(/^\//, "").replace(/\.png$/, "");

export const runeIconUrl = (iconPath: string) =>
  `${import.meta.env.BASE_URL}img/runes/${runeIconKey(iconPath)}.webp`;
