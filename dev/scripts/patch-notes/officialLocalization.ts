import type { DataLocale } from "../../../src/domain/game/contracts/staticData";
import type { OfficialPatchArchive } from "./official";
import type { OfficialEntity, OfficialRow } from "./officialParser";

export interface OfficialLocalizationCorrection {
  locale: DataLocale;
  entityIndex: number;
  sectionIndex: number;
  rowIndex: number;
  original: OfficialRow | null;
  replacement: OfficialRow;
  reason: string;
}

export interface OfficialEntityCorrection {
  locale: DataLocale;
  entityIndex: number;
  original: OfficialEntity | null;
  replacement: OfficialEntity | null;
  reason: string;
}

export interface OfficialValueEquivalence {
  locale: Exclude<DataLocale, "en_US">;
  entityIndex: number;
  sectionIndex: number;
  rowIndex: number;
  original: OfficialRow;
  reference: OfficialRow;
  reason: string;
}

export function officialNumbers(value: string): number[] {
  const normalized = value.replace(/(?<!\d)\d{1,3}(?:,\d{3})+(?:\.\d+)?(?!\d)/g, number => number.replaceAll(",", ""))
    .replace(/\bevery other\b/gi, "every 2")
    .replace(/\b(?:double|twice)\b/gi, "2")
    .replace(/每隔一次|兩倍|雙倍|兩次/g, "2")
    .replace(/\bhalved\b|減半/gi, "50%");
  return [...normalized.matchAll(/\d*\.?\d+/g)].map(match => Number(match[0]));
}

export function officialNumberFingerprint(value: string): string {
  let normalized = value
    .replace(/(?<!\d)\d{1,3}(?:,\d{3})+(?:\.\d+)?(?!\d)/g, number => number.replaceAll(",", ""))
    .replace(/(?:\b(?:levels?|lvl)|等級|等级)\s*1\s*[-–~至到]\s*18\b/gi, "based on level")
    .replace(/\b1\s*[-–~至到]\s*18\s*(?:레벨|級|级|levels?)(?![\p{L}\p{N}])/giu, "based on level")
    .replace(/\b[PQWER][1-9]\b/g, "ability")
    .replace(/\bdouble dipping\b/gi, "duplicate application")
    .replace(/(?<!\d)(\d+),(\d{1,2})(?!\d)/g, "$1.$2")
    .replace(/\bhalved\b|減半/g, "50%");
  const clock = normalized.match(/^(\d+):(\d{2})$/);
  const minutes = normalized.match(/^(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|분|分鐘)(?:\s*(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|초|秒))?$/i);
  if (clock) normalized = String(Number(clock[1]) * 60 + Number(clock[2]));
  if (minutes) normalized = String(Number(minutes[1]) * 60 + Number(minutes[2] ?? 0));
  const ranks = [...normalized.matchAll(/\d*\.?\d+(?:\s*%?\s*\/\s*\d*\.?\d+){2,}/g)]
    .map(match => officialNumbers(match[0])).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return JSON.stringify({ numbers: officialNumbers(normalized).sort((a, b) => a - b), ranks });
}

export function localizedOfficialArticle(archive: OfficialPatchArchive, locale: DataLocale): OfficialPatchArchive["articles"][DataLocale] {
  const corrections = (archive.localizationCorrections ?? []).filter(correction => correction.locale === locale);
  const entities = (archive.entityCorrections ?? []).filter(correction => correction.locale === locale);
  if (!corrections.length && !entities.length) return archive.articles[locale];
  const article = structuredClone(archive.articles[locale]);
  for (const correction of entities) {
    if (!correction.reason || correction.entityIndex < 0 || correction.entityIndex > article.entities.length ||
      JSON.stringify(article.entities[correction.entityIndex] ?? null) !== JSON.stringify(correction.original)) {
      throw new Error(`Official entity correction does not match source: ${archive.patchVersion}.${locale}`);
    }
    article.entities.splice(correction.entityIndex, correction.original === null ? 0 : 1,
      ...(correction.replacement ? [correction.replacement] : []));
  }
  for (const correction of corrections) {
    const { entityIndex, sectionIndex, rowIndex, original, replacement } = correction;
    const rows = article.entities[entityIndex]?.sections[sectionIndex]?.rows;
    if (!correction.reason || !rows || rowIndex < 0 || rowIndex > rows.length ||
      JSON.stringify(rows[rowIndex] ?? null) !== JSON.stringify(original)) {
      throw new Error(`Official localization correction does not match source: ${archive.patchVersion}.${locale}`);
    }
    if (original === null) rows.splice(rowIndex, 0, replacement);
    else rows[rowIndex] = replacement;
  }
  article.rowCount = article.entities.reduce((sum, entity) => sum + entity.sections.reduce((n, section) => n + section.rows.length, 0), 0);
  return article;
}
