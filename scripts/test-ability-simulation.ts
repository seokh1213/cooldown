import assert from "node:assert/strict";
import { compileAbilitySimulation } from "./data-pipeline/ability-simulation";
import { evaluateAbilitySimulation } from "../src/pages/SimulationPage.damageUtils";
import type { CommunityDragonSpellData } from "../src/lib/spellTooltipParser/types";

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
  movespeed: 350,
};

const wukongSimulation = compileAbilitySimulation(wukong, 5);
assert.equal(wukongSimulation.status, "complete");
assert.deepEqual(wukongSimulation.primary?.baseByRank, [20, 45, 70, 95, 120]);
assert.deepEqual(wukongSimulation.primary?.terms, [{
  stat: "bonusAttackDamage",
  coefficientsByRank: [0.5, 0.5, 0.5, 0.5, 0.5],
}]);
assert.equal(evaluateAbilitySimulation(wukongSimulation, 5, stats), 140);

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
