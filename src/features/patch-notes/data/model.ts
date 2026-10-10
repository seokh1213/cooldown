import type { PatchChange, PatchImpact, PatchNoteEntry, PatchNotesReport } from "@/domain/game/contracts/patchNotes";
import type { Language } from "@/shared/i18n";

export type ImpactFilter = "all" | PatchImpact;
export type KindFilter = "all" | "champion" | "item" | "system";

export function filterPatchEntries(entries: PatchNoteEntry[], filters: { query: string; impact: ImpactFilter; kind: KindFilter }): PatchNoteEntry[] {
  const query = filters.query.trim().toLocaleLowerCase();
  return entries.flatMap(entry => {
    if (filters.kind !== "all" && entry.kind !== filters.kind) return [];
    if (query && ![entry.id, ...Object.values(entry.name)].some(name => name.toLocaleLowerCase().includes(query))) return [];
    const changes = filters.impact === "all" ? entry.changes : entry.changes.filter(change => change.impact === filters.impact);
    return changes.length ? [{ ...entry, changes }] : [];
  });
}

export function formatPatchValues(change: PatchChange, side: "before" | "after", seconds: string, language: Language = "ko_KR"): string {
  if (change.valueType === "text") return change[side][language];
  const values = change[side];
  const format = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 5, useGrouping: false }).format(value);
  const range = change.format === "range" && values.length > 1;
  const body = range ? `${format(values[0])}–${format(values[values.length - 1])}` : values.map(format).join(" / ");
  return `${body}${change.unit === "percent" ? "%" : change.unit === "seconds" ? seconds : ""}`;
}

export function groupPatchChanges(changes: PatchChange[], language: Language) {
  const groups = new Map<string, { section: string; title: string; changes: PatchChange[] }>();
  for (const change of changes) {
    const title = change.sectionName?.[language] ?? "";
    const key = `${change.section}:${title}`;
    const group = groups.get(key) ?? { section: change.section, title, changes: [] };
    group.changes.push(change);
    groups.set(key, group);
  }
  const order = ["stats", "P", "Q", "W", "E", "R"];
  return [...groups.values()].sort((a, b) => order.indexOf(a.section) - order.indexOf(b.section));
}

export function patchReportCounts(report: PatchNotesReport) {
  return {
    champions: report.entries.filter(entry => entry.kind === "champion").length,
    items: report.entries.filter(entry => entry.kind === "item").length,
    systems: report.entries.filter(entry => entry.kind === "system").length,
    changes: report.entries.reduce((count, entry) => count + entry.changes.length, 0),
  };
}
