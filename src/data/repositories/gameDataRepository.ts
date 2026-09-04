import { VersionedCache, getSessionCacheStorage } from "@/data/cache/versionedCache";
import {
  decodeNormalizedItems,
  decodeNormalizedRunes,
  decodeNormalizedSummoners,
} from "@/data/contracts/normalizedDataDecoder";
import { assertStaticDataIdentity } from "@/data/contracts/staticDataDecoder";
import type {
  DataLocale,
  StaticDataMetadata,
} from "@/data/contracts/staticData";
import {
  createStaticDataClient,
  type StaticDataClient,
} from "@/data/http/staticDataClient";
import type {
  NormalizedItemDataFile,
  NormalizedRuneDataFile,
  NormalizedSummonerDataFile,
} from "@/types/combatNormalized";

export class GameDataRepository {
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(
    private readonly client: StaticDataClient,
    private readonly cache: VersionedCache
  ) {}

  getItems(
    patchVersion: string,
    locale: DataLocale
  ): Promise<NormalizedItemDataFile> {
    return this.getFile(
      `items:${patchVersion}:${locale}`,
      `data/${patchVersion}/items-normalized-${locale}.json`,
      decodeNormalizedItems,
      patchVersion,
      locale
    );
  }

  getRunes(
    patchVersion: string,
    locale: DataLocale
  ): Promise<NormalizedRuneDataFile> {
    return this.getFile(
      `runes:${patchVersion}:${locale}`,
      `data/${patchVersion}/runes-normalized-${locale}.json`,
      decodeNormalizedRunes,
      patchVersion,
      locale
    );
  }

  getSummoners(
    patchVersion: string,
    locale: DataLocale
  ): Promise<NormalizedSummonerDataFile> {
    return this.getFile(
      `summoners:${patchVersion}:${locale}`,
      `data/${patchVersion}/summoner-normalized-${locale}.json`,
      decodeNormalizedSummoners,
      patchVersion,
      locale
    );
  }

  clearExceptPatch(patchVersion: string): void {
    this.cache.clearExceptPatch(patchVersion);
  }

  private async getFile<T extends StaticDataMetadata>(
    key: string,
    path: string,
    decode: (value: unknown) => T,
    patchVersion: string,
    locale: DataLocale
  ): Promise<T> {
    const cached = this.cache.get(key, decode);
    if (cached) {
      assertStaticDataIdentity(cached, patchVersion, locale);
      return cached;
    }
    const active = this.inFlight.get(key) as Promise<T> | undefined;
    if (active) return active;
    const request = this.client.getJson(path).then((value) => {
      const decoded = decode(value);
      assertStaticDataIdentity(decoded, patchVersion, locale);
      return this.cache.set(key, decoded);
    });
    this.inFlight.set(key, request);
    try {
      return await request;
    } finally {
      this.inFlight.delete(key);
    }
  }
}

export const gameDataRepository = new GameDataRepository(
  createStaticDataClient(),
  new VersionedCache("cooldown:v2", getSessionCacheStorage())
);
