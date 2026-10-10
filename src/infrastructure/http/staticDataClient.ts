import { getRuntimeBasePath } from "@/domain/game/static-data/staticDataUtils";
import { revisionedDataPath } from "@/app/pwa/release";
import { cacheStaticDataResponse, discardStaticDataResponse, trackStaticDataPath } from "@/app/pwa/staticDataRevision";

export interface StaticDataClient {
  getJson(path: string, validate?: (value: unknown) => void): Promise<unknown>;
}

export function createStaticDataClient(
  fetchJson: typeof fetch = fetch,
  basePath: string = getRuntimeBasePath()
): StaticDataClient {
  const normalizedBase = basePath.endsWith("/") ? basePath : `${basePath}/`;
  const refreshPaths = new Set<string>();
  return {
    async getJson(path: string, validate?: (value: unknown) => void): Promise<unknown> {
      trackStaticDataPath(path);
      const url = `${normalizedBase}${revisionedDataPath(path)}`;
      // CacheFirst can finish its cache write after returning an invalid response.
      const requestUrl = refreshPaths.has(path) ? `${url}?cooldown-retry=${crypto.randomUUID()}` : url;
      const response = await fetchJson(requestUrl);
      if (!response.ok) {
        throw new Error(`Static data request failed (${response.status}): ${path}`);
      }
      const cacheCopy = response.clone();
      let value: unknown;
      try {
        value = await response.json();
        validate?.(value);
      } catch (error) {
        refreshPaths.add(path);
        await discardStaticDataResponse(url);
        if (requestUrl !== url) await discardStaticDataResponse(requestUrl);
        throw error;
      }
      await cacheStaticDataResponse(url, cacheCopy);
      refreshPaths.delete(path);
      return value;
    },
  };
}
