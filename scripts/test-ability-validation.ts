import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Champion, ChampionSpell } from "../src/types";
import type { ActiveSpellSourceData } from "./data-pipeline/cdragon-active-spells";
import { validateGeneratedAbilities } from "./data-pipeline/ability-validation";

function createSpell(id: string): ChampionSpell {
  return {
    id,
    maxrank: 2,
    cooldown: [8, 7],
    cost: [20, 30],
  };
}

function createChampion(id: string): Champion {
  return {
    id,
    key: id,
    name: id,
    title: "",
    spells: ["Q", "W", "E", "R"].map((slot) => createSpell(`${id}${slot}`)),
  };
}

function createSource(path: string): ActiveSpellSourceData {
  return {
    path,
    cooldowns: [8, 7],
    costs: [20, 30],
    locKeys: { keyTooltip: `${path}_Tooltip` },
  };
}

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ability-validation-"));
const allowlistPath = path.join(directory, "allowlist.json");
fs.writeFileSync(
  allowlistPath,
  JSON.stringify([
    { key: "Alpha:Q:missing-tooltip-key", reason: "known source gap" },
  ])
);

const alphaSources = ["Q", "W", "E", "R"].map((slot) =>
  createSource(`Alpha${slot}`)
);
alphaSources[0] = { ...alphaSources[0], locKeys: {} };
const betaSources = ["Q", "W", "E", "R"].map((slot) =>
  createSource(`Beta${slot}`)
);
betaSources[0] = { ...betaSources[0], costs: undefined };

const report = validateGeneratedAbilities({
  championsById: new Map([
    ["Beta", createChampion("Beta")],
    ["Alpha", createChampion("Alpha")],
  ]),
  patchVersion: "26.17",
  sources: { ddragon: "16.17.1", cdragon: "16.17" },
  allowlistPath,
  abilitySourcesByChampion: new Map([
    ["Beta", betaSources],
    ["Alpha", alphaSources],
  ]),
});

assert.deepEqual(report.summary, {
  champions: 2,
  abilities: 8,
  tooltipKeys: 7,
  cooldownMatches: 8,
  costMatches: 7,
  knownIssues: 1,
  unexpectedIssues: 1,
});
assert.deepEqual(
  report.issues.map(({ key, allowlisted, reason }) => ({
    key,
    allowlisted,
    reason,
  })),
  [
    {
      key: "Alpha:Q:missing-tooltip-key",
      allowlisted: true,
      reason: "known source gap",
    },
    {
      key: "Beta:Q:missing-cost",
      allowlisted: false,
      reason: undefined,
    },
  ]
);

fs.rmSync(directory, { recursive: true });
console.log("✅ Ability source validation passed");
