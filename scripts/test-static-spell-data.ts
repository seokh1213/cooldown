import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface VersionInfo {
  version: string;
}

interface SpellDataFile {
  spellData: Record<string, {
    DataValues?: Record<string, number[]>;
  }>;
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(
  await fs.readFile(path.join(projectRoot, "public/data/version.json"), "utf8")
) as VersionInfo;
const corki = JSON.parse(
  await fs.readFile(
    path.join(projectRoot, "public/data", version.version, "spells/Corki.json"),
    "utf8"
  )
) as SpellDataFile;

const qDataValues = corki.spellData.PhosphorusBomb?.DataValues;
assert.ok(qDataValues, "Corki Q DataValues must be generated from the current CDragon schema");
assert.deepEqual(qDataValues.BaseDamage?.slice(1, 6), [60, 105, 150, 195, 240]);
assert.deepEqual(qDataValues.ADRatio?.slice(1, 6), [1.25, 1.25, 1.25, 1.25, 1.25]);
assert.deepEqual(qDataValues.APRatio?.slice(1, 6), [1, 1, 1, 1, 1]);

console.log("✅ Current CommunityDragon DataValues schema passed");
