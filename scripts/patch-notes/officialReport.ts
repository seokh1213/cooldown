import { DATA_LOCALES, type DataLocale } from "../../src/data/contracts/staticData";
import type { PatchImpact, PatchMetric, PatchNoteEntry, PatchNotesReport, PatchSnapshot, PatchSnapshotEntity, TextPatchChange } from "../../src/data/contracts/patchNotes";
import { combinedImpact } from "./diff";
import { officialText, validateOfficialArchive, type OfficialPatchArchive } from "./official";
import type { OfficialEntity, OfficialRow, OfficialSection } from "./officialParser";
import { text } from "./metricLabels";
import { localizedOfficialArticle, officialNumbers } from "./officialLocalization";

const normalized = (value: string) => value.toLowerCase().replaceAll("&", "and").replace(/[^a-z0-9]/g, "");
const abilityHeading = /^(?:(?:Human|Spider|Mega|Mini|Mounted|Dismounted)\s+)?([PQWER](?:[QWER]|[1-9])?)\s*(?:\([^)]*\)\s*)?[-–]\s*/;
const numbers = officialNumbers;
type SkillNames = Record<DataLocale, Record<string, { passive: { name: string }; spells: Array<{ name: string }> }>>;
type OfficialSnapshot = PatchSnapshot & { previousItems?: PatchSnapshotEntity[] };

export function officialIdentitySnapshot(after: PatchSnapshot, before: PatchSnapshot): OfficialSnapshot {
  return { ...after, previousItems: before.entities.filter(entity => entity.kind === "item") };
}

export function officialImpact(row: OfficialRow): PatchImpact {
  const before = numbers(row.before), after = numbers(row.after);
  if (!before.length || !after.length || /Unchanged|unchanged/.test(row.after)) return "adjustment";
  const left = before.length === 1 ? after.map(() => before[0]) : before;
  const right = after.length === 1 ? left.map(() => after[0]) : after;
  if (left.length !== right.length) return "adjustment";
  const deltas = right.map((value, index) => value - left[index]).filter(value => Math.abs(value) > 1e-6);
  if (!deltas.length || (!deltas.every(value => value > 0) && !deltas.every(value => value < 0))) return "adjustment";
  const lower = /cooldown|cost|recipe|cast time|time between casts|lockout|penalty/i.test(row.label);
  return (deltas[0] > 0) !== lower ? "buff" : "nerf";
}

function matchingEntities(entity: OfficialEntity, snapshot: OfficialSnapshot, ids?: string[]): PatchSnapshotEntity[] {
  if (entity.kind === "system") return [];
  if (ids) {
    const mapped = ids.map(id => snapshot.entities.find(candidate => candidate.kind === entity.kind && candidate.id === id) ??
      (entity.kind === "item" ? snapshot.previousItems?.find(candidate => candidate.id === id) : undefined));
    if (!ids.length || mapped.some(candidate => !candidate)) throw new Error(`Official entity mapping missing: ${entity.title}`);
    return mapped as PatchSnapshotEntity[];
  }
  const sourceTitle = entity.title.replace(/^\[(?:NEW|RETURNING|UPDATED|REWORKED)\]\s*/i, "");
  const title = normalized(sourceTitle);
  const canonical = snapshot.entities.find(candidate => candidate.kind === entity.kind && normalized(candidate.id) === title);
  if (canonical) return [canonical];
  const matches = snapshot.entities.filter(candidate => candidate.kind === entity.kind &&
    normalized(candidate.name.en_US) === title);
  if (entity.kind === "champion" && matches.length > 1) throw new Error(`Official champion ambiguous: ${entity.title}`);
  if (matches.length) {
    return entity.kind === "item" ? matches.filter(candidate => !matches.some(other =>
      other !== candidate && candidate.id.endsWith(other.id))) : matches;
  }
  if (entity.kind === "item") {
    const combined = snapshot.entities.filter(candidate => candidate.kind === "item" &&
      sourceTitle.split(/\s+and\s+|\s*\/\s*/).some(part => normalized(part) === normalized(candidate.name.en_US)));
    if (combined.length) return combined.filter(candidate => !combined.some(other => other !== candidate && candidate.id.endsWith(other.id)));
    if (snapshot.previousItems) return matchingEntities(entity, { ...snapshot, entities: snapshot.previousItems, previousItems: undefined }, ids);
    return [];
  }
  throw new Error(`Official champion not in snapshot: ${entity.title}`);
}

function abilityPrefix(title: string): string | undefined {
  return abilityHeading.exec(title)?.[1] ?? (/^Passive\b/.test(title) ? "P" : undefined);
}

function sectionMetadata(section: OfficialSection, entity: PatchSnapshotEntity | undefined, report: PatchNotesReport, options: {
  catalogs?: SkillNames; titles: TextPatchChange["label"]; slotSectionCount: number; systemSections?: boolean;
}): {
  section: string; sectionName?: TextPatchChange["sectionName"]; metrics: PatchMetric[];
} {
  if (!entity || entity.kind !== "champion") return { section: "stats", metrics: entity?.metrics ?? [],
    ...(options.systemSections && section.title ? { sectionName: options.titles } : {}) };
  const prefix = abilityPrefix(section.title);
  const slot = prefix?.[0];
  const abilityName = section.title.replace(abilityHeading, "").replace(/^Passive\s*[-–]\s*/, "");
  const matches = (change: Pick<PatchMetric, "section" | "sectionName">) =>
    slot ? change.section === slot && (normalized(change.sectionName?.en_US ?? "").includes(normalized(abilityName)) ||
      slot === "P" || (prefix?.length === 1 && options.slotSectionCount === 1))
      : change.sectionName?.en_US.includes(section.title);
  const existing = report.entries.find(entry => entry.id === entity.id)?.changes.find(matches);
  const metric = existing ?? entity.metrics.find(matches);
  if (metric) return { section: metric.section, sectionName: metric.sectionName,
    metrics: entity.metrics.filter(candidate => candidate.section === metric.section && candidate.sectionName?.en_US === metric.sectionName?.en_US) };
  if (!section.title || /^(?:Base Stat(?:s|es)|Stats|General|Bug ?fix(?:es)?)$/i.test(section.title)) {
    return { section: "stats", metrics: entity.metrics.filter(candidate => candidate.section === "stats") };
  }
  const catalogs = options.catalogs;
  if (slot && catalogs) return { section: slot, metrics: [], sectionName: officialText(locale => {
    const champion = catalogs[locale][entity.id];
    const name = slot === "P" ? champion?.passive.name : champion?.spells[["Q", "W", "E", "R"].indexOf(slot)]?.name;
    if (!name) throw new Error(`Official skill name missing: ${entity.id}.${slot}.${locale}`);
    const english = catalogs.en_US[entity.id];
    const canonicalName = slot === "P" ? english.passive.name : english.spells[["Q", "W", "E", "R"].indexOf(slot)].name;
    return normalized(canonicalName) === normalized(abilityName) ? name
      : options.titles[locale].replace(abilityHeading, "").replace(/^(?:Passive|기본 지속 효과)\s*[-–]\s*/, "");
  }) };
  if (!slot) return { section: "stats", sectionName: options.titles, metrics: [] };
  throw new Error(`Official ability slot unresolved: ${entity.id} ${section.title}`);
}

function rowForItem(row: OfficialRow, index: number, count: number): OfficialRow {
  if (count === 1) return row;
  const values = (side: string) => side.match(/\d+(?:\.\d+)?%?/g);
  const before = values(row.before), after = values(row.after);
  if (!before || !after || before.length < count || before.length !== after.length) throw new Error(`Combined item values cannot be aligned: ${row.label}: ${row.before} → ${row.after}`);
  return { ...row, before: before[index], after: after[index] };
}

function buildChanges(options: {
  archive: OfficialPatchArchive; entityIndex: number; snapshotEntity?: PatchSnapshotEntity; report: PatchNotesReport; itemIndex: number; itemCount: number; catalogs?: SkillNames;
}): TextPatchChange[] {
  const { archive, entityIndex, snapshotEntity, report, itemIndex, itemCount } = options;
  const english = archive.articles.en_US.entities[entityIndex];
  return english.sections.flatMap((section, sectionIndex) => {
    const metadata = sectionMetadata(section, snapshotEntity, report, { catalogs: options.catalogs,
      titles: officialText(locale => archive.articles[locale].entities[entityIndex].sections[sectionIndex].title),
      slotSectionCount: english.sections.filter(candidate => abilityPrefix(candidate.title)?.[0] === abilityPrefix(section.title)?.[0]).length,
      systemSections: english.grouped });
    return section.rows.map((original, rowIndex): TextPatchChange => {
      const row = rowForItem(original, itemIndex, itemCount);
      const localized = (locale: DataLocale) => rowForItem(archive.articles[locale].entities[entityIndex].sections[sectionIndex].rows[rowIndex], itemIndex, itemCount);
      const metric = metadata.section === "stats"
        ? metadata.metrics.find(candidate => normalized(candidate.label.en_US) === normalized(row.label))
        : metadata.metrics.find(candidate => candidate.values.length === numbers(row.after).length &&
          candidate.values.every((value, index) => Math.abs(value - numbers(row.after)[index]) < 1e-5)) ?? metadata.metrics[0];
      return { id: `official/${entityIndex}/${sectionIndex}/${rowIndex}`, valueType: "text",
        sourceKey: `official/${entityIndex}/${sectionIndex}/${rowIndex}`, gameDataKey: metric?.sourceKey,
        label: officialText(locale => localized(locale).label || text("변경 사항", "Change", "改动")[locale]),
        section: metadata.section, sectionName: metadata.sectionName,
        before: officialText(locale => localized(locale).before), after: officialText(locale => localized(locale).after),
        impact: officialImpact(row) };
    });
  });
}

export function applyOfficialPatch(report: PatchNotesReport, snapshot: PatchSnapshot, archive: OfficialPatchArchive, catalogs?: SkillNames): PatchNotesReport {
  validateOfficialArchive(archive, report.patchVersion);
  const localized = { ...archive, articles: Object.fromEntries(DATA_LOCALES.map(locale =>
    [locale, localizedOfficialArticle(archive, locale)])) as OfficialPatchArchive["articles"] };
  const entries: PatchNoteEntry[] = localized.articles.en_US.entities.flatMap((source, entityIndex) => {
    const mapping = archive.entityMappings?.find(candidate => candidate.entityIndex === entityIndex);
    const entity = mapping?.kind ? { ...source, kind: mapping.kind } : source;
    if (mapping && !mapping.reason) throw new Error(`Official entity mapping has no reason: ${entity.title}`);
    const matches = matchingEntities(entity, snapshot, mapping?.ids);
    if (entity.kind !== "system" && !matches.length) throw new Error(`Official item not in snapshot: ${entity.title}`);
    return (matches.length ? matches : [undefined]).map((snapshotEntity, itemIndex) => {
      const sharedValues = mapping?.sharedValues ?? entity.title.includes(" / ");
      const changes = buildChanges({ archive: localized, entityIndex, snapshotEntity, report, itemIndex,
        itemCount: sharedValues ? 1 : matches.length || 1, catalogs });
      return { id: snapshotEntity?.id ?? `system-${normalized(entity.title)}`, kind: entity.kind,
        name: snapshotEntity?.name ?? officialText(locale => localized.articles[locale].entities[entityIndex].title),
        changes, impact: combinedImpact(changes.map(change => change.impact)) };
    });
  });
  return { ...report, entries, officialSource: {
    urls: officialText(locale => archive.articles[locale].url), hashes: officialText(locale => archive.articles[locale].sha256),
    rowCount: localized.articles.en_US.rowCount,
    ...(archive.localizationCorrections?.length || archive.entityCorrections?.length ? { note: text(
      "공식 원문·번역의 누락·오타는 다른 언어 원문과 게임 자료를 대조해 보완했습니다.",
      "Official note omissions and typos were corrected against other official languages and game data.",
      "部分官方公告與翻譯的遺漏及錯字，已依其他語言官方公告與遊戲資料補正。") } : {}),
  } };
}
