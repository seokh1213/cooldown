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
import {getRuntimeBasePath, getStaticDataPath} from "@/lib/staticDataUtils";
import {decodeDataManifest} from "@/data/contracts/dataManifest";
import type { DataLocale } from "@/data/contracts/staticData";
import { championRepository } from "@/data/repositories/championRepository";
import { toChampion, toChampionSummary } from "@/data/mappers/championMapper";

export const CHAMP_ICON_URL = (VERSION: string, NAME: string) =>
  `https://ddragon.leagueoflegends.com/cdn/${VERSION}/img/champion/${NAME}.png`;
export const PASSIVE_ICON_URL = (VERSION: string, NAME: string) =>
  `https://ddragon.leagueoflegends.com/cdn/${VERSION}/img/passive/${NAME}`;
export const SKILL_ICON_URL = (VERSION: string, NAME: string) =>
  `https://ddragon.leagueoflegends.com/cdn/${VERSION}/img/spell/${NAME}.png`;

/**
 * 정적 데이터(version.json)에서 가져오는 버전 정보
 * - version: Riot 공식 패치 표기이자 정적 데이터 경로 키
 * - ddragonVersion: Data Dragon CDN 요청용 내부 버전
 * - cdragonVersion: Community Dragon 기준 버전 (없을 수도 있음)
 */
export interface DataVersionInfo {
  patchVersion: string;
  ddragonVersion: string;
  cdragonVersion: string;
}

let cachedDataVersions: DataVersionInfo | null = null;
const normalizedItemDataCache = new Map<string, NormalizedItemDataFile>();

export async function getDataVersions(): Promise<DataVersionInfo> {
  // 메모이제이션: 한 번 가져온 버전 정보는 재사용
  if (cachedDataVersions) {
    return cachedDataVersions;
  }

  try {
    const basePath = getRuntimeBasePath();
    const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`;
    const versionUrl = `${normalizedBase}data/version.json`;
    const response = await fetch(versionUrl);

    if (!response.ok) {
        throw new Error(`Failed to fetch version info: ${response.status} ${response.statusText}`);
    }

    const manifest = decodeDataManifest(await response.json());
    cachedDataVersions = {
      patchVersion: manifest.patchVersion,
      ddragonVersion: manifest.sources.ddragon,
      cdragonVersion: manifest.sources.cdragon,
    };
    return cachedDataVersions;
  } catch (error) {
    logger.warn("[Version] Failed to get version from static data:", error);
    throw error;
  }
}

export async function getVersion(): Promise<string> {
  const {patchVersion} = await getDataVersions();
  return patchVersion;
}

export function cleanStaticDataCache(patchVersion: string): void {
  championRepository.clearExceptPatch(patchVersion);
}

export async function getChampionList(
  patchVersion: string,
  locale: DataLocale
): Promise<Champion[]> {
  const index = await championRepository.getIndex(patchVersion, locale);
  const isKo = locale === "ko_KR";
  return index.champions.map((entry) => {
    const champion = toChampionSummary(entry, index.sources.ddragon);
    champion.hangul = isKo
      ? Hangul.d(champion.name, true).map((letters) => letters[0]).join("")
      : "";
    return champion;
  });
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
  const staticUrl = getStaticDataPath(version, `spells/${championId}.json`);

  try {
    const response = await fetch(staticUrl);
    if (!response.ok) {
      // 404 등 실패 시
      return { spellDataMap: {} };
    }

    const data = await response.json() as {
      spellData?: unknown;
      ddragonVersion?: string;
      cdragonVersion?: string | null;
    };
    if (!data.spellData || typeof data.spellData !== "object") {
      return { spellDataMap: {} };
    }

    return {
      spellDataMap: data.spellData as Record<string, unknown>,
      ddragonVersion: data.ddragonVersion,
      cdragonVersion: data.cdragonVersion ?? null,
    };
  } catch (error) {
    logger.warn(`[API] Failed to fetch Community Dragon data for ${championId}`, error);
    throw error;
  }
}

export async function getChampionInfo(
  version: string,
  lang: DataLocale,
  championId: string
): Promise<Champion> {
  return toChampion(await championRepository.getDetail(version, lang, championId));
}
