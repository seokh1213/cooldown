import type {
  PatchChange, PatchImpact, PatchMetric, PatchNoteEntry, PatchNotesReport, PatchSnapshot,
} from "../../src/data/contracts/patchNotes";

export function sameNumbers(before: readonly number[], after: readonly number[]): boolean {
  return before.length === after.length && before.every((value, index) =>
    Math.abs(value - after[index]) <= 1e-6 * Math.max(1, Math.abs(value), Math.abs(after[index])));
}

function metricImpact(before: PatchMetric, after: PatchMetric): PatchImpact {
  if (after.favorable === "unknown" || before.values.length !== after.values.length) return "adjustment";
  const changes = after.values.map((value, index) => value - before.values[index]).filter(value => Math.abs(value) > 1e-6);
  const rises = changes.every(value => value > 0);
  const falls = changes.every(value => value < 0);
  if (!rises && !falls) return "adjustment";
  return rises === (after.favorable === "higher") ? "buff" : "nerf";
}

export function combinedImpact(impacts: PatchImpact[]): PatchImpact {
  return impacts.every(impact => impact === impacts[0]) ? impacts[0] : "adjustment";
}

function compareMetrics(before: PatchMetric[], after: PatchMetric[]): PatchChange[] {
  const oldMetrics = new Map(before.map(metric => [metric.id, metric]));
  return after.flatMap(metric => {
    const old = oldMetrics.get(metric.id);
    if (!old || sameNumbers(old.values, metric.values)) return [];
    const { values: _values, favorable: _favorable, ...metadata } = metric;
    return [{ ...metadata, before: old.values, after: metric.values, impact: metricImpact(old, metric) }];
  });
}

export function comparePatchSnapshots(before: PatchSnapshot, after: PatchSnapshot): PatchNotesReport {
  if (before.patchVersion === after.patchVersion) throw new Error("Compare different patches");
  const oldEntities = new Map(before.entities.map(entity => [`${entity.kind}:${entity.id}`, entity]));
  const entries: PatchNoteEntry[] = after.entities.flatMap(entity => {
    const old = oldEntities.get(`${entity.kind}:${entity.id}`);
    if (!old) return [];
    const changes = compareMetrics(old.metrics, entity.metrics);
    if (!changes.length) return [];
    return [{ id: entity.id, kind: entity.kind, name: entity.name, changes,
      impact: combinedImpact(changes.map(change => change.impact)) }];
  });
  const comparable = after.entities.filter(entity => oldEntities.has(`${entity.kind}:${entity.id}`));
  return {
    schemaVersion: 1, patchVersion: after.patchVersion, previousPatchVersion: before.patchVersion,
    sources: after.sources, previousSources: before.sources,
    comparedChampions: comparable.filter(entity => entity.kind === "champion").length,
    comparedItems: comparable.filter(entity => entity.kind === "item").length,
    entries, reviewCount: 0,
  };
}
