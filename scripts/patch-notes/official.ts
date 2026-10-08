import path from "node:path";
import { createHash } from "node:crypto";
import type { DataLocale } from "../../src/data/contracts/staticData";
import { DATA_LOCALES } from "../../src/data/contracts/staticData";
import type { PatchText } from "../../src/data/contracts/patchNotes";
import { getText, officialPatches, SITEMAP } from "../llm/game-knowledge/sources";
import { officialArticleHtml, parseOfficialArticle, type OfficialArticle } from "./officialParser";
import { ARCHIVE_DIRECTORY, archiveJson, readJson } from "./storage";

export interface OfficialPatchArchive {
  schemaVersion: 1;
  patchVersion: string;
  fetchedAt: string;
  articles: Record<DataLocale, OfficialArticle & { url: string; sha256: string }>;
}

const SITE_LOCALES: Record<DataLocale, string> = { ko_KR: "ko-kr", en_US: "en-us", zh_CN: "zh-tw" };
let urls: Promise<Map<string, string>> | undefined;

export function officialText(read: (locale: DataLocale) => string): PatchText {
  return Object.fromEntries(DATA_LOCALES.map(locale => [locale, read(locale)])) as PatchText;
}

function validateLocalizedValues(article: OfficialArticle, reference: OfficialArticle, where: string): void {
  const fingerprint = (value: string) => JSON.stringify([...value.matchAll(/\d*\.?\d+/g)]
    .map(match => Number(match[0])).sort((a, b) => a - b));
  for (const [entityIndex, entity] of article.entities.entries()) {
    for (const [sectionIndex, section] of entity.sections.entries()) {
      for (const [rowIndex, row] of section.rows.entries()) {
        const original = reference.entities[entityIndex].sections[sectionIndex].rows[rowIndex];
        if (fingerprint(row.before) !== fingerprint(original.before) || fingerprint(row.after) !== fingerprint(original.after)) {
          throw new Error(`Official locale values differ: ${where} ${entityIndex}/${sectionIndex}/${rowIndex}`);
        }
      }
    }
  }
}

export function validateOfficialArchive(value: unknown, patch: string): asserts value is OfficialPatchArchive {
  const archive = value as OfficialPatchArchive | undefined;
  if (!archive || archive.schemaVersion !== 1 || archive.patchVersion !== patch || !archive.articles) {
    throw new Error(`Invalid official patch archive: ${patch}`);
  }
  const reference = archive.articles.en_US;
  if (!reference?.entities.length || !reference.rowCount) throw new Error(`Empty official patch: ${patch}`);
  for (const locale of DATA_LOCALES) {
    const article = archive.articles[locale];
    if (!article || !/^https:\/\/www\.leagueoflegends\.com\//.test(article.url) || !/^[a-f0-9]{64}$/.test(article.sha256)) {
      throw new Error(`Invalid official source: ${patch}.${locale}`);
    }
    const shape = (data: OfficialArticle) => data.entities.map(entity => [entity.kind, entity.sections.map(section => section.rows.length)]);
    if (article.rowCount !== article.entities.reduce((sum, entity) => sum + entity.sections.reduce((n, section) => n + section.rows.length, 0), 0) ||
      JSON.stringify(shape(article)) !== JSON.stringify(shape(reference))) {
      throw new Error(`Official locale coverage differs: ${patch}.${locale}`);
    }
    validateLocalizedValues(article, reference, `${patch}.${locale}`);
  }
}

export async function collectOfficialPatch(patch: string): Promise<OfficialPatchArchive> {
  const file = path.join(ARCHIVE_DIRECTORY, "official", `${patch}.json`);
  const stored = await readJson(file);
  if (stored) { validateOfficialArchive(stored, patch); return stored; }
  urls ??= getText(SITEMAP).then(html => new Map(officialPatches(html).map(source => [source.patch, source.url])));
  const url = (await urls).get(patch);
  if (!url) throw new Error(`Official patch URL not discovered: ${patch}`);
  const pairs = await Promise.all(DATA_LOCALES.map(async locale => {
    const localizedUrl = url.replace("/en-us/", `/${SITE_LOCALES[locale]}/`);
    const html = officialArticleHtml(await getText(localizedUrl));
    return [locale, { ...parseOfficialArticle(html), url: localizedUrl,
      sha256: createHash("sha256").update(html).digest("hex") }] as const;
  }));
  const archive: OfficialPatchArchive = { schemaVersion: 1, patchVersion: patch, fetchedAt: new Date().toISOString(),
    articles: Object.fromEntries(pairs) as OfficialPatchArchive["articles"] };
  validateOfficialArchive(archive, patch);
  await archiveJson(file, archive);
  return archive;
}
