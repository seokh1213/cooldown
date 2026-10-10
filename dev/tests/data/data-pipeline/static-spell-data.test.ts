import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  decodeChampionDetail,
  decodeChampionIndex,
} from "../../../../src/domain/game/contracts/championDataDecoder";
import type { AbilitySimulationExpr } from "../../../../src/domain/game/contracts/championData";
import type { DataManifest } from "../../../../src/domain/game/contracts/dataManifest";

const locales = ["ko_KR", "en_US", "zh_CN"] as const;
const slots = ["Q", "W", "E", "R"] as const;
const allowedPassiveFallbacks = new Set([
  "Zilean",
]);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const manifest = JSON.parse(
  await fs.readFile(path.join(projectRoot, "public/data/version.json"), "utf8")
) as DataManifest;
const versionDir = path.join(projectRoot, "public/data", manifest.patchVersion);
const simulationReport = JSON.parse(await fs.readFile(
  path.join(versionDir, "ability-simulation-validation.json"),
  "utf8"
)) as { summary: { abilities: number; complete: number; unsupported: number; unavailable: number } };

const wukong = decodeChampionDetail(JSON.parse(
  await fs.readFile(path.join(versionDir, "champions/ko_KR/MonkeyKing.json"), "utf8")
));
const wukongQ = wukong.champion.abilities.Q;

test("오공 Q 원문·랭크 값·시뮬레이션", () => {
  assert.equal(wukong.champion.baseStats.attackDamage.perLevel, 3.5);
  assert.match(wukongQ.bodyHtml, /사거리가 135\/145\/155\/165\/175 증가/);
  assert.match(wukongQ.bodyHtml, /방어력이 10\/15\/20\/25\/30%/);
  assert.deepEqual(wukongQ.rankValues[0], {
    label: "피해량",
    values: "20/45/70/95/120",
  });
  assert.deepEqual(wukongQ.simulation.primary?.baseByRank, [20, 45, 70, 95, 120]);
  assert.equal(wukongQ.simulation.primary?.terms[0].stat, "bonusAttackDamage");
});

const englishIndex = decodeChampionIndex(JSON.parse(
  await fs.readFile(path.join(versionDir, "champions/en_US/index.json"), "utf8")
));
/** 표현식의 모든 곡선이 스킬 최대 레벨과 길이가 맞는지 재귀로 확인한다. */
function assertExpressionCurves(node: AbilitySimulationExpr, maxRank: number): void {
  if (node.kind === "sum" || node.kind === "product") {
    assert.ok(node.parts.length > 0);
    for (const part of node.parts) assertExpressionCurves(part, maxRank);
    return;
  }
  const curve = node.kind === "value" ? node.value : node.coefficient;
  if (curve.byRank) assert.equal(curve.byRank.length, maxRank);
  if (curve.byRankAndLevel) assert.equal(curve.byRankAndLevel.length, maxRank);
}

interface SpellCounts {
  active: number;
  precomputed: number;
  detailedPassives: number;
  simulations: Record<"complete" | "expression" | "unsupported" | "unavailable", number>;
}

async function validateChampion(entry: { id: string }, counts: SpellCounts): Promise<void> {
  const detail = decodeChampionDetail(JSON.parse(
    await fs.readFile(path.join(versionDir, `champions/en_US/${entry.id}.json`), "utf8")
  ));
  let passiveLocalized = true;
  for (const locale of locales) {
    const localized = locale === "en_US" ? detail : decodeChampionDetail(JSON.parse(
      await fs.readFile(
        path.join(versionDir, `champions/${locale}/${entry.id}.json`),
        "utf8"
      )
    ));
    const passive = localized.champion.abilities.P;
    assert.doesNotMatch(passive.bodyHtml, /@[^@]+@|\{\{[^}]+}}/);
    if (passive.source !== "communitydragon") passiveLocalized = false;
  }
  if (passiveLocalized) counts.detailedPassives += 1;
  else assert.ok(allowedPassiveFallbacks.has(entry.id), entry.id);

  for (const slot of slots) {
    const ability = detail.champion.abilities[slot];
    assert.equal(ability.maxRank > 0, true, `${entry.id} ${slot} maxRank`);
    counts.active += 1;
    if (ability.source === "communitydragon") counts.precomputed += 1;
    counts.simulations[ability.simulation.status] += 1;
    if (ability.simulation.status === "complete") {
      const primary = ability.simulation.primary!;
      if (primary.baseByRank) assert.equal(primary.baseByRank.length, ability.maxRank);
      if (primary.baseByRankAndLevel) {
        assert.equal(primary.baseByRankAndLevel.length, ability.maxRank);
      }
      for (const term of ability.simulation.primary?.terms ?? []) {
        if (term.coefficientsByRank) {
          assert.equal(term.coefficientsByRank.length, ability.maxRank);
        }
        if (term.coefficientsByRankAndLevel) {
          assert.equal(term.coefficientsByRankAndLevel.length, ability.maxRank);
        }
      }
    }
    if (ability.simulation.status === "expression") {
      const expression = ability.simulation.expression!;
      assert.equal(ability.simulation.primary, undefined);
      assertExpressionCurves(expression.root, ability.maxRank);
      assert.equal(
        expression.requiresBuffStacks,
        JSON.stringify(expression.root).includes('"buffStacks"'),
      );
    }
  }
}

test("모든 챔피언의 세 언어 스킬 데이터와 시뮬레이션 보고서가 일치한다", async () => {
  const counts: SpellCounts = {
    active: 0, precomputed: 0, detailedPassives: 0,
    simulations: { complete: 0, expression: 0, unsupported: 0, unavailable: 0 },
  };
  for (const entry of englishIndex.champions) {
    try {
      await validateChampion(entry, counts);
    } catch (cause) {
      throw new Error(`${entry.id}: 스킬 데이터 검증 실패`, { cause });
    }
  }
  assert.equal(counts.active, englishIndex.champions.length * 4);
  assert.equal(counts.precomputed, counts.active);
  assert.equal(counts.detailedPassives, englishIndex.champions.length - allowedPassiveFallbacks.size);
  assert.equal(
    Object.values(counts.simulations).reduce((sum, count) => sum + count, 0),
    counts.active
  );
  assert.deepEqual(simulationReport.summary, {
    abilities: counts.active,
    ...counts.simulations,
  });
});

test("옛 산출물이 남아 있지 않다", async () => {
  await assert.rejects(fs.access(path.join(versionDir, "spells")));
  for (const locale of locales) {
    await assert.rejects(fs.access(path.join(versionDir, `champions-normalized-${locale}.json`)));
  }
  const championEntries = await fs.readdir(path.join(versionDir, "champions"), {
    withFileTypes: true,
  });
  assert.equal(championEntries.every((entry) => entry.isDirectory()), true);
});
