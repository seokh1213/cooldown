import { VersionedCache, getSessionCacheStorage } from "@/data/cache/versionedCache";
import {
  decodeChampionDetail,
  decodeChampionIndex,
} from "@/data/contracts/championDataDecoder";
import type {
  ChampionDetailV2,
  ChampionIndexV2,
} from "@/data/contracts/championData";
import type { DataLocale } from "@/data/contracts/staticData";
import { assertStaticDataIdentity } from "@/data/contracts/staticDataDecoder";
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
    patchVersion: string,
    locale: DataLocale
  ): Promise<ChampionIndexV2> {
    const key = `champions:${patchVersion}:${locale}:index`;
    const cached = this.cache.get(key, decodeChampionIndex);
    if (cached) {
      assertStaticDataIdentity(cached, patchVersion, locale);
      return cached;
    }
    return this.load(
      key,
      `data/${patchVersion}/champions/${locale}/index.json`,
      decodeChampionIndex,
      patchVersion,
      locale
    );
  }

  async getDetail(
    patchVersion: string,
    locale: DataLocale,
    championId: string
  ): Promise<ChampionDetailV2> {
    const key = `champions:${patchVersion}:${locale}:${championId}`;
    const cached = this.cache.get(key, decodeChampionDetail);
    if (cached) {
      assertStaticDataIdentity(cached, patchVersion, locale);
      return cached;
    }
    return this.load(
      key,
      `data/${patchVersion}/champions/${locale}/${championId}.json`,
      decodeChampionDetail,
      patchVersion,
      locale
    );
  }

  clearExceptPatch(patchVersion: string): void {
    this.cache.clearExceptPatch(patchVersion);
  }

  private async load<T extends ChampionIndexV2 | ChampionDetailV2>(
    key: string,
    path: string,
    decode: (value: unknown) => T,
    patchVersion: string,
    locale: DataLocale
  ): Promise<T> {
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

export const championRepository = new ChampionRepository(
  createStaticDataClient(),
  new VersionedCache("cooldown:v2", getSessionCacheStorage())
);
