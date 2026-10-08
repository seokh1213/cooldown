import type { DataLocale } from "../../src/data/contracts/staticData";
import type { OfficialPatchArchive } from "./official";
import type { OfficialRow } from "./officialParser";

export interface OfficialLocalizationCorrection {
  locale: Exclude<DataLocale, "en_US">;
  entityIndex: number;
  sectionIndex: number;
  rowIndex: number;
  original: OfficialRow | null;
  replacement: OfficialRow;
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
  return JSON.stringify(officialNumbers(value).sort((a, b) => a - b));
}

export function localizedOfficialArticle(archive: OfficialPatchArchive, locale: DataLocale): OfficialPatchArchive["articles"][DataLocale] {
  const corrections = (archive.localizationCorrections ?? []).filter(correction => correction.locale === locale);
  if (!corrections.length) return archive.articles[locale];
  const article = structuredClone(archive.articles[locale]);
  for (const correction of corrections) {
    const { entityIndex, sectionIndex, rowIndex, original, replacement } = correction;
    const rows = article.entities[entityIndex]?.sections[sectionIndex]?.rows;
    if (!correction.reason || !rows || rowIndex < 0 || rowIndex > rows.length ||
      JSON.stringify(rows[rowIndex] ?? null) !== JSON.stringify(original) ||
      !archive.articles.en_US.entities[entityIndex]?.sections[sectionIndex]?.rows[rowIndex]) {
      throw new Error(`Official localization correction does not match source: ${archive.patchVersion}.${locale}`);
    }
    if (original === null) { rows.splice(rowIndex, 0, replacement); article.rowCount++; }
    else rows[rowIndex] = replacement;
  }
  return article;
}
