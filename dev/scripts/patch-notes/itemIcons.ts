import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { PatchNotesReport } from "../../../src/domain/game/contracts/patchNotes";
import { IMAGE_VERSION } from "../../../src/infrastructure/generated/assetVersion";

const relativeIcon = (patch: string, id: string) => `patch-notes/item-icons/${patch}/${id}.webp`;
async function exists(file: string): Promise<boolean> {
  try { await fs.access(file); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
}

export async function applyCachedItemIcons(report: PatchNotesReport): Promise<void> {
  for (const entry of report.entries.filter(entry => entry.kind === "item")) {
    const file = relativeIcon(report.patchVersion, entry.id);
    if (await exists(path.resolve("public", file))) entry.icon = file;
  }
}

export async function collectHistoricalItemIcons(report: PatchNotesReport): Promise<void> {
  for (const entry of report.entries.filter(entry => entry.kind === "item")) {
    if (!/^\d+$/.test(entry.id)) throw new Error(`Invalid historical item ID: ${entry.id}`);
    if (await exists(path.resolve("public/img", IMAGE_VERSION, "item", `${entry.id}.webp`))) continue;
    const relative = relativeIcon(report.patchVersion, entry.id);
    const file = path.resolve("public", relative);
    if (!await exists(file)) {
      const url = `https://ddragon.leagueoflegends.com/cdn/${report.sources.ddragon}/img/item/${entry.id}.png`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Historical item icon missing: ${report.patchVersion}/${entry.id}`);
      const bytes = await sharp(Buffer.from(await response.arrayBuffer())).resize(64, 64).webp({ quality: 90 }).toBuffer();
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, bytes, { flag: "wx" });
    }
    entry.icon = relative;
  }
}
