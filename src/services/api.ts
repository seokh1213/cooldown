import Hangul from "hangul-js";
import { decodeDataManifest } from "@/data/contracts/dataManifest";
import type { DataLocale } from "@/data/contracts/staticData";
import { toChampion, toChampionSummary } from "@/data/mappers/championMapper";
import { toRuneStatShards, toRuneTrees } from "@/data/mappers/runeMapper";
import { championRepository } from "@/data/repositories/championRepository";
import { gameDataRepository } from "@/data/repositories/gameDataRepository";
import { logger } from "@/lib/logger";
import { getRuntimeBasePath, getStaticDataPath } from "@/lib/staticDataUtils";
import type { Champion, RuneStatShardStaticData, RuneTree } from "@/types";
import type {
  NormalizedItem,
  NormalizedRuneDataFile,
  NormalizedSummonerSpell,
} from "@/types/combatNormalized";

export interface DataVersionInfo {
  patchVersion: string;
  ddragonVersion: string;
  cdragonVersion: string;
}

let cachedDataVersions: DataVersionInfo | null = null;

export async function getDataVersions(): Promise<DataVersionInfo> {
  if (cachedDataVersions) return cachedDataVersions;
  try {
    const basePath = getRuntimeBasePath();
    const normalizedBase = basePath.endsWith("/") ? basePath : `${basePath}/`;
    const response = await fetch(`${normalizedBase}data/version.json`);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch version info: ${response.status} ${response.statusText}`
      );
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
  return (await getDataVersions()).patchVersion;
}

export function cleanStaticDataCache(patchVersion: string): void {
  championRepository.clearExceptPatch(patchVersion);
  gameDataRepository.clearExceptPatch(patchVersion);
}

export async function getChampionList(
  patchVersion: string,
  locale: DataLocale
): Promise<Champion[]> {
  const index = await championRepository.getIndex(patchVersion, locale);
  return index.champions.map((entry) => {
    const champion = toChampionSummary(entry, index.sources.ddragon);
    champion.hangul =
      locale === "ko_KR"
        ? Hangul.d(champion.name, true).map((letters) => letters[0]).join("")
        : "";
    return champion;
  });
}

export function getNormalizedRunes(
  patchVersion: string,
  locale: DataLocale
): Promise<NormalizedRuneDataFile> {
  return gameDataRepository.getRunes(patchVersion, locale);
}

export async function getRuneTrees(
  patchVersion: string,
  locale: DataLocale
): Promise<RuneTree[]> {
  return toRuneTrees(await getNormalizedRunes(patchVersion, locale));
}

export async function getRuneStatShards(
  patchVersion: string,
  locale: DataLocale
): Promise<RuneStatShardStaticData> {
  return toRuneStatShards(await getNormalizedRunes(patchVersion, locale));
}

export async function getNormalizedItems(
  patchVersion: string,
  locale: DataLocale
): Promise<NormalizedItem[]> {
  return (await gameDataRepository.getItems(patchVersion, locale)).items;
}

export async function getNormalizedSummonerSpells(
  patchVersion: string,
  locale: DataLocale
): Promise<NormalizedSummonerSpell[]> {
  return (await gameDataRepository.getSummoners(patchVersion, locale)).spells;
}

export interface CommunityDragonSpellResult {
  spellDataMap: Record<string, unknown>;
  ddragonVersion?: string;
  cdragonVersion?: string | null;
}

/** @deprecated Simulation's typed Ability v2 migration will remove this endpoint. */
export async function getCommunityDragonSpellData(
  championId: string,
  patchVersion: string
): Promise<CommunityDragonSpellResult> {
  try {
    const response = await fetch(
      getStaticDataPath(patchVersion, `spells/${championId}.json`)
    );
    if (!response.ok) return { spellDataMap: {} };
    const data = (await response.json()) as {
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
  patchVersion: string,
  locale: DataLocale,
  championId: string
): Promise<Champion> {
  const detail = await championRepository.getDetail(
    patchVersion,
    locale,
    championId
  );
  return toChampion(detail);
}
