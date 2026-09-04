import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodeChampionDetail, decodeChampionIndex } from "../src/data/contracts/championDataDecoder";
import type { DataManifest } from "../src/data/contracts/dataManifest";
import type { CommunityDragonSpellData } from "../src/lib/spellTooltipParser/types";

interface SpellDataFile {
  spellData: Record<string, CommunityDragonSpellData>;
  passive?: { id: string; locKeys: { keyTooltip?: string } } | null;
}

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

const corki = JSON.parse(
  await fs.readFile(path.join(versionDir, "spells/Corki.json"), "utf8")
) as SpellDataFile;
assert.deepEqual(corki.spellData.PhosphorusBomb?.DataValues?.BaseDamage?.slice(1, 6), [
  60, 105, 150, 195, 240,
]);

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

const englishIndex = decodeChampionIndex(JSON.parse(
  await fs.readFile(path.join(versionDir, "champions/en_US/index.json"), "utf8")
));
let mappedSpellCount = 0;
let precomputedSpellCount = 0;
let detailedPassiveCount = 0;

for (const entry of englishIndex.champions) {
  const spellFile = JSON.parse(
    await fs.readFile(path.join(versionDir, `spells/${entry.id}.json`), "utf8")
  ) as SpellDataFile;
  const passiveData = spellFile.spellData.P;
  assert.ok(passiveData, `${entry.id} must expose the P alias`);
  if (spellFile.passive) {
    assert.deepEqual(spellFile.spellData[spellFile.passive.id], passiveData);
    assert.ok(spellFile.passive.locKeys.keyTooltip);
  }

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
  slots.forEach((slot, index) => {
    const ability = detail.champion.abilities[slot];
    assert.ok(spellFile.spellData[ability.id] ?? spellFile.spellData[String(index)]);
    mappedSpellCount += 1;
    if (ability.source === "communitydragon") precomputedSpellCount += 1;
  });
}

assert.equal(mappedSpellCount, englishIndex.champions.length * 4);
assert.equal(precomputedSpellCount, mappedSpellCount - 9);
assert.equal(detailedPassiveCount, englishIndex.champions.length - 5);
console.log(
  `✅ Ability v2: ${precomputedSpellCount}/${mappedSpellCount} active tooltips, ` +
    `${detailedPassiveCount}/${englishIndex.champions.length} passives precomputed`
);
