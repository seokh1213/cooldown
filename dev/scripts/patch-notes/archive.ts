import type { PatchNotesIndex } from "../../../src/domain/game/contracts/patchNotes";

export function extendPatchNotesIndex(index: PatchNotesIndex | undefined, current: string, previous: string): PatchNotesIndex {
  const patches = new Map(index?.patches.filter(patch => patch.previousPatchVersion !== null).map(patch => [patch.patchVersion, patch]) ?? []);
  patches.set(current, { patchVersion: current, previousPatchVersion: previous });
  const sorted = [...patches.values()].sort((a, b) => b.patchVersion.localeCompare(a.patchVersion, "en", { numeric: true }));
  return { schemaVersion: 1, latest: sorted[0].patchVersion, patches: sorted };
}
