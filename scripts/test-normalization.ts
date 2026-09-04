import assert from "node:assert/strict";
import { normalizeChampion } from "./data-pipeline/normalization/champion";
import { normalizeItems } from "./data-pipeline/normalization/item";
import { normalizeSummonerSpells } from "./data-pipeline/normalization/summoner";
import { normalizeRunesAndStatShards } from "./data-pipeline/normalization/rune";
import { compileItemDamageEffects } from "./data-pipeline/normalization/item-damage-effects";
import { StatKey } from "../src/types/combatStats";
import { fetchCDragonRuneStatShards } from "./data-pipeline/sources/cdragon-runes";
import { mergeCDragonItems } from "./data-pipeline/sources/cdragon-items";
import { htmlToPlainText } from "../src/lib/htmlText";

assert.equal(
  htmlToPlainText("투명 <font color='#fff'>상태</font><br><br>다음 줄 &amp; 값"),
  "투명 상태 다음 줄 & 값",
);

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
    "3115": {
      name: "Nashor's Tooth",
      cdragonCalculation: {
        mDataValues: [
          { mName: "NashorsBaseValue", mValue: 15 },
          { mName: "NashorsAPValue", mValue: 0.15 },
        ],
        mItemCalculations: {
          TotalOnHitDamage: {
            mFormulaParts: [
              { mDataValue: "NashorsBaseValue", __type: "NamedDataValueCalculationPart" },
              { mDataValue: "NashorsAPValue", __type: "StatByNamedDataValueCalculationPart" },
            ],
          },
        },
      },
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
assert.equal(items[2].damageEffects![0].valuesByLevel[0], 15);
assert.deepEqual(items[2].damageEffects![0].scalings, [
  { stat: "abilityPower", coefficient: 0.15 },
]);
assert.deepEqual(compileItemDamageEffects("3057", {
  mItemCalculations: {
    SpellbladeDamage: {
      mFormulaParts: [{
        mStat: 2,
        mStatFormula: 1,
        mCoefficient: 1,
        __type: "StatByCoefficientCalculationPart",
      }],
    },
  },
})[0].scalings, [{ stat: "baseAttackDamage", coefficient: 1 }]);
assert.equal(compileItemDamageEffects("6653", {
  mDataValues: [
    { mName: "BurnDuration", mValue: 3 },
    { mName: "BurnPercentHealthDamage", mValue: 0.02 },
  ],
})[0].scalings?.[0].coefficient, 0.06);

const summoners = normalizeSummonerSpells({
  data: {
    SummonerFlash: {
      key: "4",
      name: "Flash",
      cooldown: [300, "invalid"],
      image: { full: "SummonerFlash.png" },
      modes: ["CLASSIC", 11],
    },
    SummonerDot: {
      key: "14",
      name: "Ignite",
      tooltip: "{{ tooltiptruedamagecalculation }} / {{ grievousamount*100 }}%",
      modes: ["CLASSIC"],
    },
  },
});
assert.deepEqual(summoners[0].cooldown, [300]);
assert.deepEqual(summoners[0].modes, ["CLASSIC"]);
assert.deepEqual(summoners[0].damageEffects, []);
assert.equal(summoners[1].tooltip, "90 - 430 / 40%");
assert.deepEqual(summoners[1].damageEffects[0].valuesByLevel, [
  90, 110, 130, 150, 170, 190, 210, 230, 250,
  270, 290, 310, 330, 350, 370, 390, 410, 430,
]);

const normalizedRunes = normalizeRunesAndStatShards("en_US", [{
  id: 8100,
  slots: [{ runes: [
    { id: 8126, name: "Cheap Shot" },
    { id: 8237, name: "Scorch" },
  ] }],
}], null, null).runes;
assert.equal(normalizedRunes[0].damageEffects[0].valuesByLevel[0], 10);
assert.equal(normalizedRunes[0].damageEffects[0].valuesByLevel[17], 45);
assert.equal(normalizedRunes[1].damageEffects[0].damageType, "magical");

const runeRequests: string[] = [];
const shards = await fetchCDragonRuneStatShards(
  "ko_KR",
  "16.17",
  async (input) => {
    const url = String(input);
    runeRequests.push(url);
    const body = url.endsWith("perkstyles.json")
      ? [{ id: 5000, name: "Stat", slots: [{ type: "kStatMod", perks: [5001] }] }]
      : [{ id: 5001, name: "Health", iconPath: "health.png", shortDesc: "+65 Health" }];
    return new Response(JSON.stringify(body), { status: 200 });
  },
);
assert.equal(shards.groups[0].rows[0].perks[0].id, 5001);
assert.equal(runeRequests.length, 2);
assert.equal(runeRequests.every((url) => url.includes("/16.17/")), true);
assert.equal(runeRequests.some((url) => url.includes("latest")), false);

const mergedItems = mergeCDragonItems(
  { data: { "1001": { name: "Boots", inStore: false } } },
  [{ id: 1001, name: "Boots", description: "", inStore: true }],
);
assert.deepEqual(
  (mergedItems.data as Record<string, Record<string, unknown>>)["1001"].inStore,
  true,
);

const champion = normalizeChampion({
  locale: "en_US",
  championId: "Test",
  champion: {
    id: "Test",
    key: "1",
    title: "the Test",
    name: "Test Champion",
    stats: { hp: 600, hpperlevel: 100, attackdamage: 60 },
    spells: [
      { id: "TestQ", name: "Q", maxrank: 5, cooldown: [8, "invalid"] },
    ],
    passive: {
      name: "Passive",
      description: "Passive text",
      image: { full: "Passive.png" },
    },
  },
  spellData: {},
});
assert.equal(champion.baseStats.health.base, 600);
assert.deepEqual(champion.spells.Q.cooldowns, [8]);
assert.equal(champion.spells.P.name, "Passive");

console.log("Champion, item, and summoner normalization tests passed.");
