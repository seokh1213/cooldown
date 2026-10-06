import { VersionedCache } from "@/data/cache/versionedCache";
import { createReleaseCache } from "@/data/cache/releaseCache";
import { StaticDataRepository } from "./staticDataRepository";
import {
  decodeChampionDetail,
  decodeChampionIndex,
} from "@/data/contracts/championDataDecoder";
import type {
  ChampionDetailV2,
  ChampionIndexV2,
} from "@/data/contracts/championData";
import type { DataLocale, StaticDataIdentity } from "@/data/contracts/staticData";
import { staticDataIdentityKey } from "@/data/contracts/staticDataDecoder";
import {
  createStaticDataClient,
  type StaticDataClient,
} from "@/data/http/staticDataClient";

export class ChampionRepository {
  private readonly files: StaticDataRepository;

  constructor(
    client: StaticDataClient,
    cache: VersionedCache
  ) {
    this.files = new StaticDataRepository(client, cache);
  }

  async getIndex(
    identity: StaticDataIdentity,
    locale: DataLocale
  ): Promise<ChampionIndexV2> {
    return this.files.get({
      key: `champions:${staticDataIdentityKey(identity)}:${locale}:index`,
      path: `data/${identity.patchVersion}/champions/${locale}/index.json`,
      decode: decodeChampionIndex,
      identity,
      locale,
    });
  }

  async getDetail(
    identity: StaticDataIdentity,
    locale: DataLocale,
    championId: string
  ): Promise<ChampionDetailV2> {
    return this.files.get({
      key: `champions:forms-v1:${staticDataIdentityKey(identity)}:${locale}:${championId}`,
      path: `data/${identity.patchVersion}/champions/${locale}/${championId}.json`,
      decode: (value) => {
        const detail = decodeChampionDetail(value);
        if (detail.champion.id !== championId) throw new Error("Champion detail id mismatch");
        return detail;
      },
      identity,
      locale,
    });
  }

  clearExceptRelease(identity: StaticDataIdentity): void {
    this.files.clearExceptRelease(identity);
  }
}

export const championRepository = new ChampionRepository(
  createStaticDataClient(),
  createReleaseCache()
);
