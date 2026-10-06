import { VersionedCache } from "@/data/cache/versionedCache";
import { createReleaseCache } from "@/data/cache/releaseCache";
import { StaticDataRepository } from "./staticDataRepository";
import { decodeChampionProfile, type ChampionProfile } from "@/data/contracts/championProfile";
import {
  decodeNormalizedItems,
  decodeNormalizedRunes,
  decodeNormalizedSummoners,
} from "@/data/contracts/normalizedDataDecoder";
import { staticDataIdentityKey } from "@/data/contracts/staticDataDecoder";
import type {
  DataLocale,
  StaticDataIdentity,
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
  private readonly files: StaticDataRepository;

  constructor(
    client: StaticDataClient,
    cache: VersionedCache
  ) {
    this.files = new StaticDataRepository(client, cache);
  }

  getItems(
    identity: StaticDataIdentity,
    locale: DataLocale
  ): Promise<NormalizedItemDataFile> {
    return this.files.get({
      key: `items:structured-v1:${staticDataIdentityKey(identity)}:${locale}`,
      path: `data/${identity.patchVersion}/items-normalized-${locale}.json`,
      decode: decodeNormalizedItems,
      identity,
      locale,
    });
  }

  getChampionProfile(identity: StaticDataIdentity, locale: DataLocale, id: string): Promise<ChampionProfile> {
    if (!/^[A-Za-z0-9]+$/.test(id)) return Promise.reject(new Error("Invalid champion id"));
    return this.files.get({
      key: `profile:skins-v1:${staticDataIdentityKey(identity)}:${locale}:${id}`,
      path: `data/${identity.patchVersion}/champion-profiles/${locale}/${id}.json`,
      decode: (value) => {
        const profile = decodeChampionProfile(value);
        if (profile.champion.id !== id) throw new Error("Champion profile id mismatch");
        return profile;
      },
      identity,
      locale,
    });
  }

  getRunes(
    identity: StaticDataIdentity,
    locale: DataLocale
  ): Promise<NormalizedRuneDataFile> {
    return this.files.get({
      key: `runes:${staticDataIdentityKey(identity)}:${locale}`,
      path: `data/${identity.patchVersion}/runes-normalized-${locale}.json`,
      decode: decodeNormalizedRunes,
      identity,
      locale,
    });
  }

  getSummoners(
    identity: StaticDataIdentity,
    locale: DataLocale
  ): Promise<NormalizedSummonerDataFile> {
    return this.files.get({
      key: `summoners:${staticDataIdentityKey(identity)}:${locale}`,
      path: `data/${identity.patchVersion}/summoner-normalized-${locale}.json`,
      decode: decodeNormalizedSummoners,
      identity,
      locale,
    });
  }

  clearExceptRelease(identity: StaticDataIdentity): void {
    this.files.clearExceptRelease(identity);
  }
}

export const gameDataRepository = new GameDataRepository(
  createStaticDataClient(),
  createReleaseCache()
);
