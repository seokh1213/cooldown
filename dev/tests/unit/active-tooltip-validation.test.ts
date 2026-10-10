import assert from "node:assert/strict";
import { test } from "node:test";
import type { Champion, ChampionSpell } from "../../../src/domain/game/types";
import {
  assertActiveTooltipReport,
  pruneAllowlist,
  validateActiveTooltips,
} from "../../scripts/data-pipeline/active-tooltip-validation";
import type {
  ChampionById,
  ChampionsByLocale,
} from "../../scripts/data-pipeline/champion-source";

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
  sources: { ddragon: "16.17.1", cdragon: "16.17" },
  allowlist: {
    unresolvedTokens: ["EnglishToken", "KnownToken", "ZedToken"],
    missingTooltips: ["Test:Q", "Test:W"],
  },
});

test("집계와 문제 목록, 허용 목록 안이면 통과", () => {
  assert.deepEqual(report.totals, {
    abilities: 4,
    localized: 2,
    fallback: 2,
    withDiagnostics: 3,
    uniqueUnresolvedTokens: 3,
    droppedCalculations: 0,
  });
  assert.deepEqual(
    report.issues.map(({ championId, locale }) => `${championId}:${locale}`),
    ["Test:en_US", "Test:ko_KR", "Zed:ko_KR"],
  );
  assert.doesNotThrow(() => assertActiveTooltipReport(report));
});

test("새 토큰이 생기면 막는다", () => {
  report.unexpectedTokens.push("NewToken");
  assert.throws(() => assertActiveTooltipReport(report), /1 new tokens/);
});

test("값을 버린 계산식 자리는 허용 목록(사유 포함) 밖이면 막고, 해소되면 걷어낸다", () => {
  const dropped = {
    tooltipSource: "communitydragon" as const,
    tooltipDiagnostics: {
      unresolvedTokens: [],
      droppedCalculations: [{ key: "TotalDamage", reason: "sum-mismatch" as const }],
    },
  };
  const champions: ChampionsByLocale = new Map([
    ["ko_KR", new Map([["Test", createChampion("Test", [createSpell("TestQ", dropped)])]])],
    ["en_US", new Map([["Test", createChampion("Test", [createSpell("TestQ", dropped)])]])],
  ]);
  const input = {
    championsByLocale: champions,
    patchVersion: "26.17",
    sources: { ddragon: "16.17.1", cdragon: "16.17" },
  };

  const blocked = validateActiveTooltips({
    ...input,
    allowlist: { unresolvedTokens: [], missingTooltips: [] },
  });
  assert.equal(blocked.totals.droppedCalculations, 2);
  assert.deepEqual(blocked.unexpectedDroppedCalculations, ["Test:Q:TotalDamage:sum-mismatch"]);
  assert.throws(() => assertActiveTooltipReport(blocked), /1 new dropped calculations/);

  const allowed = validateActiveTooltips({
    ...input,
    allowlist: {
      unresolvedTokens: [],
      missingTooltips: [],
      droppedCalculations: [
        { id: "Test:Q:TotalDamage:sum-mismatch", why: "시험용" },
        { id: "Gone:W:Old:unresolved-part", why: "해소됨" },
      ],
    },
  });
  assert.doesNotThrow(() => assertActiveTooltipReport(allowed));
  assert.deepEqual(allowed.staleAllowedDroppedCalculations, ["Gone:W:Old:unresolved-part"]);
  const pruned = pruneAllowlist(
    {
      unresolvedTokens: [],
      missingTooltips: [],
      droppedCalculations: [
        { id: "Test:Q:TotalDamage:sum-mismatch", why: "시험용" },
        { id: "Gone:W:Old:unresolved-part", why: "해소됨" },
      ],
    },
    allowed,
  );
  assert.deepEqual(pruned.allowlist.droppedCalculations, [
    { id: "Test:Q:TotalDamage:sum-mismatch", why: "시험용" },
  ]);
});

test("변신 폼 툴팁의 값 누락·미해석 토큰도 폼 키를 붙여 기준선으로 본다", () => {
  const champions: ChampionsByLocale = new Map([
    ["ko_KR", new Map([
      ["Jayce", createChampion("Jayce", [
        createSpell("JayceQ", {
          tooltipSource: "communitydragon",
          formDiagnostics: [{
            form: "B",
            spellId: "JayceShockBlast",
            unresolvedTokens: ["FormToken"],
            droppedCalculations: [{ key: "Damage", reason: "sum-mismatch" }],
          }],
        }),
      ])],
    ])],
  ]);
  const report = validateActiveTooltips({
    championsByLocale: champions,
    patchVersion: "26.19",
    sources: { ddragon: "16.19.1", cdragon: "16.19" },
    allowlist: { unresolvedTokens: [], missingTooltips: [], droppedCalculations: [] },
  });
  assert.deepEqual(report.unexpectedDroppedCalculations, ["Jayce:Q/B:Damage:sum-mismatch"]);
  assert.deepEqual(report.droppedCalculations.map(({ form, spellId }) => ({ form, spellId })), [
    { form: "B", spellId: "JayceShockBlast" },
  ]);
  assert.deepEqual(report.unexpectedTokens, ["FormToken"]);
  assert.equal(report.issues[0]?.form, "B");
  assert.throws(() => assertActiveTooltipReport(report), /1 new dropped calculations/);
});
