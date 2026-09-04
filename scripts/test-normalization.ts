import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildNormalizedChampion } from "./data-pipeline/normalization/champion";
import { normalizeItems } from "./data-pipeline/normalization/item";
import { normalizeSummonerSpells } from "./data-pipeline/normalization/summoner";
import { StatKey } from "../src/types/combatStats";

const items = normalizeItems("en_US", {
  data: {
    "1001": { tags: ["Boots"], stats: { FlatMovementSpeedMod: 25 } },
    "3006": {
      name: "Berserker's Greaves",
      from: ["1001"],
      stats: { PercentAttackSpeedMod: 0.25 },
      maps: { "11": true },
      gold: { base: 500, total: 1100, purchasable: true },
    },
  },
});
assert.equal(items[1].tags.includes("Boots"), true);
assert.equal(items[1].availableOnMap11, true);
assert.deepEqual(items[1].stats[0], {
  stat: StatKey.ATTACK_SPEED,
  value: 0.25,
  valueType: "percent",
  source: "item",
  scope: "item-passive",
});

const summoners = normalizeSummonerSpells({
  data: {
    SummonerFlash: {
      key: "4",
      name: "Flash",
      cooldown: [300, "invalid"],
      image: { full: "SummonerFlash.png" },
      modes: ["CLASSIC", 11],
    },
  },
});
assert.deepEqual(summoners[0].cooldown, [300]);
assert.deepEqual(summoners[0].modes, ["CLASSIC"]);

const directory = await mkdtemp(path.join(os.tmpdir(), "cooldown-normalize-"));
try {
  const championPath = path.join(directory, "champion.json");
  await writeFile(
    championPath,
    JSON.stringify({
      champion: {
        name: "Test Champion",
        stats: { hp: 600, hpperlevel: 100, attackdamage: 60 },
        spells: [{ id: "TestQ", name: "Q", cooldown: [8, "invalid"] }],
        passive: { name: "Passive", description: "Passive text" },
      },
    }),
  );
  const champion = buildNormalizedChampion(
    "en_US",
    "Test",
    championPath,
    path.join(directory, "missing-cdragon.json"),
  );
  assert.equal(champion?.baseStats.health.base, 600);
  assert.deepEqual(champion?.spells.Q.cooldowns, [8]);
  assert.equal(champion?.spells.P.name, "Passive");
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log("Champion, item, and summoner normalization tests passed.");
