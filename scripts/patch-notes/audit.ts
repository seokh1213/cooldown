import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { decodePatchNotesIndex } from "../../src/data/contracts/patchNotes";
import { rebuildOfficialReport, writeOfficialReport } from "./rebuild";
import { REPORT_DIRECTORY, readJson } from "./storage";

const args = process.argv.slice(2);
if (args.some(arg => arg !== "--write")) throw new Error("Use patch-notes:audit [--write]");
const write = args.includes("--write");
const index = decodePatchNotesIndex(await readJson(path.join(REPORT_DIRECTORY, "index.json")));
const results: Awaited<ReturnType<typeof rebuildOfficialReport>>[] = [];
const failures: string[] = [];
for (const patch of index.patches) {
  try {
    const result = await rebuildOfficialReport(patch.patchVersion);
    if (result.rebuilt.previousPatchVersion !== patch.previousPatchVersion) throw new Error("Index comparison differs");
    if (!write && !isDeepStrictEqual(JSON.parse(JSON.stringify(result.rebuilt)), result.published)) {
      throw new Error("Published report differs from reviewed source; run patch-notes:audit -- --write");
    }
    results.push(result);
  } catch (error) { failures.push(`${patch.patchVersion}: ${(error as Error).message}`); }
}
if (failures.length) throw new Error(`Official patch audit failed:\n${failures.join("\n")}`);
if (write) for (const result of results) await writeOfficialReport(result);
const rows = results.reduce((sum, result) => sum + result.rebuilt.officialSource!.rowCount, 0);
console.log(`${results.length} patches, 3 locales, ${rows} official rows: ${write ? "rebuilt" : "verified"}`);
