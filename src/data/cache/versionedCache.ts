export interface CacheStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  readonly length: number;
  key(index: number): string | null;
}

export type CacheDecoder<T> = (value: unknown) => T;

export class VersionedCache {
  private readonly memory = new Map<string, unknown>();

  constructor(
    private readonly namespace: string,
    private readonly storage?: CacheStorage
  ) {}

  get<T>(key: string, decode: CacheDecoder<T>): T | undefined {
    const memoryValue = this.memory.get(key);
    if (memoryValue !== undefined) return decode(memoryValue);
    let stored: string | null = null;
    try {
      stored = this.storage?.getItem(this.storageKey(key)) ?? null;
    } catch {
      return undefined;
    }
    if (!stored) return undefined;
    try {
      const decoded = decode(JSON.parse(stored));
      this.memory.set(key, decoded);
      return decoded;
    } catch {
      try {
        this.storage?.removeItem(this.storageKey(key));
      } catch {
        // Storage may be unavailable in private/restricted browser contexts.
      }
      return undefined;
    }
  }

  set<T>(key: string, value: T): T {
    this.memory.set(key, value);
    try {
      this.storage?.setItem(this.storageKey(key), JSON.stringify(value));
    } catch {
      // The in-memory cache remains usable when storage is unavailable or full.
    }
    return value;
  }

  remove(key: string): void {
    this.memory.delete(key);
    try {
      this.storage?.removeItem(this.storageKey(key));
    } catch {
      // The memory entry is still removed when storage is unavailable.
    }
  }

  clearExceptIdentity(identityKey: string): void {
    const prefix = `${this.namespace}:`;
    try {
      for (let index = (this.storage?.length ?? 0) - 1; index >= 0; index -= 1) {
        const key = this.storage?.key(index);
        if (key?.startsWith(prefix) && !key.includes(`:${identityKey}:`)) {
          this.storage?.removeItem(key);
        }
      }
    } catch {
      // Memory cleanup below must still run when storage access fails.
    }
    for (const key of this.memory.keys()) {
      if (!key.includes(`:${identityKey}:`)) this.memory.delete(key);
    }
  }

  private storageKey(key: string): string {
    return `${this.namespace}:${key}`;
  }
}

export function getSessionCacheStorage(): CacheStorage | undefined {
  return typeof window === "undefined" ? undefined : window.sessionStorage;
}
