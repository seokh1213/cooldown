import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pruneIntermediateData } from "./data-pipeline/prune-intermediate-data";

const versionDir = fs.mkdtempSync(path.join(os.tmpdir(), "prune-champions-"));
const championsDir = path.join(versionDir, "champions");
const localeDir = path.join(championsDir, "ko_KR");
fs.mkdirSync(localeDir, { recursive: true });
fs.writeFileSync(path.join(championsDir, "Test-ko_KR.json"), "{}");
fs.writeFileSync(path.join(localeDir, "Test.json"), "{}");
fs.writeFileSync(path.join(versionDir, "champions-normalized-ko_KR.json"), "{}");
const spellsDir = path.join(versionDir, "spells");
fs.mkdirSync(spellsDir);
fs.writeFileSync(path.join(spellsDir, "Test.json"), "{}");

assert.equal(pruneIntermediateData(versionDir, ["ko_KR"]), 3);
assert.equal(fs.existsSync(path.join(championsDir, "Test-ko_KR.json")), false);
assert.equal(fs.existsSync(path.join(localeDir, "Test.json")), true);
assert.equal(fs.existsSync(spellsDir), false);
fs.rmSync(versionDir, { recursive: true });

console.log("✅ Intermediate champion pruning passed");
