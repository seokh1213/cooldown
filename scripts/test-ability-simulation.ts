import assert from "node:assert/strict";
import { compileAbilitySimulation } from "./data-pipeline/ability-simulation";
import {
  evaluateAbilitySimulation,
  evaluateAbilitySimulationDetails,
} from "./data-pipeline/ability-simulation-evaluate";
import type { CommunityDragonSpellData } from "../src/lib/spellTooltipParser/types";
import { evaluateExpr, formatExpr } from "../src/lib/abilitySimulationExpr";

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
/*
 * 피해 감쇄·관통·아이템 반영 검사는 시뮬레이션 화면과 함께 걷어냈다.
 *
 * 그 식들을 들고 있던 것이 화면 코드였고, 화면이 없어지면서 검사할 대상도 함께
 * 사라졌다. 같은 규칙을 글로 적어 둔 백과사전 "수치 공식" 탭은 그대로 남는다.
 */

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

// --- 선형으로 접히지 않는 공식: 트리를 그대로 싣고 평가한다 ---

// 케이틀린 R 모양. (기본 + 추가공격력) × (1 + 치명타확률×계수 × (치명타피해량 − 1)).
const critScaled = compileAbilitySimulation({
  DataValues: {
    RBaseDamage: [125, 300, 475, 650],
    RADRatio: [1, 1, 1, 1],
    CriticalStrikeModifier: [0.3, 0.3, 0.3, 0.3],
  },
  mSpellCalculations: {
    RTotalDamage: {
      __type: "GameCalculation",
      mFormulaParts: [
        { __type: "NamedDataValueCalculationPart", mDataValue: "RBaseDamage" },
        {
          __type: "StatByNamedDataValueCalculationPart",
          mStat: 2,
          mStatFormula: 2,
          mDataValue: "RADRatio",
        },
      ],
      mMultiplier: {
        __type: "SumOfSubPartsCalculationPart",
        mSubparts: [
          { __type: "NumberCalculationPart", mNumber: 1 },
          {
            __type: "ProductOfSubPartsCalculationPart",
            mPart1: {
              __type: "StatByNamedDataValueCalculationPart",
              mStat: 8,
              mDataValue: "CriticalStrikeModifier",
            },
            mPart2: {
              __type: "SumOfSubPartsCalculationPart",
              mSubparts: [
                { __type: "StatByCoefficientCalculationPart", mStat: 9, mCoefficient: 1 },
                { __type: "NumberCalculationPart", mNumber: -1 },
              ],
            },
          },
        ],
      },
    },
  },
} as unknown as CommunityDragonSpellData, 3, "physical");

assert.equal(critScaled.status, "expression");
assert.equal(critScaled.primary, undefined);
assert.equal(critScaled.expression?.requiresBuffStacks, false);
assert.ok(critScaled.unsupportedPartTypes.includes("nonlinear-product"));

// (650 + 40) × (1 + 0.3 × 0.25 × 0.75) = 690 × 1.05625
assert.equal(
  Number(evaluateAbilitySimulation(critScaled, 3, stats)?.toFixed(4)),
  728.8125,
);
// 치명타 확률이 0 이면 곱셈 인수가 사라져 선형부만 남는다.
assert.equal(evaluateAbilitySimulation(critScaled, 3, { ...stats, critChance: 0 }), 690);

assert.equal(
  formatExpr(critScaled.expression!.root, {
    statLabel: (stat) => stat,
    stacksLabel: (slot) => (slot ? `{${slot} stacks}` : "{stacks}"),
  }),
  "(300/475/650 + bonusAttackDamage) × (1 + 30% critChance × (critDamage − 1))",
);
assert.equal(
  formatExpr(critScaled.expression!.root, {
    rank: 1,
    statLabel: (stat) => stat,
    stacksLabel: (slot) => (slot ? `{${slot} stacks}` : "{stacks}"),
  }),
  "(300 + bonusAttackDamage) × (1 + 30% critChance × (critDamage − 1))",
);

// 나서스 Q 모양. 버프 중첩은 스탯이 아니므로 계산기는 값을 내지 않는다.
const stackedSource = {
  DataValues: { BonusDamage: [0, 40, 60, 80, 100, 120] },
  mSpellCalculations: {
    TotalDamage: {
      __type: "GameCalculation",
      mFormulaParts: [
        { __type: "NamedDataValueCalculationPart", mDataValue: "BonusDamage" },
        { __type: "StatByCoefficientCalculationPart", mStat: 2, mCoefficient: 1 },
        {
          __type: "BuffCounterByCoefficientCalculationPart",
          mBuffName: "NasusQStacks",
          mCoefficient: 1,
        },
      ],
    },
  },
} as unknown as CommunityDragonSpellData;

const stacked = compileAbilitySimulation(stackedSource, 5, "physical", "", "Q");

assert.equal(stacked.status, "expression");
assert.equal(stacked.expression?.requiresBuffStacks, true);
// 중첩 수를 모르는 채로 0 을 넣어 조용히 틀린 값을 내지 않는다.
assert.equal(evaluateAbilitySimulation(stacked, 5, stats), null);
assert.equal(
  formatExpr(stacked.expression!.root, {
    rank: 5,
    statLabel: (stat) => stat,
    stacksLabel: (slot) => (slot ? `{${slot} stacks}` : "{stacks}"),
  }),
  "120 + totalAttackDamage + {Q stacks}",
);
// 표에 없는 스킬은 슬롯 없이 적는다. 틀린 슬롯을 지어내지 않는다.
const unmappedStacks = compileAbilitySimulation(
  stackedSource, 5, "physical",
);
assert.equal(
  formatExpr(unmappedStacks.expression!.root, {
    rank: 5,
    statLabel: (stat) => stat,
    stacksLabel: (slot) => (slot ? `{${slot} stacks}` : "{stacks}"),
  }),
  "120 + totalAttackDamage + {stacks}",
);

// 중첩 수를 주면 게임과 같은 값이 나온다: 120 + 200 + 150
assert.equal(
  evaluateExpr(stacked.expression!.root, {
    rank: 5,
    level: 18,
    stat: () => 200,
    buffStacks: 150,
  }),
  470,
);

// 선형으로 접히는 스킬은 기존 경로를 그대로 쓴다. 표현식을 싣지 않는다.
assert.equal(wukongSimulation.status, "complete");
assert.equal(wukongSimulation.expression, undefined);

console.log("✅ Ability simulation compiler and evaluator passed");
