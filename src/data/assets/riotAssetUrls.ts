export const championIconUrl = (ddragonVersion: string, fileName: string) =>
  `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/champion/${fileName}.png`;

export const passiveIconUrl = (ddragonVersion: string, fileName: string) =>
  `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/passive/${fileName}`;

export const spellIconUrl = (ddragonVersion: string, spellId: string) =>
  `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/spell/${spellId}.png`;

export const itemIconUrl = (ddragonVersion: string, itemId: string) =>
  `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/item/${itemId}.png`;

export const summonerSpellIconUrl = (
  ddragonVersion: string,
  fileName: string
) =>
  `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/spell/${fileName}`;
