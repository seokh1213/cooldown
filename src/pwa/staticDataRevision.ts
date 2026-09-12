import { getRuntimeBasePath } from "../lib/staticDataUtils";
import { DATA_VERSION, RELEASE_DATA_CACHE, revisionedDataPath, type AppRelease } from "./release";

const requestedPaths = new Set<string>();

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

export async function prepareReleaseData(release: AppRelease): Promise<void> {
  if (release.dataVersion === DATA_VERSION) return;
  const cache = await caches.open(RELEASE_DATA_CACHE);
  const paths = new Set(["data/version.json", ...requestedPaths]);
  // Include data used by other open tabs, even when this tab has not viewed it.
  const currentPrefix = new URL(`${getRuntimeBasePath()}data/releases/${DATA_VERSION}/`, location.origin).href;
  for (const request of await cache.keys()) {
    if (request.url.startsWith(currentPrefix)) paths.add(`data/${request.url.slice(currentPrefix.length)}`);
  }
  await Promise.all([...paths].map(async (path) => {
    const nextPath = path.replace(/^data\/\d+\.\d+\//, `data/${release.patchVersion}/`);
    const url = getRuntimeBasePath() + revisionedDataPath(nextPath, release.dataVersion);
    if (await cache.match(url)) return;
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error("New release data is not ready");
    await response.clone().json();
    await cache.put(url, response);
  }));
}
