import { VersionedCache, getSessionCacheStorage } from "@/data/cache/versionedCache";
import {
  decodeNormalizedItems,
  decodeNormalizedRunes,
  decodeNormalizedSummoners,
} from "@/data/contracts/normalizedDataDecoder";
import {
  assertStaticDataIdentity,
  staticDataIdentityKey,
} from "@/data/contracts/staticDataDecoder";
import type {
  DataLocale,
  StaticDataIdentity,
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
    identity: StaticDataIdentity,
    locale: DataLocale
  ): Promise<NormalizedItemDataFile> {
    return this.getFile(
      `items:${staticDataIdentityKey(identity)}:${locale}`,
      `data/${identity.patchVersion}/items-normalized-${locale}.json`,
      decodeNormalizedItems,
      identity,
      locale
    );
  }

  getRunes(
    identity: StaticDataIdentity,
    locale: DataLocale
  ): Promise<NormalizedRuneDataFile> {
    return this.getFile(
      `runes:${staticDataIdentityKey(identity)}:${locale}`,
      `data/${identity.patchVersion}/runes-normalized-${locale}.json`,
      decodeNormalizedRunes,
      identity,
      locale
    );
  }

  getSummoners(
    identity: StaticDataIdentity,
    locale: DataLocale
  ): Promise<NormalizedSummonerDataFile> {
    return this.getFile(
      `summoners:${staticDataIdentityKey(identity)}:${locale}`,
      `data/${identity.patchVersion}/summoner-normalized-${locale}.json`,
      decodeNormalizedSummoners,
      identity,
      locale
    );
  }

  clearExceptRelease(identity: StaticDataIdentity): void {
    this.cache.clearExceptIdentity(staticDataIdentityKey(identity));
  }

  private async getFile<T extends StaticDataMetadata>(
    key: string,
    path: string,
    decode: (value: unknown) => T,
    identity: StaticDataIdentity,
    locale: DataLocale
  ): Promise<T> {
    const cached = this.cache.get(key, decode);
    if (cached) {
      try {
        assertStaticDataIdentity(cached, identity, locale);
        return cached;
      } catch {
        this.cache.remove(key);
      }
    }
    const active = this.inFlight.get(key) as Promise<T> | undefined;
    if (active) return active;
    const request = this.client.getJson(path).then((value) => {
      const decoded = decode(value);
      assertStaticDataIdentity(decoded, identity, locale);
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
