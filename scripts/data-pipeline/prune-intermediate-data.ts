import * as fs from "node:fs";
import * as path from "node:path";
import type { DataLocale } from "../../src/data/contracts/staticData";

export function pruneIntermediateChampionData(
  versionDir: string,
  locales: readonly DataLocale[]
): number {
  const championsDir = path.join(versionDir, "champions");
  let removed = 0;

  for (const fileName of fs.readdirSync(championsDir)) {
    const filePath = path.join(championsDir, fileName);
    if (fs.statSync(filePath).isFile() && fileName.endsWith(".json")) {
      fs.unlinkSync(filePath);
      removed += 1;
    }
  }
  for (const locale of locales) {
    const filePath = path.join(
      versionDir,
      `champions-normalized-${locale}.json`
    );
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      removed += 1;
    }
  }
  return removed;
}
