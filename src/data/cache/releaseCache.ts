import { RELEASE_ID } from "../../pwa/release";
import { VersionedCache, getSessionCacheStorage } from "./versionedCache";

export function createReleaseCache(): VersionedCache {
  const namespace = `cooldown:v3:${RELEASE_ID}`;
  const storage = getSessionCacheStorage();
  try {
    for (let index = (storage?.length ?? 0) - 1; index >= 0; index -= 1) {
      const key = storage?.key(index);
      if (key && (key.startsWith("cooldown:v2:") || key.startsWith("cooldown:v3:")) &&
        !key.startsWith(`${namespace}:`)) storage?.removeItem(key);
    }
  } catch {
    // Computed-data caches are optional; user preferences are never touched.
  }
  return new VersionedCache(namespace, storage);
}
