import path from "node:path";
import { createHash } from "node:crypto";
import type { DataLocale } from "../../src/data/contracts/staticData";
import { DATA_LOCALES } from "../../src/data/contracts/staticData";
import type { PatchText } from "../../src/data/contracts/patchNotes";
import { getText, officialPatches, SITEMAP } from "../llm/game-knowledge/sources";
import { officialArticleHtml, officialChampionIcons, parseOfficialArticle, type OfficialArticle } from "./officialParser";
import { ARCHIVE_DIRECTORY, archiveJson, readJson } from "./storage";
import { localizedOfficialArticle, officialNumberFingerprint, type OfficialLocalizationCorrection,
  type OfficialEntityCorrection, type OfficialValueEquivalence } from "./officialLocalization";
import type { OfficialChampions } from "./officialScope";

export interface OfficialPatchArchive {
  schemaVersion: 1;
  patchVersion: string;
  fetchedAt: string;
  articles: Record<DataLocale, OfficialArticle & { url: string; sha256: string }>;
  localizationCorrections?: OfficialLocalizationCorrection[];
  entityCorrections?: OfficialEntityCorrection[];
  valueEquivalences?: OfficialValueEquivalence[];
  entityMappings?: Array<{ entityIndex: number; ids: string[]; reason: string; sharedValues?: boolean; kind?: "system" }>;
}

const SITE_LOCALES: Record<DataLocale, string> = { ko_KR: "ko-kr", en_US: "en-us", zh_CN: "zh-tw" };
let urls: Promise<Map<string, string>> | undefined;

export function officialText(read: (locale: DataLocale) => string): PatchText {
  return Object.fromEntries(DATA_LOCALES.map(locale => [locale, read(locale)])) as PatchText;
}

function validateLocalizedValues(article: OfficialArticle, reference: OfficialArticle, options: {
  archive: OfficialPatchArchive; locale: DataLocale;
}): void {
  const { archive, locale } = options;
  const where = `${archive.patchVersion}.${locale}`;
  const declared = archive.valueEquivalences?.filter(rule => rule.locale === locale) ?? [];
  let used = 0;
  for (const [entityIndex, entity] of article.entities.entries()) {
    for (const [sectionIndex, section] of entity.sections.entries()) {
      for (const [rowIndex, row] of section.rows.entries()) {
        const original = reference.entities[entityIndex].sections[sectionIndex].rows[rowIndex];
        const equivalence = declared.find(rule => rule.entityIndex === entityIndex && rule.sectionIndex === sectionIndex && rule.rowIndex === rowIndex);
        if (equivalence) {
          if (!equivalence.reason || JSON.stringify(equivalence.original) !== JSON.stringify(row) ||
            JSON.stringify(equivalence.reference) !== JSON.stringify(original)) throw new Error(`Official equivalence does not match source: ${where}`);
          used++;
        }
        if (officialNumberFingerprint(row.before) !== officialNumberFingerprint(original.before) ||
          officialNumberFingerprint(row.after) !== officialNumberFingerprint(original.after)) {
          if (!equivalence) throw new Error(`Official locale values differ: ${where} ${entityIndex}/${sectionIndex}/${rowIndex}`);
        }
      }
    }
  }
  if (used !== declared.length) throw new Error(`Official equivalence position missing or duplicated: ${where}`);
}

export function validateOfficialArchive(value: unknown, patch: string): asserts value is OfficialPatchArchive {
  const archive = value as OfficialPatchArchive | undefined;
  if (!archive || archive.schemaVersion !== 1 || archive.patchVersion !== patch || !archive.articles) {
    throw new Error(`Invalid official patch archive: ${patch}`);
  }
  const reference = localizedOfficialArticle(archive, "en_US");
  if (!reference?.entities.length || !reference.rowCount) throw new Error(`Empty official patch: ${patch}`);
  if ([...(archive.localizationCorrections ?? []), ...(archive.entityCorrections ?? [])]
    .some(correction => !DATA_LOCALES.includes(correction.locale)) ||
    archive.valueEquivalences?.some(rule => rule.locale === ("en_US" as DataLocale) || !DATA_LOCALES.includes(rule.locale))) {
    throw new Error(`Invalid official localization correction: ${patch}`);
  }
  const mappings = archive.entityMappings ?? [];
  if (new Set(mappings.map(mapping => mapping.entityIndex)).size !== mappings.length || mappings.some(mapping =>
    !reference.entities[mapping.entityIndex] || !mapping.reason.trim() ||
    (mapping.kind !== undefined && mapping.kind !== "system") || (mapping.kind === "system" && mapping.ids.length))) {
    throw new Error(`Invalid official entity mapping: ${patch}`);
  }
  for (const locale of DATA_LOCALES) {
    const article = localizedOfficialArticle(archive, locale);
    if (!article || !/^https:\/\/www\.leagueoflegends\.com\//.test(article.url) || !/^[a-f0-9]{64}$/.test(article.sha256)) {
      throw new Error(`Invalid official source: ${patch}.${locale}`);
    }
    const unclassified = article.coverage?.filter(section => section.scope === "unknown" && section.rows > 0);
    if (unclassified?.length) throw new Error(`Official sections unclassified: ${patch}.${locale}: ${unclassified.map(section => section.title).join(", ")}`);
    const shape = (data: OfficialArticle) => data.entities.map(entity => [entity.kind, entity.sections.map(section => section.rows.length)]);
    if (article.rowCount !== article.entities.reduce((sum, entity) => sum + entity.sections.reduce((n, section) => n + section.rows.length, 0), 0) ||
      JSON.stringify(shape(article)) !== JSON.stringify(shape(reference))) {
      throw new Error(`Official locale coverage differs: ${patch}.${locale}`);
    }
    validateLocalizedValues(article, reference, { archive, locale });
  }
}

export async function collectOfficialPatch(patch: string, champions?: OfficialChampions): Promise<OfficialPatchArchive> {
  const file = path.join(ARCHIVE_DIRECTORY, "official", `${patch}.json`);
  const stored = await readJson(file);
  if (stored) { validateOfficialArchive(stored, patch); return stored; }
  urls ??= getText(SITEMAP).then(html => new Map(officialPatches(html).map(source => [source.patch, source.url])));
  const url = (await urls).get(patch);
  if (!url) throw new Error(`Official patch URL not discovered: ${patch}`);
  const raw = Object.fromEntries(await Promise.all(DATA_LOCALES.map(async locale => {
    const localizedUrl = url.replace("/en-us/", `/${SITE_LOCALES[locale]}/`);
    const html = officialArticleHtml(await getText(localizedUrl));
    return [locale, { html, url: localizedUrl }] as const;
  }))) as Record<DataLocale, { html: string; url: string }>;
  const championIcons = officialChampionIcons(raw.en_US.html, champions);
  const pairs = DATA_LOCALES.map(locale => [locale, { ...parseOfficialArticle(raw[locale].html, { champions, championIcons }),
    url: raw[locale].url, sha256: createHash("sha256").update(raw[locale].html).digest("hex") }] as const);
  const archive: OfficialPatchArchive = { schemaVersion: 1, patchVersion: patch, fetchedAt: new Date().toISOString(),
    articles: Object.fromEntries(pairs) as OfficialPatchArchive["articles"] };
  validateOfficialArchive(archive, patch);
  await archiveJson(file, archive);
  return archive;
}
