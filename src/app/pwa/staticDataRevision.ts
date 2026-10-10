import { getRuntimeBasePath } from "../../domain/game/staticDataUtils";
import { DATA_VERSION, RELEASE_DATA_CACHE, revisionedDataPath, type AppRelease } from "./release";
import { decodeDataManifest } from "../../domain/game/contracts/dataManifest";

const requestedPaths = new Set<string>();
const refreshUrls = new Set<string>();

export function trackStaticDataPath(path: string): void {
  requestedPaths.add(path);
}

export async function cacheStaticDataResponse(url: string, response: Response): Promise<void> {
  if (DATA_VERSION === "dev" || typeof caches === "undefined") return;
  try {
    await (await caches.open(RELEASE_DATA_CACHE)).put(url, response);
  } catch {
    // Quota or browser privacy restrictions must not prevent online data access.
  }
}

export async function discardStaticDataResponse(url: string): Promise<void> {
  if (DATA_VERSION === "dev" || typeof caches === "undefined") return;
  try {
    await (await caches.open(RELEASE_DATA_CACHE)).delete(url);
  } catch {
    // Evict only the failed response; offline data from other paths stays usable.
  }
}

export async function prepareReleaseData(release: AppRelease): Promise<void> {
  if (release.dataVersion === DATA_VERSION) return;
  const cache = await caches.open(RELEASE_DATA_CACHE);
  const { assertReleaseData } = await import("../../domain/game/contracts/releaseDataDecoder");
  const load = async (path: string, validate: (value: unknown) => void): Promise<unknown> => {
    const url = getRuntimeBasePath() + revisionedDataPath(path, release.dataVersion);
    const cached = await cache.match(url);
    if (cached) {
      try {
        const value: unknown = await cached.json();
        validate(value);
        return value;
      } catch {
        refreshUrls.add(url);
        await discardStaticDataResponse(url);
      }
    }
    const requestUrl = refreshUrls.has(url) ? `${url}?cooldown-retry=${crypto.randomUUID()}` : url;
    const response = await fetch(requestUrl, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error("New release data is not ready");
    try {
      const value: unknown = await response.clone().json();
      validate(value);
      await cache.put(url, response);
      refreshUrls.delete(url);
      return value;
    } catch (error) {
      refreshUrls.add(url);
      await discardStaticDataResponse(url);
      if (requestUrl !== url) await discardStaticDataResponse(requestUrl);
      throw error;
    }
  };
  const manifest = decodeDataManifest(await load("data/version.json", (value) => {
    if (decodeDataManifest(value).patchVersion !== release.patchVersion) throw new Error("Release manifest patch mismatch");
  }));
  const paths = new Set(["data/version.json", ...requestedPaths]);
  // Include data used by other open tabs, even when this tab has not viewed it.
  const currentPrefix = new URL(`${getRuntimeBasePath()}data/releases/${DATA_VERSION}/`, location.origin).href;
  for (const request of await cache.keys()) {
    if (request.url.startsWith(currentPrefix)) paths.add(`data/${request.url.slice(currentPrefix.length).split("?")[0]}`);
  }
  await Promise.all([...paths].map(async (path) => {
    const nextPath = path.replace(/^data\/\d+\.\d+\//, `data/${release.patchVersion}/`);
    if (nextPath === "data/version.json") return;
    await load(nextPath, (value) => assertReleaseData(nextPath, value, manifest));
  }));
}
