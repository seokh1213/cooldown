import fs from "node:fs/promises";
import path from "node:path";
import type { ChampionSpell } from "../src/types";
import { delay, mapConcurrent, readJson, type ResearchLocale } from "./lolps-research-utils";

export interface VersionInfo {
  version: string;
  ddragonVersion: string;
  cdragonVersion: string | null;
}

export interface DDragonChampion {
  id: string;
  key: string;
  spells: ChampionSpell[];
}

interface DDragonFull {
  data: Record<string, DDragonChampion>;
}

export interface CDragonLocalizedSpell {
  spellKey: string;
  name: string;
  description: string;
  dynamicDescription: string;
  cost: string;
  cooldown: string;
  costCoefficients: number[];
  cooldownCoefficients: number[];
}

export interface CDragonLocalizedChampion {
  id: number;
  name: string;
  spells: CDragonLocalizedSpell[];
}

export interface LolpsResponse {
  data?: Record<string, unknown> & { championId?: number };
}

export interface LocaleConfig {
  locale: ResearchLocale;
  label: string;
  lolpsSuffix: "Us" | "Kr" | "Cn";
  cdragonLocale: "default" | "ko_kr" | "zh_cn";
  parserLocale: "en_US" | "ko_KR";
}

export const localeConfigs: LocaleConfig[] = [
  {
    locale: "en_US",
    label: "English",
    lolpsSuffix: "Us",
    cdragonLocale: "default",
    parserLocale: "en_US",
  },
  {
    locale: "ko_KR",
    label: "한국어",
    lolpsSuffix: "Kr",
    cdragonLocale: "ko_kr",
    parserLocale: "ko_KR",
  },
  {
    locale: "zh_CN",
    label: "简体中文",
    lolpsSuffix: "Cn",
    cdragonLocale: "zh_cn",
    parserLocale: "en_US",
  },
];

interface FetchOptions {
  cachePath: string;
  refresh: boolean;
  url: string;
}

async function fetchCachedJson<T>({ cachePath, refresh, url }: FetchOptions): Promise<T> {
  if (!refresh) {
    try {
      return await readJson<T>(cachePath);
    } catch {
      // Cache miss: fetch below.
    }
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "cooldown-tooltip-research/2.0" },
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const payload = (await response.json()) as T;
      await fs.mkdir(path.dirname(cachePath), { recursive: true });
      await fs.writeFile(cachePath, `${JSON.stringify(payload, null, 2)}\n`);
      return payload;
    } catch (error) {
      lastError = error;
      await delay(attempt * 300);
    }
  }
  throw new Error(`${url} fetch failed: ${String(lastError)}`);
}

export async function loadLolps(
  championId: number,
  cacheDir: string,
  refresh: boolean
): Promise<LolpsResponse> {
  const legacyPath = path.join(cacheDir, `${championId}.json`);
  const cachePath = path.join(cacheDir, "lolps", `${championId}.json`);
  if (!refresh) {
    try {
      return await readJson<LolpsResponse>(cachePath);
    } catch {
      try {
        return await readJson<LolpsResponse>(legacyPath);
      } catch {
        // Neither cache layout exists: fetch below.
      }
    }
  }
  return fetchCachedJson<LolpsResponse>({
    cachePath,
    refresh,
    url: `https://lol.ps/api/champ/${championId}/basic-info.json`,
  });
}

export async function loadDDragonLocales(
  version: string,
  cacheDir: string,
  refresh: boolean
): Promise<Record<ResearchLocale, Record<string, DDragonChampion>>> {
  const entries = await Promise.all(localeConfigs.map(async ({ locale }) => {
    const payload = await fetchCachedJson<DDragonFull>({
      cachePath: path.join(cacheDir, "ddragon", `${locale}.json`),
      refresh,
      url: `https://ddragon.leagueoflegends.com/cdn/${version}/data/${locale}/championFull.json`,
    });
    return [locale, payload.data] as const;
  }));
  return Object.fromEntries(entries) as Record<ResearchLocale, Record<string, DDragonChampion>>;
}

export async function loadCDragonLocales(
  version: string,
  champions: DDragonChampion[],
  cacheDir: string,
  refresh: boolean
): Promise<Map<string, CDragonLocalizedChampion>> {
  const requests = localeConfigs.flatMap((config) => champions.map((champion) => ({
    champion,
    config,
  })));
  const result = new Map<string, CDragonLocalizedChampion>();
  await mapConcurrent(requests, 8, async ({ champion, config }) => {
    const payload = await fetchCachedJson<CDragonLocalizedChampion>({
      cachePath: path.join(
        cacheDir,
        "cdragon",
        config.locale,
        `${champion.key}.json`
      ),
      refresh,
      url: `https://raw.communitydragon.org/${version}/plugins/rcp-be-lol-game-data/global/${config.cdragonLocale}/v1/champions/${champion.key}.json`,
    });
    result.set(`${config.locale}:${champion.id}`, payload);
    await delay(30);
  });
  return result;
}
