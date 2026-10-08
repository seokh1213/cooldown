import fs from "node:fs/promises";
import path from "node:path";
import type { PatchMetric, PatchSnapshot, PatchSnapshotEntity, PatchText } from "../../src/data/contracts/patchNotes";
import { DATA_LOCALES, type DataLocale } from "../../src/data/contracts/staticData";
import { resolveStaticDataRelease, type StaticDataRelease } from "../../src/lib/staticDataRelease";
import { fetchJson } from "../data-pipeline/io/json";
import { ITEM_DEFINITIONS, SPECIFIC_DEFINITIONS, STAT_LABELS, VALUE_DEFINITIONS, text, type MetricDefinition } from "./metricLabels";
import type { ChampionCatalogEntry, ItemCatalogEntry, NumericChampion, NumericSpell } from "./sourceTypes";
import { ARCHIVE_DIRECTORY, archiveJson } from "./storage";

type RawRecord = Record<string, unknown>;
type LocalizedCatalog<T> = Record<DataLocale, Record<string, T>>;
const slots = ["Q", "W", "E", "R"];

function record(value: unknown): RawRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RawRecord : {};
}

function numericArray(value: unknown): number[] | undefined {
  return Array.isArray(value) && value.length > 0 && value.every(n => typeof n === "number" && Number.isFinite(n))
    ? value : undefined;
}

export function flattenNumbers(value: unknown, prefix = "", result: Record<string, number[]> = {}): Record<string, number[]> {
  const array = numericArray(value);
  if (array) result[prefix] = array;
  else if (typeof value === "number" && Number.isFinite(value)) result[prefix] = [value];
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (key !== "__type") flattenNumbers(child, `${prefix}/${key}`, result);
    }
  }
  return result;
}

function extractSpell(value: unknown): NumericSpell {
  const spell = record(value);
  const values: Record<string, number[]> = {};
  for (const rawValue of Array.isArray(spell.DataValues) ? spell.DataValues : []) {
    const entry = record(rawValue);
    const numbers = numericArray(entry.values);
    if (typeof entry.name === "string" && numbers) values[entry.name] = numbers;
  }
  return { values, calculations: flattenNumbers(spell.mSpellCalculations),
    cooldown: numericArray(spell.cooldownTime), cost: numericArray(spell.mana) };
}

async function fetchCatalog<T>(release: StaticDataRelease, file: string): Promise<LocalizedCatalog<T>> {
  const entries = await Promise.all(DATA_LOCALES.map(async locale => {
    const response = await fetchJson<{ data: Record<string, T> }>(
      `https://ddragon.leagueoflegends.com/cdn/${release.sources.ddragon}/data/${locale}/${file}.json`);
    return [locale, response.data] as const;
  }));
  return Object.fromEntries(entries) as LocalizedCatalog<T>;
}

async function numericChampions(release: StaticDataRelease, catalog: Record<string, ChampionCatalogEntry>): Promise<Record<string, NumericChampion>> {
  const archive = path.join(ARCHIVE_DIRECTORY, "sources", `${release.patchVersion}.json`);
  try { return JSON.parse(await fs.readFile(archive, "utf8")) as Record<string, NumericChampion>; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const cache = path.resolve("research/.patch-cache", release.sources.ddragon, "patch-notes-champions.json");
  try { return JSON.parse(await fs.readFile(cache, "utf8")) as Record<string, NumericChampion>; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const result: Record<string, NumericChampion> = {};
  const ids = Object.keys(catalog);
  for (let index = 0; index < ids.length; index += 6) {
    await Promise.all(ids.slice(index, index + 6).map(async id => {
      const lower = id.toLowerCase();
      const source = await fetchJson<RawRecord>(`https://raw.communitydragon.org/${release.sources.cdragon}/game/data/characters/${lower}/${lower}.bin.json`);
      const root = record(Object.entries(source).find(([key]) => key.endsWith("/CharacterRecords/Root"))?.[1]);
      const spells = Object.fromEntries(Object.entries(source)
        .filter(([, value]) => record(value).mSpell)
        .map(([key, value]) => [key, extractSpell(record(value).mSpell)]));
      result[id] = { name: catalog[id].name, stats: catalog[id].stats, spells,
        rootSpells: Array.isArray(root.spells) ? root.spells as string[] : undefined,
        passive: typeof root.mCharacterPassiveSpell === "string" ? root.mCharacterPassiveSpell : undefined,
        attackDamagePerLevel: typeof record(root.damagePerLevelModifiable).baseValue === "number"
          ? record(root.damagePerLevelModifiable).baseValue as number : undefined };
    }));
    if (index % 30 === 0 || index + 6 >= ids.length) {
      console.log(`${release.patchVersion}: ${Math.min(index + 6, ids.length)}/${ids.length} champions`);
    }
  }
  await fs.mkdir(path.dirname(cache), { recursive: true });
  await fs.writeFile(cache, JSON.stringify(result));
  return result;
}

function localized(read: (locale: DataLocale) => string): PatchText {
  return Object.fromEntries(DATA_LOCALES.map(locale => [locale, read(locale)])) as PatchText;
}

function slotFor(id: string, spellPath: string, source: NumericChampion): string | undefined {
  if (source.passive === spellPath) return "P";
  const index = source.rootSpells?.indexOf(spellPath) ?? -1;
  if (index >= 0 && index < 4) return slots[index];
  const name = spellPath.split("/").at(-1) ?? "";
  if (/Passive|HeatSystem/.test(name) || name === `${id}P`) return "P";
  return name.match(new RegExp(`^${id}(?:Human|Spider)?([QWER])`))?.[1];
}

export function buildMetric(id: string, values: number[], definition: MetricDefinition, section: string): PatchMetric {
  const factor = definition.factor ?? 1;
  const clean = values.map(value => Number((value * factor).toFixed(5)));
  return { id, label: definition.label, section: definition.section ?? section,
    sectionName: definition.sectionName, values: clean.every(value => value === clean[0]) ? [clean[0]] : clean,
    unit: definition.unit ?? "number", favorable: definition.favorable ?? "higher", format: definition.format, sourceKey: id };
}

function spellMetrics(id: string, source: NumericChampion): PatchMetric[] {
  const metrics: PatchMetric[] = [];
  for (const [spellPath, spell] of Object.entries(source.spells)) {
    const slot = slotFor(id, spellPath, source);
    if (!slot) continue;
    const count = slot === "R" ? 3 : 5;
    for (const [key, values] of Object.entries(spell.values)) {
      const definition = VALUE_DEFINITIONS[key];
      if (!definition) continue;
      const start = definition.start ?? (values.length === 7 ? 1 : 0);
      metrics.push(buildMetric(`${spellPath}/values/${key}`, values.slice(start, start + (definition.count ?? count)), definition, slot));
    }
  }
  return metrics;
}

function specificMetrics(id: string, source: NumericChampion): PatchMetric[] {
  return SPECIFIC_DEFINITIONS.filter(definition => definition.championId === id).flatMap(definition => {
    const pair = Object.entries(source.spells).find(([spellPath]) => spellPath.split("/").at(-1) === definition.spellName);
    if (!pair) return [];
    const [spellPath, spell] = pair;
    const values = definition.keys.flatMap(key => spell[definition.group][key] ??
      (definition.defaultValue !== undefined ? [definition.defaultValue] : []));
    if (!values.length) return [];
    const start = definition.start ?? (values.length === 7 ? 1 : 0);
    const sliced = values.slice(start, definition.count === undefined ? undefined : start + definition.count);
    return [buildMetric(`${spellPath}/${definition.group}/${definition.keys.join("+")}`, sliced,
      definition, definition.section ?? slotFor(id, spellPath, source) ?? "P")];
  });
}

function championEntities(raw: Record<string, NumericChampion>, catalog: LocalizedCatalog<ChampionCatalogEntry>): PatchSnapshotEntity[] {
  return Object.entries(raw).sort(([a], [b]) => a.localeCompare(b)).map(([id, source]) => {
    const metrics = Object.entries(STAT_LABELS).flatMap(([key, label]) => {
      const value = key === "attackdamageperlevel" ? source.attackDamagePerLevel ?? source.stats[key] : source.stats[key];
      return typeof value === "number" ? [buildMetric(`stats/${key}`, [value], { label }, "stats")] : [];
    });
    metrics.push(...spellMetrics(id, source), ...specificMetrics(id, source));
    catalog.ko_KR[id].spells.forEach((spell, index) => {
      const section = slots[index];
      metrics.push(buildMetric(`${id}/abilities/${section}/cooldown`, spell.cooldown,
        { label: text("재사용 대기시간", "Cooldown", "冷却时间"), unit: "seconds", favorable: "lower" }, section));
      metrics.push(buildMetric(`${id}/abilities/${section}/cost`, spell.cost,
        { label: source.stats.mp > 0 ? text("마나 소모량", "Mana cost", "法力消耗") : text("자원 소모량", "Resource cost", "资源消耗"), favorable: "lower" }, section));
    });
    for (const metric of metrics) {
      if (metric.sectionName || metric.section === "stats") continue;
      const slotIndex = slots.indexOf(metric.section);
      metric.sectionName = localized(locale => slotIndex < 0 ? catalog[locale][id].passive.name : catalog[locale][id].spells[slotIndex]?.name ?? metric.section);
    }
    return { id, kind: "champion", name: localized(locale => catalog[locale][id].name), metrics };
  });
}

export function itemStatMetrics(id: string, item: RawRecord): PatchMetric[] {
  return Object.entries(ITEM_DEFINITIONS).map(([key, definition]) =>
    buildMetric(`Items/${id}/${key}`, [typeof item[key] === "number" ? item[key] as number : 0], definition, "stats"));
}

function itemEntities(source: RawRecord, catalog: LocalizedCatalog<ItemCatalogEntry>): PatchSnapshotEntity[] {
  return Object.entries(catalog.ko_KR).filter(([, item]) => item.maps?.["11"]).map(([id]) => {
    const item = record(source[`Items/${id}`]);
    const metrics = itemStatMetrics(id, item);
    return { id, kind: "item", name: localized(locale => catalog[locale][id]?.name ?? id), metrics };
  });
}

export async function collectPatchSnapshot(ddragonVersion: string): Promise<PatchSnapshot> {
  const release = resolveStaticDataRelease(ddragonVersion);
  const [championCatalog, itemCatalog, itemSource] = await Promise.all([
    fetchCatalog<ChampionCatalogEntry>(release, "championFull"),
    fetchCatalog<ItemCatalogEntry>(release, "item"),
    fetchJson<RawRecord>(`https://raw.communitydragon.org/${release.sources.cdragon}/game/items.cdtb.bin.json`),
  ]);
  const raw = await numericChampions(release, championCatalog.ko_KR);
  const sourceFile = path.join(ARCHIVE_DIRECTORY, "sources", `${release.patchVersion}.json`);
  await archiveJson(sourceFile, raw);
  return { schemaVersion: 1, patchVersion: release.patchVersion, sources: release.sources,
    entities: [...championEntities(raw, championCatalog), ...itemEntities(itemSource, itemCatalog)] };
}
