export interface AppRelease {
  schemaVersion: 1;
  releaseId: string;
  appVersion: string;
  dataVersion: string;
  patchVersion: string;
}

export const APP_VERSION = import.meta.env?.VITE_APP_VERSION ?? "dev";
export const DATA_VERSION = import.meta.env?.VITE_DATA_VERSION ?? "dev";
export const RELEASE_ID = import.meta.env?.VITE_RELEASE_ID ?? "dev";
export const RELEASE_DATA_CACHE = "cooldown-game-data-releases-v1";

export function decodeAppRelease(value: unknown): AppRelease {
  if (!value || typeof value !== "object") throw new Error("Invalid app release");
  const release = value as Record<string, unknown>;
  if (release.schemaVersion !== 1 ||
    ![release.releaseId, release.appVersion, release.dataVersion].every((version) =>
      typeof version === "string" && /^[a-f0-9]{32}$/.test(version)) ||
    typeof release.patchVersion !== "string" || !/^\d+\.\d+$/.test(release.patchVersion)) {
    throw new Error("Invalid app release");
  }
  return release as unknown as AppRelease;
}

export function revisionedDataPath(path: string, version = DATA_VERSION): string {
  const normalized = path.replace(/^\//, "");
  return version === "dev" || !normalized.startsWith("data/")
    ? normalized
    : `data/releases/${version}/${normalized.slice(5)}`;
}
