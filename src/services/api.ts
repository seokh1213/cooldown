import Hangul from "hangul-js";
import { Champion, RuneTree, Rune, RuneStatShardStaticData, RuneStatShard, RuneStatShardRow, RuneStatShardGroup } from "@/types";
import type {
  NormalizedChampion,
  NormalizedChampionDataFile,
  NormalizedItem,
  NormalizedItemDataFile,
  NormalizedRuneDataFile,
  NormalizedSummonerSpell,
  NormalizedSummonerDataFile,
} from "@/types/combatNormalized";
import {
  STAT_DEFINITIONS,
  StatKey,
} from "@/types/combatStats";
import { logger } from "@/lib/logger";
import { getStaticDataPath } from "@/lib/staticDataUtils";

const VERSION_URL = "https://ddragon.leagueoflegends.com/api/versions.json";
const CHAMP_LIST_URL = (VERSION: string, LANG: string) =>
  `https://ddragon.leagueoflegends.com/cdn/${VERSION}/data/${LANG}/champion.json`;
const CHAMP_INFO_URL = (VERSION: string, LANG: string, NAME: string) =>
  `https://ddragon.leagueoflegends.com/cdn/${VERSION}/data/${LANG}/champion/${NAME}.json`;

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

/**
 * 정적 데이터(version.json)에서 가져오는 버전 정보
 * - ddragonVersion: Data Dragon 기준 버전 (기존 version 필드와 동일)
 * - cdragonVersion: Community Dragon 기준 버전 (없을 수도 있음)
 */
export interface DataVersionInfo {
  ddragonVersion: string;
  cdragonVersion: string | null;
}

let cachedDataVersions: DataVersionInfo | null = null;


async function fetchData<T>(
  URL: string,
  transform: (res: unknown) => T
): Promise<T> {
  const res_1 = await fetch(URL);
  if (!res_1.ok) {
    const error = new Error(`HTTP error! status: ${res_1.status}`);
    logger.error("API request failed:", error);
    throw error;
  }
  
  try {
    const res_2 = await res_1.json();
    return transform(res_2);
  } catch (err) {
    logger.error("API request failed:", err);
    throw err;
  }
}

export async function getDataVersions(): Promise<DataVersionInfo> {
  // 메모이제이션: 한 번 가져온 버전 정보는 재사용
  if (cachedDataVersions) {
    return cachedDataVersions;
  }

  try {
    const basePath = import.meta.env.BASE_URL || '/';
    const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`;
    const versionUrl = `${normalizedBase}data/version.json`;
    const response = await fetch(versionUrl);
    
    if (response.ok) {
      const versionInfo = await response.json();
      if (versionInfo && (versionInfo.version || versionInfo.ddragonVersion)) {
        const ddragonVersion: string =
          (versionInfo.ddragonVersion as string | undefined) ??
          (versionInfo.version as string);
        const cdragonVersion: string | null =
          typeof versionInfo.cdragonVersion === "string"
            ? (versionInfo.cdragonVersion as string)
            : null;

        cachedDataVersions = { ddragonVersion, cdragonVersion };
        return cachedDataVersions;
      }
    }
  } catch (error) {
    logger.warn("[Version] Failed to get version from static data, falling back to API:", error);
  }

  const latestVersion = await fetchData<string>(VERSION_URL, (res) => {
    if (Array.isArray(res) && res.length > 0 && typeof res[0] === "string") {
      return res[0];
    }
    throw new Error("Invalid version response format");
  });

  cachedDataVersions = {
    ddragonVersion: latestVersion,
    cdragonVersion: null,
  };

  return cachedDataVersions;
}

export async function getVersion(): Promise<string> {
  const { ddragonVersion } = await getDataVersions();
  return ddragonVersion;
}

export function cleanOldVersionCache(
  currentDdragonVersion: string,
  currentCdragonVersion?: string | null
): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  try {
    const keysToRemove: string[] = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      if (key.startsWith("champion_list_")) {
        const rest = key.substring("champion_list_".length);
        const firstUnderscoreIndex = rest.indexOf("_");
        if (firstUnderscoreIndex > 0) {
          const version = rest.substring(0, firstUnderscoreIndex);
          if (version !== currentDdragonVersion) {
            keysToRemove.push(key);
          }
        } else {
          keysToRemove.push(key);
        }
      }
      
      if (key.startsWith("champion_info_")) {
        const rest = key.substring("champion_info_".length);
        const firstUnderscoreIndex = rest.indexOf("_");
        if (firstUnderscoreIndex > 0) {
          const version = rest.substring(0, firstUnderscoreIndex);
          if (version !== currentDdragonVersion) {
            keysToRemove.push(key);
          }
        } else {
          keysToRemove.push(key);
        }
      }
      
      if (key.startsWith("cd_spell_data_")) {
        let shouldRemove = false;

        try {
          const raw = localStorage.getItem(key);
          if (!raw) {
            shouldRemove = true;
          } else {
            const parsed = JSON.parse(raw);

            // 현재 우리가 사용하는 스키마: { spellDataMap, cdragonVersion, ddragonVersion }
            if (
              parsed &&
              typeof parsed === "object" &&
              "spellDataMap" in parsed
            ) {
              const spellDataMap = (parsed as any).spellDataMap;
              if (
                !spellDataMap ||
                typeof spellDataMap !== "object" ||
                Object.keys(spellDataMap).length === 0
              ) {
                // 빈 데이터 또는 잘못된 구조
                shouldRemove = true;
              } else {
                const storedDdragonVersion =
                  typeof (parsed as any).ddragonVersion === "string"
                    ? ((parsed as any).ddragonVersion as string)
                    : null;
                const storedCdragonVersion =
                  typeof (parsed as any).cdragonVersion === "string"
                    ? ((parsed as any).cdragonVersion as string)
                    : null;

                // DDragon 버전이 현재와 다른 경우 제거
                if (
                  storedDdragonVersion &&
                  storedDdragonVersion !== currentDdragonVersion
                ) {
                  shouldRemove = true;
                }

                // 현재 빌드에서 CDragon 버전을 알고 있을 때:
                if (currentCdragonVersion) {
                  // 1) 캐시에 CDragon 버전 정보가 아예 없으면, 현재 스키마와 다른 것으로 보고 제거
                  if (!storedCdragonVersion) {
                    shouldRemove = true;
                  } else if (storedCdragonVersion !== currentCdragonVersion) {
                    // 2) 존재하지만 현재 버전과 다르면 제거
                    shouldRemove = true;
                  }
                }
              }
            } else {
              // spellDataMap이 없으면 우리가 사용하는 구조가 아님 (레거시 맵 또는 깨진 데이터)
              shouldRemove = true;
            }
          }
        } catch {
          // 파싱 실패 등 예외 상황은 모두 제거 대상
          shouldRemove = true;
        }

        if (shouldRemove) {
          keysToRemove.push(key);
        }
      }
    }

    for (const key of keysToRemove) {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        logger.warn(`Failed to remove cache key: ${key}`, error);
      }
    }
  } catch (error) {
    logger.warn("[Cache] Failed to clean old version cache:", error);
  }
}

export async function getChampionList(
  version: string,
  lang: string
): Promise<Champion[]> {
  const cacheKey = `champion_list_${version}_${lang}`;

  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && Array.isArray(parsed) && parsed.length > 0) {
        return Promise.resolve(parsed);
      }
    }
  } catch (error) {
    logger.warn("Failed to parse cached champion list:", error);
  }

  // 1) 정규화된 챔피언 정적 데이터를 우선 사용
  try {
    const normalized = await getNormalizedChampions(version, lang);
    const isKo = lang === "ko_KR";
    if (normalized && normalized.length > 0) {
      const champions: Champion[] = normalized
        .map((c) => {
          const name = c.name;
          const hangul =
            isKo && name
              ? Hangul.d(name, true).reduce(
                  (acc: string, array: string[]) => acc + array[0],
                  ""
                )
              : "";

          const stats: Record<string, number> = {};
          const bs = c.baseStats;
          if (bs) {
            stats.hp = bs.health.base;
            stats.hpperlevel = bs.health.perLevel;
            if (bs.mana) {
              stats.mp = bs.mana.base;
              stats.mpperlevel = bs.mana.perLevel;
            }
            stats.movespeed = bs.moveSpeed.base;
            stats.armor = bs.armor.base;
            stats.armorperlevel = bs.armor.perLevel;
            stats.spellblock = bs.magicResist.base;
            stats.spellblockperlevel = bs.magicResist.perLevel;
            stats.attackdamage = bs.attackDamage.base;
            stats.attackdamageperlevel = bs.attackDamage.perLevel;
            stats.attackspeed = bs.attackSpeed.base;
            stats.attackspeedperlevel = bs.attackSpeed.perLevel;
            stats.attackrange = bs.attackRange.base;
            // 치명타/재생 계열은 기본값 0으로 둠
            stats.crit = 0;
            stats.critperlevel = 0;
            stats.hpregen = bs.healthRegen.base;
            stats.hpregenperlevel = bs.healthRegen.perLevel;
            if (bs.manaRegen) {
              stats.mpregen = bs.manaRegen.base;
              stats.mpregenperlevel = bs.manaRegen.perLevel;
            }
          }

          const champion: Champion = {
            id: c.id,
            key: c.id, // DDragon numeric key는 없지만, 저장/비교용으로 id를 사용
            name,
            title: "",
            version,
            hangul,
            stats,
          };
          return champion;
        })
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

      try {
        localStorage.setItem(cacheKey, JSON.stringify(champions));
      } catch (error) {
        logger.warn("Failed to cache champion list:", error);
      }

      return champions;
    }
  } catch (error) {
    logger.warn(
      "[StaticData] Failed to load normalized champion list, falling back to API:",
      error
    );
  }

  // 2) 폴백: Data Dragon API에서 직접 가져오기
  const data = await fetchData<ChampionData>(
    CHAMP_LIST_URL(version, lang),
    (res) => {
      if (res && typeof res === "object" && "data" in res) {
        return res as ChampionData;
      }
      throw new Error("Invalid champion list response format");
    }
  );

  const champions = Object.values(data.data)
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
    });

  try {
    localStorage.setItem(cacheKey, JSON.stringify(champions));
  } catch (error) {
    logger.warn("Failed to cache champion list:", error);
  }

  return champions;
}

export async function getChampionInfo(version: string, lang: string, name: string): Promise<Champion> {
  const cacheKey = `champion_info_${version}_${lang}_${name}`;
  
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && typeof parsed === "object" && parsed.id) {
        return Promise.resolve(parsed);
      }
    }
  } catch (error) {
    logger.warn("Failed to parse cached champion info:", error);
  }

  try {
    const staticUrl = getStaticDataPath(version, 'champions', `${name}-${lang}.json`);
    const response = await fetch(staticUrl);
    
    if (response.ok) {
      const staticData = await response.json();
      if (staticData && staticData.champion) {
        const championInfo = staticData.champion;
        
        try {
          localStorage.setItem(cacheKey, JSON.stringify(championInfo));
        } catch (error) {
          logger.warn("Failed to cache champion info:", error);
        }
        
        return championInfo;
      }
    }
  } catch (error) {
    logger.warn("[StaticData] Failed to load champion info from static data, falling back to API:", error);
  }

  return fetchData<Champion>(
    CHAMP_INFO_URL(version, lang, name),
    (res) => {
      if (res && typeof res === "object" && "data" in res) {
        const data = res as ChampionData;
        if (name in data.data) {
          const championInfo = data.data[name];
          
          try {
            localStorage.setItem(cacheKey, JSON.stringify(championInfo));
          } catch (error) {
            logger.warn("Failed to cache champion info:", error);
          }
          
          return championInfo;
        }
      }
      throw new Error(`Champion ${name} not found`);
    }
  );
}

// ===== Normalized static data (champions/items/runes) =====

export async function getNormalizedChampions(
  version: string,
  lang: string
): Promise<NormalizedChampion[]> {
  const cacheKey = `normalized_champions_${version}_${lang}`;

  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (
        parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as any).champions)
      ) {
        return (parsed as any).champions as NormalizedChampion[];
      }
    }
  } catch (error) {
    logger.warn("Failed to parse cached normalized champions:", error);
  }

  try {
    const staticUrl = getStaticDataPath(
      version,
      `champions-normalized-${lang}.json`
    );
    const response = await fetch(staticUrl);

    if (response.ok) {
      const data =
        (await response.json()) as NormalizedChampionDataFile;
      const champions = Array.isArray(data.champions)
        ? data.champions
        : [];

      try {
        localStorage.setItem(cacheKey, JSON.stringify(data));
      } catch (error) {
        logger.warn("Failed to cache normalized champions:", error);
      }

      return champions;
    }
  } catch (error) {
    logger.warn(
      "[StaticData] Failed to load normalized champions from static data:",
      error
    );
  }

  return [];
}

// ===== Runes & Items (static data first) =====

export async function getNormalizedRunes(
  version: string,
  lang: string
): Promise<NormalizedRuneDataFile | null> {
  const cacheKey = `normalized_runes_${version}_${lang}`;

  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (
        parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as any).runes) &&
        Array.isArray((parsed as any).statShards)
      ) {
        return parsed as NormalizedRuneDataFile;
      }
    }
  } catch (error) {
    logger.warn("Failed to parse cached normalized runes:", error);
  }

  try {
    const staticUrl = getStaticDataPath(
      version,
      `runes-normalized-${lang}.json`
    );
    const response = await fetch(staticUrl);

    if (response.ok) {
      const data =
        (await response.json()) as NormalizedRuneDataFile;
      if (
        Array.isArray(data.runes) &&
        Array.isArray(data.statShards)
      ) {
        try {
          localStorage.setItem(cacheKey, JSON.stringify(data));
        } catch (error) {
          logger.warn("Failed to cache normalized runes:", error);
        }
        return data;
      }
    }
  } catch (error) {
    logger.warn(
      "[StaticData] Failed to load normalized runes from static data:",
      error
    );
  }

  return null;
}

// ===== Rune trees & stat shards (for Encyclopedia page) =====

const RUNE_TREE_META: Record<
  number,
  {
    key: string;
    /**
     * 영문 이름 (정렬/표시 보조용)
     */
    nameEn: string;
    /**
     * 한글 이름 (정렬/표시 보조용)
     */
    nameKo: string;
    /**
     * DDragon 스타일 대표 아이콘 경로
     * 예)
     *  - Precision (8000): perk-images/Styles/7201_Precision.png
     *  - Domination (8100): perk-images/Styles/7200_Domination.png
     *  - Sorcery (8200): perk-images/Styles/7202_Sorcery.png
     *  - Resolve (8400): perk-images/Styles/7204_Resolve.png
     *  - Inspiration (8300): perk-images/Styles/7203_Whimsy.png
     *
     * 실제 이미지 URL은
     * https://ddragon.leagueoflegends.com/cdn/img/${icon}
     * 형태로 사용한다.
     */
    icon: string;
  }
> = {
  8000: {
    key: "Precision",
    nameEn: "Precision",
    nameKo: "정밀",
    icon: "perk-images/Styles/7201_Precision.png",
  },
  8100: {
    key: "Domination",
    nameEn: "Domination",
    nameKo: "지배",
    icon: "perk-images/Styles/7200_Domination.png",
  },
  8200: {
    key: "Sorcery",
    nameEn: "Sorcery",
    nameKo: "마법",
    icon: "perk-images/Styles/7202_Sorcery.png",
  },
  8300: {
    key: "Inspiration",
    nameEn: "Inspiration",
    nameKo: "영감",
    icon: "perk-images/Styles/7203_Whimsy.png",
  },
  8400: {
    key: "Resolve",
    nameEn: "Resolve",
    nameKo: "결의",
    icon: "perk-images/Styles/7204_Resolve.png",
  },
};

function getRuneTreeMeta(pathId: number, lang: string): {
  key: string;
  name: string;
  icon: string;
} {
  const meta = RUNE_TREE_META[pathId];
  if (!meta) {
    const idStr = String(pathId);
    return {
      key: idStr,
      name: idStr,
      icon: "",
    };
  }

  const isKo = lang === "ko_KR";
  return {
    key: meta.key,
    name: isKo ? meta.nameKo || meta.nameEn : meta.nameEn,
    icon: meta.icon,
  };
}

export async function getRuneTrees(
  version: string,
  lang: string
): Promise<RuneTree[]> {
  const normalized = await getNormalizedRunes(version, lang);
  if (!normalized || !Array.isArray(normalized.runes)) {
    return [];
  }

  const treesByPathId = new Map<number, RuneTree>();

  for (const rune of normalized.runes) {
    const pathId = rune.pathId;
    const slotIndex = rune.slotIndex ?? 0;
    if (typeof pathId !== "number") continue;

    let tree = treesByPathId.get(pathId);
    if (!tree) {
      const meta = getRuneTreeMeta(pathId, lang);
      tree = {
        id: pathId,
        key: meta.key,
        name: meta.name,
        icon: meta.icon,
        slots: [],
      };
      treesByPathId.set(pathId, tree);
    }

    while (tree.slots.length <= slotIndex) {
      tree.slots.push({ runes: [] });
    }

    const displayName = rune.name || String(rune.id);

    const tooltip = rune.tooltip || "";

    const uiRune: Rune = {
      id: Number(rune.id),
      name: displayName,
      icon: rune.iconPath ?? "",
      // 정규화된 tooltip(tooltipKo/tooltipEn)을 그대로 HTML로 사용
      descriptionHtml: tooltip,
    };

    tree.slots[slotIndex].runes.push(uiRune);
  }

  // 간단 정렬: 각 슬롯 내부 룬을 ID 기준으로 정렬
  for (const tree of treesByPathId.values()) {
    for (const slot of tree.slots) {
      slot.runes.sort((a, b) => a.id - b.id);
    }
  }

  return Array.from(treesByPathId.values());
}

function buildStatShardDescriptionHtml(
  lang: string,
  stats: { stat: StatKey; value: number; valueType: string }[]
): string {
  if (!stats || stats.length === 0) return "";

  const isKo = lang === "ko_KR";

  const parts = stats.map((contribution) => {
    const def = STAT_DEFINITIONS[contribution.stat];
    const label = def ? (isKo ? def.label.ko : def.label.en) : contribution.stat;
    const isPercent =
      contribution.valueType === "percent" || (def && def.isPercent);
    const valueStr = isPercent
      ? `${contribution.value}%`
      : `${contribution.value}`;
    return `+${valueStr} ${label}`;
  });

  // 간단한 텍스트만 사용 (폰트 태그 등은 RunesTab 쪽에서 제거 처리)
  return parts.join(" / ");
}

export async function getRuneStatShards(
  version: string,
  lang: string
): Promise<RuneStatShardStaticData> {
  const normalized = await getNormalizedRunes(version, lang);

  if (!normalized || !Array.isArray(normalized.statShards)) {
    return {
      version,
      lang,
      cdragonVersion: null,
      groups: [],
    };
  }

  const isKo = lang === "ko_KR";

  const rowLabelsEn = [
    "Row 1 (Offense)",
    "Row 2 (Flex)",
    "Row 3 (Defense)",
  ];
  const rowLabelsKo = [
    "1열: 공격 능력치",
    "2열: 유연 능력치",
    "3열: 방어 능력치",
  ];
  const rowLabels = isKo ? rowLabelsKo : rowLabelsEn;

  const rowsByIndex = new Map<number, RuneStatShardRow>();

  const sortedShards = [...normalized.statShards].sort((a, b) => {
    if (a.rowIndex !== b.rowIndex) {
      return a.rowIndex - b.rowIndex;
    }
    return a.columnIndex - b.columnIndex;
  });

  for (const shard of sortedShards) {
    const rowIndex = shard.rowIndex ?? 0;

    let row = rowsByIndex.get(rowIndex);
    if (!row) {
      row = {
        label: rowLabels[rowIndex] ?? "",
        perks: [],
      };
      rowsByIndex.set(rowIndex, row);
    }

    const name = shard.name || String(shard.id);

    const desc = buildStatShardDescriptionHtml(lang, shard.stats);

    const perk: RuneStatShard = {
      id: Number(shard.id),
      name,
      iconPath: shard.iconPath ?? "",
      shortDesc: desc,
      longDesc: desc,
    };

    row.perks.push(perk);
  }

  const rows: RuneStatShardRow[] = Array.from(rowsByIndex.entries())
    .sort(([aIdx], [bIdx]) => aIdx - bIdx)
    .map(([, row]) => row);

  const groups: RuneStatShardGroup[] = [
    {
      styleId: 0,
      styleName: isKo ? "공통 능력치 조각" : "Common Stat Shards",
      rows,
    },
  ];

  return {
    version: normalized.version,
    lang: normalized.lang,
    cdragonVersion: null,
    groups,
  };
}

export async function getNormalizedItems(
  version: string,
  lang: string
): Promise<NormalizedItem[]> {
  const cacheKey = `normalized_items_${version}_${lang}`;

  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (
        parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as any).items)
      ) {
        return (parsed as any).items as NormalizedItem[];
      }
    }
  } catch (error) {
    logger.warn("Failed to parse cached normalized items:", error);
  }

  try {
    const staticUrl = getStaticDataPath(
      version,
      `items-normalized-${lang}.json`
    );
    const response = await fetch(staticUrl);

    if (response.ok) {
      const data =
        (await response.json()) as NormalizedItemDataFile;
      const items = Array.isArray(data.items) ? data.items : [];

      try {
        localStorage.setItem(cacheKey, JSON.stringify(data));
      } catch (error) {
        logger.warn("Failed to cache normalized items:", error);
      }

      return items;
    }
  } catch (error) {
    logger.warn(
      "[StaticData] Failed to load normalized items from static data:",
      error
    );
  }

  return [];
}

export async function getNormalizedSummonerSpells(
  version: string,
  lang: string
): Promise<NormalizedSummonerSpell[]> {
  const cacheKey = `normalized_summoner_${version}_${lang}`;

  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (
        parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as any).spells)
      ) {
        return (parsed as any).spells as NormalizedSummonerSpell[];
      }
    }
  } catch (error) {
    logger.warn("Failed to parse cached normalized summoner spells:", error);
  }

  try {
    const staticUrl = getStaticDataPath(
      version,
      `summoner-normalized-${lang}.json`
    );
    const response = await fetch(staticUrl);

    if (response.ok) {
      const data =
        (await response.json()) as NormalizedSummonerDataFile;
      const spells = Array.isArray(data.spells) ? data.spells : [];

      try {
        localStorage.setItem(cacheKey, JSON.stringify(data));
      } catch (error) {
        logger.warn("Failed to cache normalized summoner spells:", error);
      }

      return spells;
    }
  } catch (error) {
    logger.warn(
      "[StaticData] Failed to load normalized summoner spells from static data:",
      error
    );
  }

  return [];
}

function convertChampionIdToCommunityDragon(championId: string): string {
  return championId.toLowerCase();
}

function findActualChampionPath(
  data: Record<string, unknown>,
  championId: string
): string | null {
  const lowerChampionId = championId.toLowerCase();
  const path = `Characters/${championId}/CharacterRecords/Root`;

  if (path in data) {
    return path.split('/').slice(0, 2).join('/');
  }

  const matchingKeys = Object.keys(data).filter(key => {
    const keyLower = key.toLowerCase();
    return keyLower.includes(`characters/${lowerChampionId}/`) || 
           keyLower.includes(`characters/${championId.toLowerCase()}/`);
  });
  
  if (matchingKeys.length > 0) {
    const firstKey = matchingKeys[0];
    const match = firstKey.match(/Characters\/([^/]+)/i);
    if (match && match[1]) {
      return `Characters/${match[1]}`;
    }
  }
  
  return null;
}

function extractSpellOrderMapping(
  data: Record<string, unknown>,
  championId: string
): { spellOrder: string[]; actualChampionPath: string | null } {
  const actualChampionPath = findActualChampionPath(data, championId);
  
  if (!actualChampionPath) {
    return { spellOrder: [], actualChampionPath: null };
  }
  
  const rootPath = `${actualChampionPath}/CharacterRecords/Root`;
  const root = data[rootPath] as Record<string, unknown> | undefined;
  
  if (root && root.spells && Array.isArray(root.spells)) {
    const spellPaths = root.spells as string[];
    return { spellOrder: spellPaths, actualChampionPath };
  }
  
  return { spellOrder: [], actualChampionPath };
}

export interface CommunityDragonSpellResult {
  /** 스킬 데이터 맵 (인덱스/이름 -> 데이터) */
  spellDataMap: Record<string, Record<string, any>>;
  /** 실제로 사용한 CDragon 버전 (예: 15.23, latest). 정적 데이터에 없으면 null */
  cdragonVersion: string | null;
  /** 기준이 된 DDragon 버전 (정적 데이터의 version 또는 인자로 받은 version) */
  ddragonVersion: string | null;
}

export async function getCommunityDragonSpellData(
  championId: string,
  version?: string
): Promise<CommunityDragonSpellResult> {
  const cdChampionId = convertChampionIdToCommunityDragon(championId);
  const dataVersions = await getDataVersions().catch((error) => {
    logger.warn("[CD] Failed to get data versions for cache key, using fallback:", error);
    return null;
  });

  const ddragonVersionForCache =
    version || dataVersions?.ddragonVersion || "unknown";
  const cdragonVersionForCache = dataVersions?.cdragonVersion || null;

  const baseCacheKey = cdragonVersionForCache
    ? `cd_spell_data_${ddragonVersionForCache}_${cdragonVersionForCache}_${cdChampionId}`
    : `cd_spell_data_${ddragonVersionForCache}_${cdChampionId}`;

  // 현재 빌드 기준 "기본" 캐시 키 (읽기 시도에 사용)
  let cacheKey = baseCacheKey;

  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && typeof parsed === "object") {
        // 새로운 포맷: { spellDataMap, cdragonVersion, ddragonVersion }
        if ("spellDataMap" in parsed && parsed.spellDataMap && typeof parsed.spellDataMap === "object") {
          const spellDataMap = parsed.spellDataMap as Record<string, Record<string, any>>;
          if (Object.keys(spellDataMap).length > 0) {
            return Promise.resolve({
              spellDataMap,
              cdragonVersion: typeof parsed.cdragonVersion === "string" ? parsed.cdragonVersion : null,
              ddragonVersion: typeof parsed.ddragonVersion === "string"
                ? parsed.ddragonVersion
                : (version || null),
            });
          }
        } else {
          // 이전 포맷: spellDataMap만 저장되어 있는 경우
          const legacyMap = parsed as Record<string, Record<string, any>>;
          if (Object.keys(legacyMap).length > 0) {
            return Promise.resolve({
              spellDataMap: legacyMap,
              cdragonVersion: null,
              ddragonVersion: version || null,
            });
          } else {
            localStorage.removeItem(cacheKey);
          }
        }
      }
    }
  } catch (error) {
    logger.warn("[CD] Failed to parse cached Community Dragon data:", error);
  }

  if (version) {
    try {
      const staticUrl = getStaticDataPath(version, 'spells', `${championId}.json`);
      const response = await fetch(staticUrl);
      
      if (response.ok) {
        const staticData = await response.json();
        
        if (staticData && staticData.spellData && typeof staticData.spellData === 'object') {
          const spellDataMap = staticData.spellData as Record<string, Record<string, any>>;
          const cdragonVersion =
            typeof staticData.cdragonVersion === "string" ? staticData.cdragonVersion : null;
          const ddragonVersion =
            typeof staticData.ddragonVersion === "string"
              ? staticData.ddragonVersion
              : (typeof staticData.version === "string"
                ? staticData.version
                : version || ddragonVersionForCache || null);
          
          if (Object.keys(spellDataMap).length > 0) {
            const result: CommunityDragonSpellResult = {
              spellDataMap,
              cdragonVersion,
              ddragonVersion,
            };

            // 정적 데이터 안에 명시된 CDragon 버전이 있으면,
            // 그 값을 기준으로 "실제" 캐시 키를 다시 계산한다.
            const effectiveDdragonForKey = ddragonVersion || ddragonVersionForCache || "unknown";
            const effectiveCdragonForKey = cdragonVersion || cdragonVersionForCache;
            const writeCacheKey = effectiveCdragonForKey
              ? `cd_spell_data_${effectiveDdragonForKey}_${effectiveCdragonForKey}_${cdChampionId}`
              : `cd_spell_data_${effectiveDdragonForKey}_${cdChampionId}`;

            try {
              localStorage.setItem(writeCacheKey, JSON.stringify(result));
              // 이전에 잘못된 키로 저장되어 있었을 수 있으므로,
              // 기본 키와 실제 키가 다르면 기본 키는 정리해준다.
              if (writeCacheKey !== baseCacheKey) {
                try {
                  localStorage.removeItem(baseCacheKey);
                } catch {
                  // noop
                }
              }
            } catch (error) {
              logger.warn("[CD] Failed to cache Community Dragon data:", error);
            }
            
            return result;
          }
        }
      }
    } catch (error) {
      logger.warn("[StaticData] Failed to load CD spell data from static data, falling back to API:", error);
    }
  } else {
    logger.warn(
      `[StaticData] No version provided for ${championId}, skipping static data and using API`
    );
  }

  // 정적 데이터/버전 정보를 기반으로 CDragon base path 결정
  // 1) version.json 에서 읽어온 cdragonVersion
  // 2) ddragonVersion(예: 15.24.1) → 15.24 형태로 변환
  // 3) 최종 폴백: latest
  const toCommunityDragonVersion = (v: string): string => {
    const parts = v.split(".");
    if (parts.length >= 2) {
      return `${parts[0]}.${parts[1]}`;
    }
    return v;
  };

  const cdragonBasePath =
    cdragonVersionForCache ||
    (ddragonVersionForCache && ddragonVersionForCache !== "unknown"
      ? toCommunityDragonVersion(ddragonVersionForCache)
      : "latest");

  const url = `https://raw.communitydragon.org/${cdragonBasePath}/game/data/characters/${cdChampionId}/${cdChampionId}.bin.json`;

  let response: Response;
  try {
    response = await fetch(url);
    if (!response.ok) {
      const error = new Error(`HTTP error! status: ${response.status}`);
      logger.error("Failed to fetch Community Dragon data:", error);
      try {
        localStorage.removeItem(cacheKey);
      } catch (removeError) {
        logger.warn("Failed to remove cache on error:", removeError);
      }
      return {
        spellDataMap: {},
        cdragonVersion: null,
        ddragonVersion: version || null,
      };
    }
  } catch (error) {
    logger.error("Failed to fetch Community Dragon data:", error);
    try {
      localStorage.removeItem(cacheKey);
    } catch (removeError) {
      logger.warn("Failed to remove cache on error:", removeError);
    }
    return {
      spellDataMap: {},
      cdragonVersion: null,
      ddragonVersion: version || null,
    };
  }

  try {
    const data = await response.json();
    
    const { spellOrder, actualChampionPath } = extractSpellOrderMapping(data, cdChampionId);
    
    if (!actualChampionPath) {
      logger.warn(`[CD] Could not find champion path for ${cdChampionId}`);
    }
    
    const spellDataMap: Record<string, Record<string, any>> = {};
    
    for (let i = 0; i < spellOrder.length; i++) {
      const spellPath = spellOrder[i];
      if (!spellPath) continue;
      
      // 전체 경로에서 스킬 객체 찾기
      const spellObj = data[spellPath] as Record<string, unknown> | undefined;
      
      if (!spellObj) {
        logger.warn(`[CD] Spell path not found: ${spellPath}`);
        continue;
      }
      
      if (spellObj && spellObj.mSpell) {
        const mSpell = spellObj.mSpell as Record<string, unknown>;
        const spellData: Record<string, any> = {};
        
        if (mSpell.DataValues && Array.isArray(mSpell.DataValues)) {
          const dataValues: Record<string, (number | string)[]> = {};
          for (const dv of mSpell.DataValues as Array<{ mName?: string; mValues?: (number | string)[] }>) {
            if (dv.mName && dv.mValues && Array.isArray(dv.mValues)) {
              dataValues[dv.mName] = dv.mValues;
            }
          }
          
          if (mSpell.mAmmoRechargeTime && Array.isArray(mSpell.mAmmoRechargeTime)) {
            dataValues["mAmmoRechargeTime"] = mSpell.mAmmoRechargeTime as (number | string)[];
          }
          
          if (Object.keys(dataValues).length > 0) {
            spellData.DataValues = dataValues;
          }
        }
        
        if (mSpell.mSpellCalculations && typeof mSpell.mSpellCalculations === 'object' && mSpell.mSpellCalculations !== null) {
          spellData.mSpellCalculations = mSpell.mSpellCalculations;
        }
        
        if (spellObj.mClientData && typeof spellObj.mClientData === 'object' && spellObj.mClientData !== null) {
          spellData.mClientData = spellObj.mClientData;
        }
        
        if (Object.keys(spellData).length > 0) {
          spellDataMap[i.toString()] = spellData;
          const spellName = spellPath.split("/").pop() || "";
          if (spellName) {
            spellDataMap[spellName] = spellData;
          }
        } else {
          logger.warn(`[CD] Spell ${i} (${spellPath}) has no extractable data`);
        }
      } else {
        logger.warn(`[CD] Spell ${i} (${spellPath}) has no mSpell`);
      }
    }
    
    let abilityObjectCount = 0;
    const championPathForSearch = actualChampionPath || `Characters/${cdChampionId}`;
    for (const key in data) {
      const keyLower = key.toLowerCase();
      const searchPathLower = championPathForSearch.toLowerCase();
      if (keyLower.includes(`${searchPathLower}/spells/`) && keyLower.includes("ability")) {
        abilityObjectCount++;
        const abilityObj = data[key] as Record<string, unknown> | undefined;
        if (abilityObj && abilityObj.mRootSpell) {
          const rootSpellPath = abilityObj.mRootSpell as string;
          const spellObj = data[rootSpellPath] as Record<string, unknown> | undefined;
          
          if (spellObj && spellObj.mSpell) {
            const mSpell = spellObj.mSpell as Record<string, unknown>;
            const spellName = rootSpellPath.split("/").pop() || "";
            
            if (!spellDataMap[spellName]) {
              const spellData: Record<string, any> = {};
              
              if (mSpell.DataValues && Array.isArray(mSpell.DataValues)) {
                const dataValues: Record<string, (number | string)[]> = {};
                for (const dv of mSpell.DataValues as Array<{ mName?: string; mValues?: (number | string)[] }>) {
                  if (dv.mName && dv.mValues && Array.isArray(dv.mValues)) {
                    dataValues[dv.mName] = dv.mValues;
                  }
                }
                
                if (mSpell.mAmmoRechargeTime && Array.isArray(mSpell.mAmmoRechargeTime)) {
                  dataValues["mAmmoRechargeTime"] = mSpell.mAmmoRechargeTime as (number | string)[];
                }
                
                if (Object.keys(dataValues).length > 0) {
                  spellData.DataValues = dataValues;
                }
              }
              
              if (mSpell.mSpellCalculations && typeof mSpell.mSpellCalculations === 'object' && mSpell.mSpellCalculations !== null) {
                spellData.mSpellCalculations = mSpell.mSpellCalculations;
              }
              
              if (spellObj.mClientData && typeof spellObj.mClientData === 'object' && spellObj.mClientData !== null) {
                spellData.mClientData = spellObj.mClientData;
              }
              
              if (Object.keys(spellData).length > 0) {
                spellDataMap[spellName] = spellData;
              }
            }
          }
        }
      }
    }
    
    const spellDataKeys = Object.keys(spellDataMap);
    
    if (spellDataKeys.length > 0) {
      const result: CommunityDragonSpellResult = {
        spellDataMap,
        cdragonVersion: cdragonBasePath,
        ddragonVersion: version || null,
      };
      try {
        localStorage.setItem(cacheKey, JSON.stringify(result));
      } catch (error) {
        logger.warn("[CD] Failed to cache Community Dragon data:", error);
      }
      return result;
    } else {
      try {
        localStorage.removeItem(cacheKey);
      } catch (error) {
        logger.warn("[CD] Failed to remove empty cache:", error);
      }
      logger.warn(`[CD] No spell data found for champion: ${cdChampionId}. Spell order: ${spellOrder.length}, Ability objects: ${abilityObjectCount}`);
      return {
        spellDataMap: {},
        cdragonVersion: null,
        ddragonVersion: version || null,
      };
    }
  } catch (error) {
    logger.error("Failed to parse Community Dragon data:", error);
    try {
      localStorage.removeItem(cacheKey);
    } catch (removeError) {
      logger.warn("Failed to remove cache on error:", removeError);
    }
    return {
      spellDataMap: {},
      cdragonVersion: null,
      ddragonVersion: version || null,
    };
  }
}
