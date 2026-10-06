import type { VersionedCache } from "@/data/cache/versionedCache";
import type { DataLocale, StaticDataIdentity, StaticDataMetadata } from "@/data/contracts/staticData";
import { assertStaticDataIdentity, staticDataIdentityKey } from "@/data/contracts/staticDataDecoder";
import type { StaticDataClient } from "@/data/http/staticDataClient";
import { trackStaticDataPath } from "@/pwa/staticDataRevision";

interface StaticDataRequest<T> {
  key: string;
  path: string;
  decode: (value: unknown) => T;
  identity: StaticDataIdentity;
  locale: DataLocale;
}

export class StaticDataRepository {
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(
    private readonly client: StaticDataClient,
    private readonly cache: VersionedCache
  ) {}

  async get<T extends StaticDataMetadata>({ key, path, decode, identity, locale }: StaticDataRequest<T>): Promise<T> {
    trackStaticDataPath(path);
    const decodeValidated = (value: unknown): T => {
      const decoded = decode(value);
      assertStaticDataIdentity(decoded, identity, locale);
      return decoded;
    };
    try {
      const cached = this.cache.get(key, decodeValidated);
      if (cached !== undefined) return cached;
    } catch {
      this.cache.remove(key);
    }

    const active = this.inFlight.get(key) as Promise<T> | undefined;
    if (active) return active;
    // Validate before HTTP caching and again for clients that skip that callback.
    const request = this.client.getJson(path, decodeValidated).then((value) =>
      this.cache.set(key, decodeValidated(value))
    );
    this.inFlight.set(key, request);
    try {
      return await request;
    } finally {
      this.inFlight.delete(key);
    }
  }

  clearExceptRelease(identity: StaticDataIdentity): void {
    this.cache.clearExceptIdentity(staticDataIdentityKey(identity));
  }
}
