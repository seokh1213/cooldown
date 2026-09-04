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
import {
  createStaticDataClient,
  type StaticDataClient,
} from "@/data/http/staticDataClient";

export class ChampionRepository {
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
    if (cached) return cached;
    const value = await this.client.getJson(
      `data/${patchVersion}/champions/${locale}/index.json`
    );
    return this.cache.set(key, decodeChampionIndex(value));
  }

  async getDetail(
    patchVersion: string,
    locale: DataLocale,
    championId: string
  ): Promise<ChampionDetailV2> {
    const key = `champions:${patchVersion}:${locale}:${championId}`;
    const cached = this.cache.get(key, decodeChampionDetail);
    if (cached) return cached;
    const value = await this.client.getJson(
      `data/${patchVersion}/champions/${locale}/${championId}.json`
    );
    return this.cache.set(key, decodeChampionDetail(value));
  }

  clearExceptPatch(patchVersion: string): void {
    this.cache.clearExceptPatch(patchVersion);
  }
}

export const championRepository = new ChampionRepository(
  createStaticDataClient(),
  new VersionedCache("cooldown:v2", getSessionCacheStorage())
);
