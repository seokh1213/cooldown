import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  decodeChampionDetail,
  decodeChampionIndex,
} from "../src/data/contracts/championDataDecoder";
import type { DataManifest } from "../src/data/contracts/dataManifest";

const locales = ["ko_KR", "en_US", "zh_CN"] as const;
const slots = ["Q", "W", "E", "R"] as const;
const allowedPassiveFallbacks = new Set([
  "Kalista",
  "Kayn",
  "Ornn",
  "TwistedFate",
  "Zilean",
]);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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
assert.match(wukongQ.bodyHtml, /사거리가 135\/145\/155\/165\/175 증가/);
assert.match(wukongQ.bodyHtml, /방어력이 10\/15\/20\/25\/30%/);
assert.deepEqual(wukongQ.rankValues[0], {
  label: "피해량",
  values: "20/45/70/95/120",
});
assert.deepEqual(wukongQ.simulation.primary?.baseByRank, [20, 45, 70, 95, 120]);
assert.equal(wukongQ.simulation.primary?.terms[0].stat, "bonusAttackDamage");

const englishIndex = decodeChampionIndex(JSON.parse(
  await fs.readFile(path.join(versionDir, "champions/en_US/index.json"), "utf8")
));
let activeAbilityCount = 0;
let precomputedSpellCount = 0;
let detailedPassiveCount = 0;
const simulationCounts = { complete: 0, unsupported: 0, unavailable: 0 };

for (const entry of englishIndex.champions) {
  let passiveLocalized = true;
  for (const locale of locales) {
    const detail = decodeChampionDetail(JSON.parse(
      await fs.readFile(
        path.join(versionDir, `champions/${locale}/${entry.id}.json`),
        "utf8"
      )
    ));
    const passive = detail.champion.abilities.P;
    assert.doesNotMatch(passive.bodyHtml, /@[^@]+@|\{\{[^}]+}}/);
    if (passive.source !== "communitydragon") passiveLocalized = false;
  }
  if (passiveLocalized) detailedPassiveCount += 1;
  else assert.ok(allowedPassiveFallbacks.has(entry.id), entry.id);

  const detail = decodeChampionDetail(JSON.parse(
    await fs.readFile(path.join(versionDir, `champions/en_US/${entry.id}.json`), "utf8")
  ));
  for (const slot of slots) {
    const ability = detail.champion.abilities[slot];
    assert.equal(ability.maxRank > 0, true, `${entry.id} ${slot} maxRank`);
    activeAbilityCount += 1;
    if (ability.source === "communitydragon") precomputedSpellCount += 1;
    simulationCounts[ability.simulation.status] += 1;
    if (ability.simulation.status === "complete") {
      assert.equal(ability.simulation.primary?.baseByRank.length, ability.maxRank);
      for (const term of ability.simulation.primary?.terms ?? []) {
        assert.equal(term.coefficientsByRank.length, ability.maxRank);
      }
    }
  }
}

assert.equal(activeAbilityCount, englishIndex.champions.length * 4);
// 모든 Q/W/E/R 이 CDragon 원문으로 렌더된다 (allowlist.missingTooltips 가 비어 있음)
assert.equal(precomputedSpellCount, activeAbilityCount);
assert.equal(detailedPassiveCount, englishIndex.champions.length - 5);
assert.equal(
  simulationCounts.complete + simulationCounts.unsupported + simulationCounts.unavailable,
  activeAbilityCount
);
assert.deepEqual(simulationReport.summary, {
  abilities: activeAbilityCount,
  ...simulationCounts,
});
await assert.rejects(fs.access(path.join(versionDir, "spells")));
for (const locale of locales) {
  await assert.rejects(fs.access(path.join(versionDir, `champions-normalized-${locale}.json`)));
}
const championEntries = await fs.readdir(path.join(versionDir, "champions"), {
  withFileTypes: true,
});
assert.equal(championEntries.every((entry) => entry.isDirectory()), true);
console.log(
  `✅ Ability v2: ${precomputedSpellCount}/${activeAbilityCount} active tooltips, ` +
    `${detailedPassiveCount}/${englishIndex.champions.length} passives, ` +
    `simulation ${JSON.stringify(simulationCounts)}`
);
