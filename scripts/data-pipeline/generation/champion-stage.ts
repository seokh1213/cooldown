import type { Champion } from "../../../src/types";
import type { StaticDataRelease } from "../../../src/lib/staticDataRelease";
import type { NormalizedChampion } from "../../../src/types/combatNormalized";
import type { CommunityDragonSpellData } from "../../../src/lib/spellTooltipParser/types";
import { extractPassiveSpell } from "../../passive-tooltip-data";
import {
  extractActiveSpells,
  type ActiveSpellSourceData,
  type ActiveSpellExtraction,
} from "../cdragon-active-spells";
import {
  requireMapValue,
  type ChampionSpellData,
  type ChampionsByLocale,
} from "../champion-source";
import { writeChampionV2Dataset } from "../champion-v2-writer";
import { fetchJson } from "../io/json";
import type { DataLocale } from "../localization";
import { normalizeChampion } from "../normalization/champion";
import { fetchCDragonChampion } from "../sources/cdragon-champion";
import {
  localizeActiveTooltips,
  localizePassiveTooltips,
} from "./tooltip-localizer";

interface ChampionListResponse {
  data?: Record<string, { name?: string }>;
}

interface ChampionDetailResponse {
  data?: Record<string, Champion>;
}

type MutableChampionsByLocale = Map<DataLocale, Map<string, Champion>>;

export interface ChampionSources {
  championIds: string[];
  championsByLocale: ChampionsByLocale;
  spellDataByChampion: ReadonlyMap<string, ChampionSpellData>;
  abilitySourcesByChampion: ReadonlyMap<string, ActiveSpellSourceData[]>;
}

function championListUrl(ddragonVersion: string, locale: DataLocale): string {
  return `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/data/${locale}/champion.json`;
}

function championDetailUrl(
  ddragonVersion: string,
  locale: DataLocale,
  championId: string,
): string {
  return `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/data/${locale}/champion/${championId}.json`;
}

async function fetchChampionIds(ddragonVersion: string): Promise<string[]> {
  const response = await fetchJson<ChampionListResponse>(
    championListUrl(ddragonVersion, "ko_KR"),
  );
  return Object.keys(response.data ?? {});
}

async function fetchDDragonBatch(
  championIds: readonly string[],
  ddragonVersion: string,
  locales: readonly DataLocale[],
  championsByLocale: MutableChampionsByLocale,
): Promise<void> {
  const requests = championIds.flatMap((championId) =>
    locales.map(async (locale) => {
      const response = await fetchJson<ChampionDetailResponse>(
        championDetailUrl(ddragonVersion, locale, championId),
      );
      const champion = response.data?.[championId];
      if (!champion) throw new Error(`Missing DDragon champion: ${championId}/${locale}`);
      requireMapValue(championsByLocale, locale, "champion locale").set(
        championId,
        champion,
      );
    }),
  );
  await Promise.all(requests);
}

async function fetchDDragonSnapshot(
  championIds: readonly string[],
  ddragonVersion: string,
  locales: readonly DataLocale[],
): Promise<MutableChampionsByLocale> {
  const champions = new Map(
    locales.map((locale) => [locale, new Map<string, Champion>()] as const),
  );
  const batchSize = 10;
  for (let index = 0; index < championIds.length; index += batchSize) {
    const batch = championIds.slice(index, index + batchSize);
    console.log(`📥 Fetching DDragon champions ${index + 1}-${index + batch.length}`);
    await fetchDDragonBatch(batch, ddragonVersion, locales, champions);
  }
  return champions;
}

function buildSpellData(
  activeSpells: ActiveSpellExtraction,
  passive: ReturnType<typeof extractPassiveSpell>,
): Record<string, CommunityDragonSpellData> {
  const spellData = Object.fromEntries(
    Object.entries(activeSpells.aliases).map(([key, activeSpell]) => {
      const { source: _source, ...calculationData } = activeSpell;
      return [key, calculationData];
    }),
  );
  if (passive) {
    spellData.P = passive.spellData;
    spellData[passive.id] = passive.spellData;
  }
  return spellData;
}

async function fetchCDragonChampionData(
  championId: string,
  cdragonVersion: string,
  championsByLocale: ChampionsByLocale,
): Promise<{
  spellData: ChampionSpellData;
  abilitySources: ActiveSpellSourceData[];
}> {
  const source = await fetchCDragonChampion(championId, cdragonVersion);
  const activeSpells = extractActiveSpells(source, championId.toLowerCase());
  const passive = extractPassiveSpell(source, championId);
  await Promise.all([
    localizeActiveTooltips(
      championsByLocale,
      championId,
      cdragonVersion,
      activeSpells.ordered,
    ),
    localizePassiveTooltips(
      championsByLocale,
      championId,
      cdragonVersion,
      passive,
    ),
  ]);
  return {
    spellData: buildSpellData(activeSpells, passive),
    abilitySources: activeSpells.ordered.map(({ source: ability }) => ability),
  };
}

async function fetchCDragonSnapshot(
  championIds: readonly string[],
  cdragonVersion: string,
  championsByLocale: ChampionsByLocale,
): Promise<{
  spellDataByChampion: Map<string, ChampionSpellData>;
  abilitySourcesByChampion: Map<string, ActiveSpellSourceData[]>;
}> {
  const spellDataByChampion = new Map<string, ChampionSpellData>();
  const abilitySourcesByChampion = new Map<string, ActiveSpellSourceData[]>();
  const batchSize = 5;
  for (let index = 0; index < championIds.length; index += batchSize) {
    const batch = championIds.slice(index, index + batchSize);
    console.log(`📥 Fetching CDragon champions ${index + 1}-${index + batch.length}`);
    const entries = await Promise.all(
      batch.map(async (championId) => ({
        championId,
        data: await fetchCDragonChampionData(
          championId,
          cdragonVersion,
          championsByLocale,
        ),
      })),
    );
    for (const { championId, data } of entries) {
      if (Object.keys(data.spellData).length === 0) {
        throw new Error(`Missing CDragon spell data: ${championId}`);
      }
      spellDataByChampion.set(championId, data.spellData);
      abilitySourcesByChampion.set(championId, data.abilitySources);
    }
  }
  return { spellDataByChampion, abilitySourcesByChampion };
}

export async function fetchChampionSources(
  release: StaticDataRelease,
  locales: readonly DataLocale[],
): Promise<ChampionSources> {
  const championIds = await fetchChampionIds(release.sources.ddragon);
  console.log(`📚 Processing ${championIds.length} champions`);
  const championsByLocale = await fetchDDragonSnapshot(
    championIds,
    release.sources.ddragon,
    locales,
  );
  const cdragon = await fetchCDragonSnapshot(
    championIds,
    release.sources.cdragon,
    championsByLocale,
  );
  return { championIds, championsByLocale, ...cdragon };
}

export function writeChampionData(
  versionDir: string,
  release: StaticDataRelease,
  locales: readonly DataLocale[],
  source: ChampionSources,
): void {
  for (const locale of locales) {
    const championsById = requireMapValue(
      source.championsByLocale,
      locale,
      "champion locale",
    );
    const normalizedChampions: NormalizedChampion[] = source.championIds.map(
      (championId) => normalizeChampion({
        locale,
        championId,
        champion: requireMapValue(championsById, championId, `${locale} champion`),
        spellData: requireMapValue(
          source.spellDataByChampion,
          championId,
          "champion spell data",
        ),
      }),
    );
    const count = writeChampionV2Dataset({
      versionDir,
      patchVersion: release.patchVersion,
      locale,
      sources: release.sources,
      championIds: source.championIds,
      normalizedChampions,
      championsById,
      spellDataByChampion: source.spellDataByChampion,
    });
    console.log(`✅ Saved v2 champion data for ${locale} (${count} champions)`);
  }
}
