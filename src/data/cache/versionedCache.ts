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
    const stored = this.storage?.getItem(this.storageKey(key));
    if (!stored) return undefined;
    try {
      const decoded = decode(JSON.parse(stored));
      this.memory.set(key, decoded);
      return decoded;
    } catch {
      this.storage?.removeItem(this.storageKey(key));
      return undefined;
    }
  }

  set<T>(key: string, value: T): T {
    this.memory.set(key, value);
    this.storage?.setItem(this.storageKey(key), JSON.stringify(value));
    return value;
  }

  clearExceptPatch(patchVersion: string): void {
    const prefix = `${this.namespace}:`;
    for (let index = this.storage?.length ?? 0; index >= 0; index -= 1) {
      const key = this.storage?.key(index);
      if (key?.startsWith(prefix) && !key.includes(`:${patchVersion}:`)) {
        this.storage?.removeItem(key);
      }
    }
    for (const key of this.memory.keys()) {
      if (!key.includes(`:${patchVersion}:`)) this.memory.delete(key);
    }
  }

  private storageKey(key: string): string {
    return `${this.namespace}:${key}`;
  }
}

export function getSessionCacheStorage(): CacheStorage | undefined {
  return typeof window === "undefined" ? undefined : window.sessionStorage;
}
