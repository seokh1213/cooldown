import assert from "node:assert/strict";
import type { Champion, ChampionSpell } from "../src/types";
import {
  assertActiveTooltipReport,
  validateActiveTooltips,
} from "./data-pipeline/active-tooltip-validation";
import type {
  ChampionById,
  ChampionsByLocale,
} from "./data-pipeline/champion-source";

function createSpell(
  id: string,
  overrides: Partial<ChampionSpell> = {},
): ChampionSpell {
  return { id, maxrank: 1, cooldown: [], ...overrides };
}

function createChampion(id: string, spells: ChampionSpell[]): Champion {
  return { id, key: id, name: id, title: "", spells };
}

const koreanChampions: ChampionById = new Map([
  [
    "Zed",
    createChampion("Zed", [
      createSpell("ZedQ", {
        tooltipSource: "communitydragon",
        tooltipDiagnostics: { unresolvedTokens: ["ZedToken"] },
      }),
    ]),
  ],
  [
    "Test",
    createChampion("Test", [
      createSpell("TestQ", {
        tooltipSource: "communitydragon",
        tooltipDiagnostics: { unresolvedTokens: ["KnownToken"] },
      }),
      createSpell("TestW"),
    ]),
  ],
]);
const englishChampions: ChampionById = new Map([
  [
    "Test",
    createChampion("Test", [
      createSpell("TestQEn", {
        tooltipDiagnostics: { unresolvedTokens: ["EnglishToken"] },
      }),
    ]),
  ],
]);
const championsByLocale: ChampionsByLocale = new Map([
  ["ko_KR", koreanChampions],
  ["en_US", englishChampions],
]);

const report = validateActiveTooltips({
  championsByLocale,
  patchVersion: "26.17",
  allowlist: {
    unresolvedTokens: ["EnglishToken", "KnownToken", "ZedToken"],
    missingTooltips: ["Test:Q", "Test:W"],
  },
});
assert.deepEqual(report.totals, {
  abilities: 4,
  localized: 2,
  fallback: 2,
  withDiagnostics: 3,
  uniqueUnresolvedTokens: 3,
});
assert.deepEqual(
  report.issues.map(({ championId, locale }) => `${championId}:${locale}`),
  ["Test:en_US", "Test:ko_KR", "Zed:ko_KR"],
);
assert.doesNotThrow(() => assertActiveTooltipReport(report));

report.unexpectedTokens.push("NewToken");
assert.throws(() => assertActiveTooltipReport(report), /1 new tokens/);

console.log("✅ Active tooltip regression validation passed");
