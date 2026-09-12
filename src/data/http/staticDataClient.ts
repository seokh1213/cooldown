import { getRuntimeBasePath } from "@/lib/staticDataUtils";
import { revisionedDataPath } from "@/pwa/release";
import { cacheStaticDataResponse, trackStaticDataPath } from "@/pwa/staticDataRevision";

export interface StaticDataClient {
  getJson(path: string): Promise<unknown>;
}

export function createStaticDataClient(
  fetchJson: typeof fetch = fetch,
  basePath: string = getRuntimeBasePath()
): StaticDataClient {
  const normalizedBase = basePath.endsWith("/") ? basePath : `${basePath}/`;
  return {
    async getJson(path: string): Promise<unknown> {
      trackStaticDataPath(path);
      const url = `${normalizedBase}${revisionedDataPath(path)}`;
      const response = await fetchJson(url);
      if (!response.ok) {
        throw new Error(`Static data request failed (${response.status}): ${path}`);
      }
      const cacheCopy = response.clone();
      const value = await response.json();
      await cacheStaticDataResponse(url, cacheCopy);
      return value;
    },
  };
}
