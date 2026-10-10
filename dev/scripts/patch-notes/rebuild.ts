import path from "node:path";
import { decodePatchNotesReport, type PatchNotesReport, type PatchSnapshot } from "../../../src/domain/game/contracts/patchNotes";
import { DATA_LOCALES } from "../../../src/domain/game/contracts/staticData";
import { comparePatchSnapshots } from "./diff";
import { type OfficialPatchArchive, validateOfficialArchive } from "./official";
import { applyOfficialPatch, officialIdentitySnapshot } from "./officialReport";
import { ARCHIVE_DIRECTORY, REPORT_DIRECTORY, readJson, writeJson } from "./storage";
import { collectPatchSkillCatalog, generatePatchSkillArchives } from "./skills";
import { applyCachedItemIcons, collectHistoricalItemIcons } from "./itemIcons";

export async function rebuildOfficialReport(patch: string): Promise<{
  published: PatchNotesReport; rebuilt: PatchNotesReport; archive: OfficialPatchArchive; snapshot: PatchSnapshot;
}> {
  const published = decodePatchNotesReport(await readJson(path.join(REPORT_DIRECTORY, `${patch}.json`)), patch);
  const [before, after, source] = await Promise.all([
    readJson(path.join(ARCHIVE_DIRECTORY, "snapshots", `${published.previousPatchVersion}.json`)),
    readJson(path.join(ARCHIVE_DIRECTORY, "snapshots", `${patch}.json`)),
    readJson(path.join(ARCHIVE_DIRECTORY, "official", `${patch}.json`)),
  ]);
  if (!before || !after) throw new Error(`Patch snapshots missing: ${patch}`);
  validateOfficialArchive(source, patch);
  const catalogs = Object.fromEntries(await Promise.all(DATA_LOCALES.map(async locale => {
    const catalog = await readJson(path.join(ARCHIVE_DIRECTORY, "skill-catalogs", `${patch}.${locale}.json`));
    if (!catalog) throw new Error(`Offline skill catalog missing: ${patch}.${locale}`);
    return [locale, catalog];
  }))) as Record<typeof DATA_LOCALES[number], Awaited<ReturnType<typeof collectPatchSkillCatalog>>>;
  const numeric = comparePatchSnapshots(before as PatchSnapshot, after as PatchSnapshot);
  numeric.reviewCount = published.reviewCount;
  const rebuilt = applyOfficialPatch(numeric, officialIdentitySnapshot(after as PatchSnapshot, before as PatchSnapshot), source, catalogs);
  await applyCachedItemIcons(rebuilt);
  return { published, rebuilt, archive: source, snapshot: after as PatchSnapshot };
}

export async function writeOfficialReport(result: Awaited<ReturnType<typeof rebuildOfficialReport>>): Promise<void> {
  await collectHistoricalItemIcons(result.rebuilt);
  await generatePatchSkillArchives(result.rebuilt, result.snapshot);
  await writeJson(path.join(REPORT_DIRECTORY, `${result.rebuilt.patchVersion}.json`), result.rebuilt);
}
