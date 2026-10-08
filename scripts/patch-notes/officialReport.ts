import type { DataLocale } from "../../src/data/contracts/staticData";
import type { PatchImpact, PatchMetric, PatchNoteEntry, PatchNotesReport, PatchSnapshot, PatchSnapshotEntity, TextPatchChange } from "../../src/data/contracts/patchNotes";
import { combinedImpact } from "./diff";
import { officialText, validateOfficialArchive, type OfficialPatchArchive } from "./official";
import type { OfficialEntity, OfficialRow, OfficialSection } from "./officialParser";
import { text } from "./metricLabels";

const normalized = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const numbers = (value: string) => [...value.matchAll(/\d*\.?\d+/g)].map(match => Number(match[0]));
type SkillNames = Record<DataLocale, Record<string, { passive: { name: string }; spells: Array<{ name: string }> }>>;

export function officialImpact(row: OfficialRow): PatchImpact {
  const before = numbers(row.before), after = numbers(row.after);
  if (!before.length || !after.length || /Unchanged|unchanged/.test(row.after)) return "adjustment";
  const left = before.length === 1 ? after.map(() => before[0]) : before;
  const right = after.length === 1 ? left.map(() => after[0]) : after;
  if (left.length !== right.length) return "adjustment";
  const deltas = right.map((value, index) => value - left[index]).filter(value => Math.abs(value) > 1e-6);
  if (!deltas.length || (!deltas.every(value => value > 0) && !deltas.every(value => value < 0))) return "adjustment";
  const lower = /cooldown|mana cost|resource cost/i.test(row.label);
  return (deltas[0] > 0) !== lower ? "buff" : "nerf";
}

function matchingEntities(entity: OfficialEntity, snapshot: PatchSnapshot): PatchSnapshotEntity[] {
  if (entity.kind === "system") return [];
  const title = normalized(entity.title);
  const matches = snapshot.entities.filter(candidate => candidate.kind === entity.kind &&
    (normalized(candidate.name.en_US) === title || normalized(candidate.id) === title));
  if (matches.length) return matches;
  if (entity.kind === "item") {
    return snapshot.entities.filter(candidate => candidate.kind === "item" &&
      entity.title.split(/\s+and\s+/).some(part => normalized(part) === normalized(candidate.name.en_US)));
  }
  throw new Error(`Official champion not in snapshot: ${entity.title}`);
}

function sectionMetadata(section: OfficialSection, entity: PatchSnapshotEntity | undefined, report: PatchNotesReport, catalogs?: SkillNames): {
  section: string; sectionName?: TextPatchChange["sectionName"]; metrics: PatchMetric[];
} {
  if (!entity || entity.kind !== "champion") return { section: "stats", metrics: entity?.metrics ?? [] };
  const slot = /^([QWER])\s*[-–]/.exec(section.title)?.[1] ?? (/^Passive\b/.test(section.title) ? "P" : undefined);
  const existing = report.entries.find(entry => entry.id === entity.id)?.changes.find(change =>
    slot ? change.section === slot : change.sectionName?.en_US.includes(section.title));
  const metric = existing ?? entity.metrics.find(candidate => candidate.section === slot);
  if (metric) return { section: metric.section, sectionName: metric.sectionName,
    metrics: entity.metrics.filter(candidate => candidate.section === metric.section && candidate.sectionName?.en_US === metric.sectionName?.en_US) };
  if (/Base Stats/i.test(section.title)) return { section: "stats", metrics: entity.metrics.filter(candidate => candidate.section === "stats") };
  if (slot && catalogs) return { section: slot, metrics: [], sectionName: officialText(locale => {
    const champion = catalogs[locale][entity.id];
    const name = slot === "P" ? champion?.passive.name : champion?.spells[["Q", "W", "E", "R"].indexOf(slot)]?.name;
    if (!name) throw new Error(`Official skill name missing: ${entity.id}.${slot}.${locale}`);
    return name;
  }) };
  throw new Error(`Official ability slot unresolved: ${entity.id} ${section.title}`);
}

function rowForItem(row: OfficialRow, index: number, count: number): OfficialRow {
  if (count === 1) return row;
  const values = (side: string) => side.match(/\d+(?:\.\d+)?%?/g);
  const before = values(row.before), after = values(row.after);
  if (!before || !after || before.length < count || before.length !== after.length) throw new Error("Combined item values cannot be aligned");
  return { ...row, before: before[index], after: after[index] };
}

function buildChanges(options: {
  archive: OfficialPatchArchive; entityIndex: number; snapshotEntity?: PatchSnapshotEntity; report: PatchNotesReport; itemIndex: number; itemCount: number; catalogs?: SkillNames;
}): TextPatchChange[] {
  const { archive, entityIndex, snapshotEntity, report, itemIndex, itemCount } = options;
  const english = archive.articles.en_US.entities[entityIndex];
  return english.sections.flatMap((section, sectionIndex) => {
    const metadata = sectionMetadata(section, snapshotEntity, report, options.catalogs);
    return section.rows.map((original, rowIndex): TextPatchChange => {
      const row = rowForItem(original, itemIndex, itemCount);
      const localized = (locale: DataLocale) => rowForItem(archive.articles[locale].entities[entityIndex].sections[sectionIndex].rows[rowIndex], itemIndex, itemCount);
      const metric = metadata.metrics.find(candidate => candidate.values.length === numbers(row.after).length &&
        candidate.values.every((value, index) => Math.abs(value - numbers(row.after)[index]) < 1e-5)) ?? metadata.metrics[0];
      return { id: `official/${entityIndex}/${sectionIndex}/${rowIndex}`, valueType: "text",
        sourceKey: `official/${entityIndex}/${sectionIndex}/${rowIndex}`, gameDataKey: metric?.sourceKey,
        label: original.label ? officialText(locale => localized(locale).label) : text("변경 사항", "Change", "改动"),
        section: metadata.section, sectionName: metadata.sectionName,
        before: officialText(locale => localized(locale).before), after: officialText(locale => localized(locale).after),
        impact: officialImpact(row) };
    });
  });
}

export function applyOfficialPatch(report: PatchNotesReport, snapshot: PatchSnapshot, archive: OfficialPatchArchive, catalogs?: SkillNames): PatchNotesReport {
  validateOfficialArchive(archive, report.patchVersion);
  const entries: PatchNoteEntry[] = archive.articles.en_US.entities.flatMap((entity, entityIndex) => {
    const matches = matchingEntities(entity, snapshot);
    if (entity.kind !== "system" && !matches.length) throw new Error(`Official item not in snapshot: ${entity.title}`);
    return (matches.length ? matches : [undefined]).map((snapshotEntity, itemIndex) => {
      const changes = buildChanges({ archive, entityIndex, snapshotEntity, report, itemIndex, itemCount: matches.length || 1, catalogs });
      return { id: snapshotEntity?.id ?? `system-${normalized(entity.title)}`, kind: entity.kind,
        name: snapshotEntity?.name ?? officialText(locale => archive.articles[locale].entities[entityIndex].title),
        changes, impact: combinedImpact(changes.map(change => change.impact)) };
    });
  });
  return { ...report, entries, officialSource: {
    urls: officialText(locale => archive.articles[locale].url), hashes: officialText(locale => archive.articles[locale].sha256),
    rowCount: archive.articles.en_US.rowCount,
  } };
}
