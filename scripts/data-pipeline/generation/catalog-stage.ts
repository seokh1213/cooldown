import * as path from "node:path";
import type { StaticDataRelease } from "../../../src/lib/staticDataRelease";
import type {
  NormalizedItemDataFile,
  NormalizedRuneDataFile,
  NormalizedSummonerDataFile,
} from "../../../src/types/combatNormalized";
import type { DataLocale } from "../localization";
import { fetchJson, writeJson } from "../io/json";
import { normalizeItems } from "../normalization/item";
import {
  normalizeRunesAndStatShards,
  type RuneStatShardData,
} from "../normalization/rune";
import { normalizeSummonerSpells } from "../normalization/summoner";
import { fetchCDragonItems, mergeCDragonItems } from "../sources/cdragon-items";
import { fetchCDragonRuneStatShards } from "../sources/cdragon-runes";

interface CatalogSources {
  runes: Record<string, unknown>;
  runeStatShards: Record<string, RuneStatShardData>;
  items: Record<string, unknown>;
  summoners: Record<string, unknown>;
}

const ddragonUrl = (
  version: string,
  locale: DataLocale,
  resource: string,
): string =>
  `https://ddragon.leagueoflegends.com/cdn/${version}/data/${locale}/${resource}`;

async function fetchLocaleCatalogs(
  locale: DataLocale,
  release: StaticDataRelease,
): Promise<{
  runes: unknown;
  runeStatShards: RuneStatShardData;
  items: unknown;
  summoners: unknown;
}> {
  const { ddragon, cdragon } = release.sources;
  console.log(`📜 Fetching catalogs for ${locale}...`);
  const [runes, runeStatShards, ddragonItems, cdragonItems, summoners] =
    await Promise.all([
      fetchJson(ddragonUrl(ddragon, locale, "runesReforged.json")),
      fetchCDragonRuneStatShards(locale, cdragon),
      fetchJson(ddragonUrl(ddragon, locale, "item.json")),
      fetchCDragonItems(locale, cdragon),
      fetchJson(ddragonUrl(ddragon, locale, "summoner.json")),
    ]);
  if (runeStatShards.groups.length === 0) {
    throw new Error(`[CD][Runes] Empty ${cdragon}/${locale} stat shard snapshot`);
  }
  console.log(`✅ Fetched rune, item, and summoner catalogs for ${locale}`);
  return {
    runes,
    runeStatShards,
    items: mergeCDragonItems(ddragonItems, cdragonItems),
    summoners,
  };
}

export async function fetchCatalogSources(
  release: StaticDataRelease,
  locales: readonly DataLocale[],
): Promise<CatalogSources> {
  const sources: CatalogSources = {
    runes: {},
    runeStatShards: {},
    items: {},
    summoners: {},
  };
  for (const locale of locales) {
    const catalog = await fetchLocaleCatalogs(locale, release);
    sources.runes[locale] = catalog.runes;
    sources.runeStatShards[locale] = catalog.runeStatShards;
    sources.items[locale] = catalog.items;
    sources.summoners[locale] = catalog.summoners;
  }
  return sources;
}

async function writeLocaleCatalogs(
  versionDir: string,
  release: StaticDataRelease,
  locale: DataLocale,
  source: CatalogSources,
): Promise<void> {
  const metadata = {
    schemaVersion: 2 as const,
    patchVersion: release.patchVersion,
    locale,
    sources: release.sources,
  };
  const items: NormalizedItemDataFile = {
    ...metadata,
    items: normalizeItems(locale, source.items[locale]),
  };
  const normalizedRunes = normalizeRunesAndStatShards(
    locale,
    source.runes[locale],
    source.runeStatShards[locale],
    source.runeStatShards.en_US,
  );
  const runes: NormalizedRuneDataFile = { ...metadata, ...normalizedRunes };
  const summoners: NormalizedSummonerDataFile = {
    ...metadata,
    spells: normalizeSummonerSpells(source.summoners[locale]),
  };
  await Promise.all([
    writeJson(items, path.join(versionDir, `items-normalized-${locale}.json`)),
    writeJson(runes, path.join(versionDir, `runes-normalized-${locale}.json`)),
    writeJson(
      summoners,
      path.join(versionDir, `summoner-normalized-${locale}.json`),
    ),
  ]);
  console.log(`✅ Saved normalized catalogs for ${locale}`);
}

export async function writeCatalogData(
  versionDir: string,
  release: StaticDataRelease,
  locales: readonly DataLocale[],
  source: CatalogSources,
): Promise<void> {
  for (const locale of locales) {
    await writeLocaleCatalogs(versionDir, release, locale, source);
  }
}
