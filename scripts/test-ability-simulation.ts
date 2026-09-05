import assert from "node:assert/strict";
import { compileAbilitySimulation } from "./data-pipeline/ability-simulation";
import {
  applyNormalizedItemsToStats,
  applyDamageMitigation,
  computeChampionStatsAtLevel,
  evaluateAbilitySimulation,
  evaluateAbilitySimulationDetails,
  resistanceMultiplier,
  effectiveResistance,
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
  bonusAttackSpeed: 0.3,
  movespeed: 350,
  critChance: 0.25,
  critDamage: 1.75,
  bonusCritDamage: 0,
  lifeSteal: 0,
  lethality: 0,
  armorPenFlat: 0,
  armorPenPercent: 0,
  magicPenFlat: 0,
  magicPenPercent: 0,
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
assert.deepEqual(evaluateAbilitySimulationDetails(wukongSimulation, 5, stats), {
  total: 140,
  base: 120,
  terms: [{
    stat: "bonusAttackDamage",
    coefficient: 0.5,
    statValue: 40,
    contribution: 20,
  }],
  targetHealthMultiplier: undefined,
});
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
  1.1077,
);

assert.equal(applyDamageMitigation(200, "physical", {
  armor: 100,
  magicResist: 0,
  damageReductionPercent: 0,
}, { ...stats, lethality: 20 }), 200 * 100 / 180);

// 백과사전 "저항력 감소와 관통" 항목과 같은 규칙이어야 한다
// 적용 저항력 = (저항력 − 고정 감소) × (1 − 감소%) × (1 − 관통%) − 고정 관통
assert.equal(effectiveResistance(100, {}), 100);
assert.equal(effectiveResistance(100, { flatPenetration: 18 }), 82);
assert.equal(Number(effectiveResistance(100, { percentPenetration: 0.3 }).toFixed(6)), 70);
assert.equal(
  Number(
    effectiveResistance(100, {
      percentPenetration: 0.3,
      flatPenetration: 18,
    }).toFixed(6),
  ),
  52,
);
// 비율이 고정보다 먼저다 (순서를 바꾸면 (100−18)×0.7 = 57.4 가 나온다)
assert.notEqual(
  effectiveResistance(100, { percentPenetration: 0.3, flatPenetration: 18 }),
  57.4,
);
// 고정 감소는 합연산이고 음수까지 내려간다
assert.equal(effectiveResistance(20, { flatReduction: 35 }), -15);
// 저항력이 0 이하로 내려가면 비율 단계를 건너뛴다
assert.equal(
  effectiveResistance(20, { flatReduction: 35, percentPenetration: 0.5 }),
  -15,
);
// 관통은 저항력을 0 밑으로 내리지 못한다
assert.equal(effectiveResistance(20, { flatPenetration: 30 }), 0);
assert.equal(
  applyDamageMitigation(200, "physical", {
    armor: 20,
    magicResist: 0,
    damageReductionPercent: 0,
  }, { ...stats, lethality: 30 }),
  200,
);
// 마법 쪽도 고정·비율 두 종류를 같은 순서로 쓴다
assert.equal(
  Number(
    applyDamageMitigation(200, "magical", {
      armor: 0,
      magicResist: 100,
      damageReductionPercent: 0,
    }, { ...stats, magicPenPercent: 0.3, magicPenFlat: 18 })?.toFixed(6),
  ),
  Number((200 * 100 / 152).toFixed(6)),
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
assert.deepEqual(unsupported.unsupportedPartTypes, ["invalid-part"]);
assert.equal(evaluateAbilitySimulation(unsupported, 5, stats), null);

const recursive = compileAbilitySimulation({
  DataValues: {
    Base: [0, 10, 20, 30, 40, 50],
    Ratio: [0, 0.5, 0.5, 0.5, 0.5, 0.5],
    Multiplier: [0, 2, 2, 2, 2, 2],
  },
  mSpellCalculations: {
    Damage: {
      __type: "GameCalculationModified",
      mModifiedGameCalculation: "InnerDamage",
      mMultiplier: { __type: "NamedDataValueCalculationPart", mDataValue: "Multiplier" },
    },
    InnerDamage: {
      __type: "GameCalculation",
      mFormulaParts: [
        { __type: "NamedDataValueCalculationPart", mDataValue: "Base" },
        {
          __type: "StatBySubPartCalculationPart",
          mStat: 2,
          mStatFormula: 2,
          mSubpart: { __type: "NamedDataValueCalculationPart", mDataValue: "Ratio" },
        },
      ],
    },
  },
} as CommunityDragonSpellData, 5, "physical");
assert.equal(recursive.status, "complete");
assert.equal(evaluateAbilitySimulation(recursive, 3, stats), 100);

const championLevel = compileAbilitySimulation({
  DataValues: { Base: [0, 10] },
  mSpellCalculations: {
    Damage: {
      __type: "GameCalculation",
      mFormulaParts: [
        { __type: "NamedDataValueCalculationPart", mDataValue: "Base" },
        {
          __type: "ByCharLevelBreakpointsCalculationPart",
          mLevel1Value: 1,
          mBreakpoints: [{ mLevel: 10, mBonusPerLevelAtAndAfter: 2 }],
        },
      ],
    },
  },
} as CommunityDragonSpellData, 1);
assert.equal(evaluateAbilitySimulation(championLevel, 1, { ...stats, level: 9 }), 11);
assert.equal(evaluateAbilitySimulation(championLevel, 1, { ...stats, level: 10 }), 13);

const percentHealth = compileAbilitySimulation({
  DataValues: { DamagePercent: [0, 0.04, 0.05] },
  mSpellCalculations: {
    Damage: {
      __type: "GameCalculation",
      mDisplayAsPercent: true,
      mFormulaParts: [
        { __type: "NamedDataValueCalculationPart", mDataValue: "DamagePercent" },
      ],
    },
  },
} as CommunityDragonSpellData, 2, "true", "Deals max Health true damage");
assert.equal(percentHealth.primary?.targetHealthScaling, "max");
assert.equal(
  evaluateAbilitySimulation(percentHealth, 2, stats, {
    currentHealth: 1200,
    maxHealth: 2000,
  }),
  100,
);

const preferred = compileAbilitySimulation({
  preferredSimulationCalculationKeys: ["ChampionDamage"],
  mSpellCalculations: {
    MonsterDamageCap: {
      __type: "GameCalculation",
      mFormulaParts: [{ __type: "NumberCalculationPart", mNumber: 9999 }],
    },
    ChampionDamage: {
      __type: "GameCalculation",
      mFormulaParts: [{ __type: "NumberCalculationPart", mNumber: 80 }],
    },
  },
} as CommunityDragonSpellData, 1, "magical");
assert.equal(evaluateAbilitySimulation(preferred, 1, stats), 80);

console.log("✅ Ability simulation compiler and evaluator passed");
