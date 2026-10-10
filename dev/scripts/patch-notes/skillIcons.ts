import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import type { PatchNoteEntry, PatchNotesReport } from "../../../src/domain/game/contracts/patchNotes";
import { patchGameDataKey } from "../../../src/domain/game/contracts/patchNotes";
import type { PatchSkillIcon } from "../../../src/domain/game/contracts/patchSkills";
import { fetchJson } from "../data-pipeline/io/json";
import { ARCHIVE_DIRECTORY, archiveJson, readJson } from "./storage";
import type { NumericChampion } from "./sourceTypes";

export interface SourceSkillIcon {
  spellId: string;
  iconPath: string;
  file: string;
}
type IconCatalog = Record<string, SourceSkillIcon>;
type SpellNode = { mScriptName?: string; ObjectName?: string; mSpell?: { mImgIconName?: string[] } };

export function selectPatchSkillIcons(sourceKeys: string[], catalog: IconCatalog, ownership?: {
  section: string; source: NumericChampion;
}): PatchSkillIcon[] {
  const selected = new Map<string, PatchSkillIcon>();
  for (const key of sourceKeys) {
    const spellPath = key.split(/\/(?:values|calculations)\//)[0];
    const rootIndex = ownership?.source.rootSpells?.indexOf(spellPath) ?? -1;
    const sourceSlot = rootIndex >= 0 ? ["Q", "W", "E", "R"][rootIndex]
      : ownership?.source.passive === spellPath ? "P" : undefined;
    // Storage can belong to R while the reported effect belongs to Q or P (Ryze, Elise).
    if (sourceSlot && sourceSlot !== ownership?.section) continue;
    const icon = catalog[spellPath];
    if (icon) selected.set(icon.file, { file: icon.file, spellId: icon.spellId });
  }
  return [...selected.values()];
}

async function storeIcon(version: string, iconPath: string): Promise<string> {
  const response = await fetch(`https://raw.communitydragon.org/${version}/game/${iconPath}`);
  if (!response.ok) throw new Error(`Patch skill icon unavailable: ${version}/${iconPath} (${response.status})`);
  const bytes = await sharp(Buffer.from(await response.arrayBuffer())).resize(64, 64).webp({ quality: 90 }).toBuffer();
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 32);
  const file = `patch-notes/icons/${hash}.webp`;
  await fs.mkdir(path.resolve("public/patch-notes/icons"), { recursive: true });
  try { await fs.writeFile(path.resolve("public", file), bytes, { flag: "wx" }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  return file;
}

async function championIcons(report: PatchNotesReport, entry: PatchNoteEntry): Promise<IconCatalog> {
  const paths = new Set(entry.changes.filter(change => change.section !== "stats")
    .map(change => patchGameDataKey(change).split(/\/(?:values|calculations)\//)[0])
    .filter(spellPath => spellPath.startsWith("Characters/") || spellPath.startsWith("{")));
  if (!paths.size) return {};
  const archive = path.join(ARCHIVE_DIRECTORY, "icon-catalogs", report.patchVersion, `${entry.id}.json`);
  const stored = await readJson(archive) as IconCatalog | undefined;
  if (stored) return stored;
  const lower = entry.id.toLowerCase();
  const source = await fetchJson<Record<string, SpellNode>>(
    `https://raw.communitydragon.org/${report.sources.cdragon}/game/data/characters/${lower}/${lower}.bin.json`);
  const catalog: IconCatalog = {};
  await Promise.all([...paths].map(async spellPath => {
    const node = source[spellPath];
    const iconPath = node?.mSpell?.mImgIconName?.[0]?.toLowerCase().replace(/\.dds$/, ".png");
    if (!iconPath) return;
    catalog[spellPath] = { spellId: node.mScriptName ?? node.ObjectName ?? spellPath.split("/").at(-1)!,
      iconPath, file: await storeIcon(report.sources.cdragon, iconPath) };
  }));
  await archiveJson(archive, catalog);
  return catalog;
}

export async function collectPatchSkillIcons(report: PatchNotesReport): Promise<Record<string, IconCatalog>> {
  const entries = report.entries.filter(entry => entry.kind === "champion");
  const catalogs: Record<string, IconCatalog> = {};
  for (let offset = 0; offset < entries.length; offset += 6) {
    await Promise.all(entries.slice(offset, offset + 6).map(async entry => {
      catalogs[entry.id] = await championIcons(report, entry);
    }));
  }
  return catalogs;
}
