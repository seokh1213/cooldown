import assert from "node:assert/strict";
import { compileAbilitySimulation } from "./data-pipeline/ability-simulation";
import {
  applyNormalizedItemsToStats,
  applyDamageMitigation,
  computeChampionStatsAtLevel,
  evaluateAbilitySimulation,
  resistanceMultiplier,
} from "../src/pages/SimulationPage.damageUtils";
import type { CommunityDragonSpellData } from "../src/lib/spellTooltipParser/types";
import type { Champion } from "../src/types";
import type { NormalizedItem } from "../src/types/combatNormalized";
import { StatKey } from "../src/types/combatStats";

const wukong = {
  DataValues: {
    BaseDamage: [-5, 20, 45, 70, 95, 120, 145],
    ADRatio: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
  },
  mSpellCalculations: {
    TotalDamage: {
      __type: "GameCalculation",
      mFormulaParts: [
        { __type: "NamedDataValueCalculationPart", mDataValue: "BaseDamage" },
        {
          __type: "StatByNamedDataValueCalculationPart",
          mStat: 2,
          mStatFormula: 2,
          mDataValue: "ADRatio",
        },
      ],
    },
  },
} as CommunityDragonSpellData;

const ezreal = {
  DataValues: {
    BaseDamage: [-5, 20, 45, 70, 95, 120, 145],
    BaseDamageADRatio: [1.3, 1.3, 1.3, 1.3, 1.3, 1.3, 1.3],
    BaseDamageAPRatio: [0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4],
  },
  mSpellCalculations: {
    Damage: {
      __type: "GameCalculation",
      mFormulaParts: [
        { __type: "NamedDataValueCalculationPart", mDataValue: "BaseDamage" },
        {
          __type: "StatByNamedDataValueCalculationPart",
          mStat: 2,
          mDataValue: "BaseDamageADRatio",
        },
        {
          __type: "StatByNamedDataValueCalculationPart",
          mDataValue: "BaseDamageAPRatio",
        },
      ],
    },
  },
} as CommunityDragonSpellData;

const stats = {
  level: 18,
  health: 2500,
  bonusHealth: 500,
  mana: 1000,
  bonusMana: 300,
  armor: 100,
  bonusArmor: 30,
  magicResist: 80,
  bonusMagicResist: 20,
  attackDamage: 200,
  baseAttackDamage: 160,
  bonusAttackDamage: 40,
  abilityPower: 100,
  attackSpeed: 0.8,
  movespeed: 350,
};

const wukongSimulation = compileAbilitySimulation(wukong, 5, "physical");
assert.equal(wukongSimulation.status, "complete");
assert.equal(wukongSimulation.primary?.damageType, "physical");
assert.deepEqual(wukongSimulation.primary?.baseByRank, [20, 45, 70, 95, 120]);
assert.deepEqual(wukongSimulation.primary?.terms, [{
  stat: "bonusAttackDamage",
  coefficientsByRank: [0.5, 0.5, 0.5, 0.5, 0.5],
}]);
assert.equal(evaluateAbilitySimulation(wukongSimulation, 5, stats), 140);
assert.equal(resistanceMultiplier(100), 0.5);
assert.equal(resistanceMultiplier(-100), 1.5);
assert.equal(applyDamageMitigation(200, "physical", {
  armor: 100,
  magicResist: 0,
  damageReductionPercent: 20,
}), 80);
assert.equal(applyDamageMitigation(200, "true", {
  armor: 100,
  magicResist: 100,
  damageReductionPercent: 20,
}), 200);
assert.equal(applyDamageMitigation(200, "unknown", {
  armor: 0,
  magicResist: 0,
  damageReductionPercent: 0,
}), null);

const levelTwoStats = computeChampionStatsAtLevel({
  id: "Test",
  key: "1",
  name: "Test",
  title: "Test",
  stats: {
    attackdamage: 100,
    attackdamageperlevel: 10,
    attackspeed: 0.7,
    attackspeedperlevel: 2,
  },
} satisfies Champion, 2);
assert.equal(levelTwoStats?.attackDamage, 107.2);
assert.equal(Number(levelTwoStats?.attackSpeed.toFixed(4)), 0.7101);

const attackSpeedItems = [{
  stats: [0.3, 0.2].map((value) => ({
    stat: StatKey.ATTACK_SPEED,
    value,
    valueType: "percent" as const,
    source: "item" as const,
  })),
}] as NormalizedItem[];
assert.equal(
  Number(applyNormalizedItemsToStats(stats, attackSpeedItems).attackSpeed.toFixed(4)),
  1.2,
);

const ezrealSimulation = compileAbilitySimulation(ezreal, 5);
assert.equal(ezrealSimulation.status, "complete");
assert.deepEqual(
  ezrealSimulation.primary?.terms.map((term) => term.stat),
  ["totalAttackDamage", "abilityPower"]
);
assert.equal(evaluateAbilitySimulation(ezrealSimulation, 5, stats), 420);

const unsupported = compileAbilitySimulation({
  mSpellCalculations: {
    Damage: {
      __type: "GameCalculation",
      mFormulaParts: [{ __type: "ProductOfSubPartsCalculationPart" }],
    },
  },
} as CommunityDragonSpellData, 5);
assert.equal(unsupported.status, "unsupported");
assert.deepEqual(unsupported.unsupportedPartTypes, ["ProductOfSubPartsCalculationPart"]);
assert.equal(evaluateAbilitySimulation(unsupported, 5, stats), null);

console.log("✅ Ability simulation compiler and evaluator passed");
