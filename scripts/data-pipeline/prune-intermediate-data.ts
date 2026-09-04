import * as fs from "node:fs";
import * as path from "node:path";

export function pruneIntermediateData(
  versionDir: string,
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
  const spellsDir = path.join(versionDir, "spells");
  if (fs.existsSync(spellsDir)) {
    removed += fs.readdirSync(spellsDir).filter((name) => name.endsWith(".json")).length;
    fs.rmSync(spellsDir, { recursive: true });
  }
  return removed;
}
