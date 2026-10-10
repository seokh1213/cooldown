import type { DataLocale, StaticDataSources } from "./staticData";

export type PatchText = Record<DataLocale, string>;
export type PatchImpact = "buff" | "nerf" | "adjustment";
export type PatchEntityKind = "champion" | "item" | "system";

export interface PatchMetric {
  id: string;
  label: PatchText;
  section: string;
  sectionName?: PatchText;
  values: number[];
  unit: "number" | "percent" | "seconds";
  format?: "range";
  favorable: "higher" | "lower" | "unknown";
  sourceKey: string;
}

export interface PatchSnapshotEntity {
  id: string;
  kind: PatchEntityKind;
  name: PatchText;
  metrics: PatchMetric[];
}

export interface PatchSnapshot {
  schemaVersion: 1;
  patchVersion: string;
  sources: StaticDataSources;
  entities: PatchSnapshotEntity[];
}

export interface NumericPatchChange extends Omit<PatchMetric, "values" | "favorable"> {
  valueType?: "numeric";
  before: number[];
  after: number[];
  impact: PatchImpact;
}

export interface TextPatchChange extends Omit<NumericPatchChange, "valueType" | "before" | "after" | "unit" | "format"> {
  valueType: "text";
  gameDataKey?: string;
  before: PatchText;
  after: PatchText;
}

export type PatchChange = NumericPatchChange | TextPatchChange;

export function patchGameDataKey(change: PatchChange): string {
  return change.valueType === "text" ? change.gameDataKey ?? change.sourceKey : change.sourceKey;
}

export interface PatchNoteEntry extends Omit<PatchSnapshotEntity, "metrics"> {
  impact: PatchImpact;
  changes: PatchChange[];
  icon?: string;
}

export interface PatchNotesReport {
  schemaVersion: 1;
  patchVersion: string;
  previousPatchVersion: string;
  sources: StaticDataSources;
  previousSources: StaticDataSources;
  comparedChampions: number;
  comparedItems: number;
  entries: PatchNoteEntry[];
  reviewCount: number;
  officialSource?: { urls: PatchText; hashes: PatchText; rowCount: number; note?: PatchText };
}

export interface PatchNotesIndex {
  schemaVersion: 1;
  latest: string;
  patches: Array<{ patchVersion: string; previousPatchVersion: string | null }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function decodePatchNotesIndex(value: unknown): PatchNotesIndex {
  if (!isRecord(value) || value.schemaVersion !== 1 ||
    typeof value.latest !== "string" || !Array.isArray(value.patches)) {
    throw new Error("Invalid patch notes index");
  }
  for (const patch of value.patches) {
    if (!isRecord(patch) || typeof patch.patchVersion !== "string" ||
      !/^\d+\.\d+$/.test(patch.patchVersion) ||
      !(patch.previousPatchVersion === null ||
        (typeof patch.previousPatchVersion === "string" && /^\d+\.\d+$/.test(patch.previousPatchVersion)))) {
      throw new Error("Invalid patch notes version");
    }
  }
  if (!value.patches.some(patch => patch.patchVersion === value.latest)) {
    throw new Error("Missing latest patch notes");
  }
  return value as unknown as PatchNotesIndex;
}

export function decodePatchNotesReport(value: unknown, patchVersion: string): PatchNotesReport {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.patchVersion !== patchVersion ||
    typeof value.previousPatchVersion !== "string" || !isRecord(value.sources) ||
    typeof value.sources.ddragon !== "string" || typeof value.sources.cdragon !== "string" ||
    !Array.isArray(value.entries) || typeof value.reviewCount !== "number") {
    throw new Error("Invalid patch notes report");
  }
  for (const entry of value.entries) {
    if (!isRecord(entry) || typeof entry.id !== "string" || !isRecord(entry.name) ||
      !["champion", "item", "system"].includes(String(entry.kind)) || !Array.isArray(entry.changes)) {
      throw new Error("Invalid patch notes entry");
    }
    if (entry.icon !== undefined && (entry.kind !== "item" || typeof entry.icon !== "string" ||
      !/^patch-notes\/item-icons\/\d+\.\d+\/\d+\.webp$/.test(entry.icon))) throw new Error("Invalid historical item icon");
    for (const change of entry.changes) {
      if (!isRecord(change) || !isRecord(change.label) || typeof change.section !== "string" ||
        !["buff", "nerf", "adjustment"].includes(String(change.impact)) ||
        !(change.valueType === "text"
          ? [change.before, change.after].every(isPatchText)
          : [change.before, change.after].every(values =>
            Array.isArray(values) && values.length > 0 && values.every(n => typeof n === "number" && Number.isFinite(n))))) {
        throw new Error("Invalid patch note values");
      }
    }
  }
  if (value.officialSource !== undefined && (!isRecord(value.officialSource) ||
    !isPatchText(value.officialSource.urls) || !isPatchText(value.officialSource.hashes) ||
    (value.officialSource.note !== undefined && !isPatchText(value.officialSource.note)) ||
    !Number.isInteger(value.officialSource.rowCount) || Number(value.officialSource.rowCount) < 1)) {
    throw new Error("Invalid official patch source");
  }
  return value as unknown as PatchNotesReport;
}

function isPatchText(value: unknown): value is PatchText {
  return isRecord(value) && ["ko_KR", "en_US", "zh_CN"].every(locale => typeof value[locale] === "string");
}
