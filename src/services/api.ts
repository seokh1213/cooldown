import Hangul from "hangul-js";
import {
  Champion,
  RuneTree,
  Rune,
  RuneStatShardStaticData,
  RuneStatShard,
  RuneStatShardRow,
  RuneStatShardGroup
} from "@/types";
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
import {logger} from "@/lib/logger";
import {getStaticDataPath} from "@/lib/staticDataUtils";

export const CHAMP_ICON_URL = (VERSION: string, NAME: string) =>
  `https://ddragon.leagueoflegends.com/cdn/${VERSION}/img/champion/${NAME}.png`;
export const PASSIVE_ICON_URL = (VERSION: string, NAME: string) =>
  `https://ddragon.leagueoflegends.com/cdn/${VERSION}/img/passive/${NAME}`;
export const SKILL_ICON_URL = (VERSION: string, NAME: string) =>
  `https://ddragon.leagueoflegends.com/cdn/${VERSION}/img/spell/${NAME}.png`;

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
const normalizedItemDataCache = new Map<string, NormalizedItemDataFile>();

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

    if (!response.ok) {
        throw new Error(`Failed to fetch version info: ${response.status} ${response.statusText}`);
    }

    const versionInfo = await response.json();
    if (versionInfo && (versionInfo.version || versionInfo.ddragonVersion)) {
        const ddragonVersion: string =
            (versionInfo.ddragonVersion as string | undefined) ??
            (versionInfo.version as string);
        const cdragonVersion: string | null =
            typeof versionInfo.cdragonVersion === "string"
            ? (versionInfo.cdragonVersion as string)
            : null;

        cachedDataVersions = {ddragonVersion, cdragonVersion};
        return cachedDataVersions;
    } else {
        throw new Error("Invalid version info structure");
    }
  } catch (error) {
    logger.warn("[Version] Failed to get version from static data:", error);
    throw error;
  }
}

export async function getVersion(): Promise<string> {
  const {ddragonVersion} = await getDataVersions();
  return ddragonVersion;
}

export function cleanOldVersionCache(
  currentDdragonVersion: string,
): void {
  if (typeof window === "undefined" || !window.sessionStorage) {
    return;
  }

  try {
    const keysToRemove: string[] = [];

    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
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

      // champion_info_와 cd_spell_data_ 캐시는 제거됨
      // 정규화 데이터 캐시는 버전별로 관리되므로 여기서 처리하지 않음
    }

    for (const key of keysToRemove) {
      try {
        sessionStorage.removeItem(key);
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
    const cached = sessionStorage.getItem(cacheKey);
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
        sessionStorage.setItem(cacheKey, JSON.stringify(champions));
      } catch (error) {
        logger.warn("Failed to cache champion list:", error);
      }

      return champions;
    }
  } catch (error) {
    logger.warn(
      "[StaticData] Failed to load normalized champion list:",
      error
    );
    throw error;
  }
  
  throw new Error("Failed to load champion list: Unknown error");
}


// ===== Normalized static data (champions/items/runes) =====

export async function getNormalizedChampions(
  version: string,
  lang: string
): Promise<NormalizedChampion[]> {
  const cacheKey = `normalized_champions_${version}_${lang}`;

  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as unknown;
      if (
        parsed &&
        typeof parsed === "object" &&
        "champions" in parsed &&
        Array.isArray((parsed as { champions?: unknown }).champions)
      ) {
        return (parsed as { champions: NormalizedChampion[] }).champions;
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
        sessionStorage.setItem(cacheKey, JSON.stringify(data));
      } catch (error) {
        logger.warn("Failed to cache normalized champions:", error);
      }

      return champions;
    }
    
    throw new Error(`Failed to fetch normalized champions: ${response.status}`);
  } catch (error) {
    logger.warn(
      "[StaticData] Failed to load normalized champions from static data:",
      error
    );
    throw error;
  }
}

// ===== Runes & Items (static data first) =====

export async function getNormalizedRunes(
  version: string,
  lang: string
): Promise<NormalizedRuneDataFile> {
  const cacheKey = `normalized_runes_${version}_${lang}`;

  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (
        parsed &&
        typeof parsed === "object" &&
        "runes" in parsed &&
        "statShards" in parsed &&
        Array.isArray((parsed as { runes?: unknown }).runes) &&
        Array.isArray((parsed as { statShards?: unknown }).statShards)
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
          sessionStorage.setItem(cacheKey, JSON.stringify(data));
        } catch (error) {
          logger.warn("Failed to cache normalized runes:", error);
        }
        return data;
      } else {
        throw new Error("Invalid normalized runes data structure");
      }
    } else {
        throw new Error(`Failed to fetch normalized runes: ${response.status}`);
    }
  } catch (error) {
    logger.warn(
      "[StaticData] Failed to load normalized runes from static data:",
      error
    );
    throw error;
  }
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
  // normalized is guaranteed to be NormalizedRuneDataFile if no error is thrown

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
      tree.slots.push({runes: []});
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

  // normalized is guaranteed to be valid here

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
  const data = await getNormalizedItemData(version, lang);
  return data.items;
}

async function getNormalizedItemData(
  version: string,
  lang: string
): Promise<NormalizedItemDataFile> {
  const memoryKey = `${version}_${lang}`;
  if (normalizedItemDataCache.has(memoryKey)) {
    return normalizedItemDataCache.get(memoryKey)!;
  }

  const cacheKey = `normalized_items_${version}_${lang}`;

  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as unknown;
      if (
        parsed &&
        typeof parsed === "object" &&
        "items" in parsed &&
        Array.isArray((parsed as { items?: unknown }).items)
      ) {
        const data = parsed as NormalizedItemDataFile;
        normalizedItemDataCache.set(memoryKey, data);
        return data;
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
      const data = (await response.json()) as NormalizedItemDataFile;

      try {
        sessionStorage.setItem(cacheKey, JSON.stringify(data));
      } catch (error) {
        logger.warn("Failed to cache normalized items:", error);
      }

      normalizedItemDataCache.set(memoryKey, data);
      return data;
    } else {
        throw new Error(`Failed to fetch normalized items: ${response.status}`);
    }
  } catch (error) {
    logger.warn(
      "[StaticData] Failed to load normalized items from static data:",
      error
    );
    throw error;
  }
}

export async function getNormalizedSummonerSpells(
  version: string,
  lang: string
): Promise<NormalizedSummonerSpell[]> {
  const cacheKey = `normalized_summoner_${version}_${lang}`;

  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (
        parsed &&
        typeof parsed === "object" &&
        "spells" in parsed &&
        Array.isArray((parsed as { spells?: unknown }).spells)
      ) {
        return (parsed as { spells: NormalizedSummonerSpell[] }).spells;
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
        sessionStorage.setItem(cacheKey, JSON.stringify(data));
      } catch (error) {
        logger.warn("Failed to cache normalized summoner spells:", error);
      }

      return spells;
    } else {
        throw new Error(`Failed to fetch normalized summoner spells: ${response.status}`);
    }
  } catch (error) {
    logger.warn(
      "[StaticData] Failed to load normalized summoner spells from static data:",
      error
    );
    throw error;
  }
}

export interface CommunityDragonSpellResult {
  spellDataMap: Record<string, unknown>;
  ddragonVersion?: string;
  cdragonVersion?: string | null;
}

export async function getCommunityDragonSpellData(
  championId: string,
  version: string
): Promise<CommunityDragonSpellResult> {
  // Community Dragon 데이터도 정적 파일(champions/{id}-en_US.json)에 포함되어 있다고 가정하거나
  // 혹은 별도 엔드포인트가 있다면 그곳을 사용해야 합니다.
  // 현재 구조상 public/data/.../champions/{id}-en_US.json 을 사용합니다.
  // 데이터 계산용이므로 언어는 en_US를 기본으로 사용합니다.
  const lang = "en_US";
  const staticUrl = getStaticDataPath(version, `champions/${championId}-${lang}.json`);

  try {
    const response = await fetch(staticUrl);
    if (!response.ok) {
      // 404 등 실패 시
      return { spellDataMap: {} };
    }

    const data = await response.json();
    const spells = data.champion?.spells;
    
    if (!Array.isArray(spells)) {
      return { spellDataMap: {} };
    }

    const spellDataMap: Record<string, unknown> = {};
    spells.forEach((spell: unknown, index: number) => {
      // 인덱스 키 (0, 1, 2, 3)
      spellDataMap[index.toString()] = spell;
      // 스킬 ID 키 (AatroxQ 등)
      if (spell && typeof spell === "object" && "id" in spell && typeof spell.id === "string") {
        spellDataMap[spell.id] = spell;
      }
    });

    return {
      spellDataMap,
      ddragonVersion: data.version,
      cdragonVersion: null,
    };
  } catch (error) {
    logger.warn(`[API] Failed to fetch Community Dragon data for ${championId}`, error);
    throw error;
  }
}

export async function getChampionInfo(
  version: string,
  lang: string,
  championId: string
): Promise<Champion> {
  const staticUrl = getStaticDataPath(version, `champions/${championId}-${lang}.json`);

  try {
    const response = await fetch(staticUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch champion info for ${championId}`);
    }
    const data = await response.json();
    // 정적 데이터 구조: { version, lang, champion: { ... } }
    return data.champion as Champion;
  } catch (error) {
    logger.warn(`[API] Failed to get champion info for ${championId}:`, error);
    throw error;
  }
}




