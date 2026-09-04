import { VersionedCache, getSessionCacheStorage } from "@/data/cache/versionedCache";
import {
  decodeChampionDetail,
  decodeChampionIndex,
} from "@/data/contracts/championDataDecoder";
import type {
  ChampionDetailV2,
  ChampionIndexV2,
} from "@/data/contracts/championData";
import type { DataLocale, StaticDataIdentity } from "@/data/contracts/staticData";
import {
  assertStaticDataIdentity,
  staticDataIdentityKey,
} from "@/data/contracts/staticDataDecoder";
import {
  createStaticDataClient,
  type StaticDataClient,
} from "@/data/http/staticDataClient";

export class ChampionRepository {
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(
    private readonly client: StaticDataClient,
    private readonly cache: VersionedCache
  ) {}

  async getIndex(
    identity: StaticDataIdentity,
    locale: DataLocale
  ): Promise<ChampionIndexV2> {
    const key = `champions:${staticDataIdentityKey(identity)}:${locale}:index`;
    const cached = this.cache.get(key, decodeChampionIndex);
    if (cached) {
      try {
        assertStaticDataIdentity(cached, identity, locale);
        return cached;
      } catch {
        this.cache.remove(key);
      }
    }
    return this.load(
      key,
      `data/${identity.patchVersion}/champions/${locale}/index.json`,
      decodeChampionIndex,
      identity,
      locale
    );
  }

  async getDetail(
    identity: StaticDataIdentity,
    locale: DataLocale,
    championId: string
  ): Promise<ChampionDetailV2> {
    const key = `champions:${staticDataIdentityKey(identity)}:${locale}:${championId}`;
    const cached = this.cache.get(key, decodeChampionDetail);
    if (cached) {
      try {
        assertStaticDataIdentity(cached, identity, locale);
        return cached;
      } catch {
        this.cache.remove(key);
      }
    }
    return this.load(
      key,
      `data/${identity.patchVersion}/champions/${locale}/${championId}.json`,
      decodeChampionDetail,
      identity,
      locale
    );
  }

  clearExceptRelease(identity: StaticDataIdentity): void {
    this.cache.clearExceptIdentity(staticDataIdentityKey(identity));
  }

  private async load<T extends ChampionIndexV2 | ChampionDetailV2>(
    key: string,
    path: string,
    decode: (value: unknown) => T,
    identity: StaticDataIdentity,
    locale: DataLocale
  ): Promise<T> {
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

export const championRepository = new ChampionRepository(
  createStaticDataClient(),
  new VersionedCache("cooldown:v2", getSessionCacheStorage())
);
