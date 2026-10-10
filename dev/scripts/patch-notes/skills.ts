import path from "node:path";
import type { Champion, ChampionSpell } from "../../../src/domain/game/types";
import type { ChampionDetailV2 } from "../../../src/domain/game/contracts/championData";
import { toChampion } from "../../../src/infrastructure/mappers/championMapper";
import type { DataLocale } from "../../../src/domain/game/contracts/staticData";
import { DATA_LOCALES } from "../../../src/domain/game/contracts/staticData";
import type { PatchNotesReport, PatchSnapshot, PatchMetric } from "../../../src/domain/game/contracts/patchNotes";
import { patchGameDataKey } from "../../../src/domain/game/contracts/patchNotes";
import { decodePatchSkillArchive, patchSkillKey, type PatchSkillArchive, type PatchSkillInfo } from "../../../src/domain/game/contracts/patchSkills";
import { formatPatchValues, groupPatchChanges } from "../../../src/features/patch-notes/data/model";
import { patchNotesLabels } from "../../../src/features/patch-notes/formatting/labels";
import { fetchJson } from "../data-pipeline/io/json";
import { ARCHIVE_DIRECTORY, REPORT_DIRECTORY, readJson, archiveJson, writeJson } from "./storage";
import { collectPatchSkillIcons, selectPatchSkillIcons } from "./skillIcons";
import type { NumericChampion } from "./sourceTypes";

export interface SkillCatalogChampion {
  partype: string;
  passive: { name: string; description: string; image: { full: string } };
  spells: Array<ChampionSpell & { name: string; image: { full: string } }>;
}

type SkillCatalog = Record<string, SkillCatalogChampion>;
const SLOTS = ["Q", "W", "E", "R"] as const;

export async function collectPatchSkillCatalog(report: PatchNotesReport, locale: DataLocale): Promise<SkillCatalog> {
  const file = path.join(ARCHIVE_DIRECTORY, "skill-catalogs", `${report.patchVersion}.${locale}.json`);
  const stored = await readJson(file) as SkillCatalog | undefined;
  if (stored) return stored;
  const response = await fetchJson<{ data: SkillCatalog }>(
    `https://ddragon.leagueoflegends.com/cdn/${report.sources.ddragon}/data/${locale}/championFull.json`);
  const compact = Object.fromEntries(Object.entries(response.data).map(([id, champion]) => [id, {
    partype: champion.partype, passive: champion.passive,
    spells: champion.spells.map(({ id: spellId, name, description, maxrank, cooldown, cost, image }) =>
      ({ id: spellId, name, description, maxrank, cooldown, cost, image })),
  }]));
  await archiveJson(file, compact);
  return compact;
}

async function currentChampion(report: PatchNotesReport, locale: DataLocale, id: string): Promise<Champion | undefined> {
  const file = path.resolve("public/data", report.patchVersion, "champions", locale, `${id}.json`);
  const detail = await readJson(file) as ChampionDetailV2 | undefined;
  if (!detail || detail.patchVersion !== report.patchVersion || detail.sources.ddragon !== report.sources.ddragon ||
    detail.sources.cdragon !== report.sources.cdragon) return undefined;
  return toChampion(detail);
}

export function buildPatchSkillInfo(options: {
  championId: string; section: string; title: string; metrics: PatchMetric[];
  metadata: SkillCatalogChampion; locale: DataLocale; current?: Champion;
}): PatchSkillInfo {
  const { championId, section, title, metrics, metadata, locale, current } = options;
  const ranks = metrics.filter(metric => !/\/(cooldown|cost)$/.test(metric.id)).map(metric => ({
    label: metric.label[locale], values: formatPatchValues({ ...metric, before: metric.values, after: metric.values, impact: "adjustment" }, "after", patchNotesLabels[locale].seconds),
  }));
  if (section === "P") {
    return { slot: "P", passive: { ...(current?.passive ?? metadata.passive), name: title,
      rankValues: current?.passive?.rankValues ?? ranks } };
  }
  const index = SLOTS.indexOf(section as typeof SLOTS[number]);
  if (index < 0) throw new Error(`Unsupported skill slot: ${section}`);
  const spell = metadata.spells[index];
  const canonical = current?.spells?.[index];
  if (canonical?.name === title) return { slot: SLOTS[index], skill: canonical };
  const isVariant = spell.name !== title;
  const cooldown = metrics.find(metric => metric.id === `${championId}/abilities/${section}/cooldown`)?.values ??
    metrics.find(metric => metric.unit === "seconds" && metric.label.en_US.startsWith("Cooldown"))?.values ??
    (isVariant ? [] : spell.cooldown);
  const cost = isVariant ? undefined : spell.cost;
  return { slot: SLOTS[index], skill: { ...spell, name: title, cooldown, cooldownBurn: cooldown.join("/"),
    cost, costBurn: cost?.join("/"), costType: metadata.partype, rankValues: ranks } };
}

export async function generatePatchSkillArchives(report: PatchNotesReport, snapshot: PatchSnapshot): Promise<void> {
  const entities = new Map(snapshot.entities.map(entity => [entity.id, entity]));
  const icons = await collectPatchSkillIcons(report);
  const sources = await readJson(path.join(ARCHIVE_DIRECTORY, "sources", `${report.patchVersion}.json`)) as Record<string, NumericChampion>;
  await Promise.all(DATA_LOCALES.map(async locale => {
    const file = path.join(REPORT_DIRECTORY, "skills", `${report.patchVersion}.${locale}.json`);
    const stored = await readJson(file);
    const metadata = await collectPatchSkillCatalog(report, locale);
    const archive: PatchSkillArchive = stored
      ? decodePatchSkillArchive(stored, { patchVersion: report.patchVersion, sources: report.sources, locale })
      : { schemaVersion: 1, patchVersion: report.patchVersion, sources: report.sources, locale, champions: {} };
    let changed = !stored;
    for (const entry of report.entries.filter(entity => entity.kind === "champion")) {
      const skills = archive.champions[entry.id] ??= {};
      for (const group of groupPatchChanges(entry.changes, locale).filter(group => group.section !== "stats")) {
        const key = patchSkillKey(group.section, group.title);
        if (!skills[key]) {
          const metrics = entities.get(entry.id)?.metrics.filter(metric => metric.section === group.section && metric.sectionName?.[locale] === group.title) ?? [];
          skills[key] = buildPatchSkillInfo({ championId: entry.id, section: group.section, title: group.title, metrics,
            metadata: metadata[entry.id], locale, current: await currentChampion(report, locale, entry.id) });
          changed = true;
        }
        const selected = selectPatchSkillIcons(group.changes.map(patchGameDataKey), icons[entry.id], { section: group.section, source: sources[entry.id] });
        if (JSON.stringify(skills[key].icons ?? []) !== JSON.stringify(selected)) {
          if (selected.length) skills[key].icons = selected;
          else delete skills[key].icons;
          changed = true;
        }
      }
    }
    if (changed) await writeJson(file, archive);
  }));
}
