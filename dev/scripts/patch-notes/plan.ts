import { resolveStaticDataRelease } from "../../../src/domain/game/static-data/staticDataRelease";

export interface PatchComparison {
  previous: string;
  current: string;
}

export function patchReleases(versions: string[]): Map<string, string> {
  const releases = new Map<string, string>();
  for (const version of versions) {
    if (!/^\d+\.\d+\.\d+$/.test(version)) continue;
    const { patchVersion } = resolveStaticDataRelease(version);
    if (!releases.has(patchVersion)) releases.set(patchVersion, version);
  }
  return releases;
}

export function planPatchComparisons(releases: Map<string, string>, year: string): PatchComparison[] {
  if (!/^\d{2}$/.test(year)) throw new Error("Use an official patch year, e.g. 26");
  const patches = [...releases.keys()].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  return patches.flatMap((current, index) => current.startsWith(`${year}.`) && index > 0
    ? [{ previous: patches[index - 1], current }] : []);
}

export function planCurrentComparison(releases: Map<string, string>, current: string): PatchComparison {
  const patches = [...releases.keys()].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  const index = patches.indexOf(current);
  if (index < 1) throw new Error(`Previous patch unavailable: ${current}`);
  return { previous: patches[index - 1], current };
}

export function planCurrentComparisons(releases: Map<string, string>, current: string, archived: string[]): PatchComparison[] {
  const currentPair = planCurrentComparison(releases, current);
  if (!archived.length) return [currentPair];
  const patches = [...releases.keys()].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  const currentIndex = patches.indexOf(current);
  const archivedSet = new Set(archived);
  const firstIndex = patches.findIndex(patch => archivedSet.has(patch));
  if (firstIndex < 0) return [currentPair];
  return patches.flatMap((patch, index) => index > 0 && index >= firstIndex && index <= currentIndex &&
    (!archivedSet.has(patch) || patch === current) ? [{ previous: patches[index - 1], current: patch }] : []);
}
