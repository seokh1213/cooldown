import assert from "node:assert/strict";
import {
  extractPassiveSpell,
  localizePassiveTooltip,
} from "./passive-tooltip-data";

const passivePath =
  "Characters/MonkeyKing/Spells/MonkeyKingPassiveAbility/MonkeyKingPassive";
const bin = {
  "Characters/MonkeyKing/CharacterRecords/Root": {
    mCharacterPassiveSpell: passivePath,
  },
  [passivePath]: {
    mScriptName: "MonkeyKingPassive",
    mSpell: {
      DataValues: [
        { name: "HealthPercentPer5", values: Array(7).fill(0.0035) },
        { name: "StackDuration", values: Array(7).fill(5) },
        { name: "MaxStacks", values: Array(7).fill(5) },
      ],
      mSpellCalculations: {
        BonusArmor: {
          __type: "GameCalculation",
          mFormulaParts: [
            {
              __type: "ByCharLevelInterpolationCalculationPart",
              mStartValue: 6,
              mEndValue: 10,
            },
          ],
        },
      },
      mClientData: {
        mTooltipData: {
          mLocKeys: {
            keyName: "Spell_MonkeyKingPassive_Name",
            keyTooltip: "Spell_MonkeyKingPassive_Tooltip",
          },
        },
      },
    },
  },
};

const templates = {
  ko_KR:
    "오공이 <scaleArmor>@BonusArmor@의 방어력</scaleArmor>을 얻고 5초마다 최대 체력의 @HealthPercentPer5*100@%를 회복합니다. 최대 @MaxStacks@회 중첩됩니다.",
  en_US:
    "Wukong gains <scaleArmor>@BonusArmor@ Armor</scaleArmor> and regenerates @HealthPercentPer5*100@% max Health per 5 seconds. Stacks up to @MaxStacks@ times.",
  zh_CN:
    "孙悟空获得<scaleArmor>@BonusArmor@护甲</scaleArmor>并且每5秒回复他@HealthPercentPer5*100@%的最大生命值，最多可叠加@MaxStacks@层。",
} as const;

const passive = extractPassiveSpell(bin, "MonkeyKing");
assert.ok(passive);
assert.equal(passive.id, "MonkeyKingPassive");
assert.equal(
  passive.locKeys.keyTooltip,
  "Spell_MonkeyKingPassive_Tooltip"
);
assert.deepEqual(passive.spellData.DataValues?.MaxStacks, Array(7).fill(5));

for (const [locale, template] of Object.entries(templates)) {
  const localized = localizePassiveTooltip(
    passive,
    {
      entries: {
        spell_monkeykingpassive_name: "Wukong Passive",
        spell_monkeykingpassive_tooltip: template,
      },
    },
    locale as keyof typeof templates
  );
  assert.match(localized.tooltip ?? "", /\(6 ~ 10\)/);
  assert.match(localized.tooltip ?? "", /0\.35%/);
  assert.match(localized.tooltip ?? "", /5/);
  assert.doesNotMatch(localized.tooltip ?? "", /[@{}]/);
}

const modePassive = extractPassiveSpell({
  "Characters/Test/CharacterRecords/Root": {
    mCharacterPassiveSpell: "Characters/Test/Spells/TestPassive",
  },
  "Characters/Test/Spells/TestPassive": {
    mScriptName: "TestPassive",
    mSpell: {
      DataValues: [{ name: "GameModeInteger", values: Array(7).fill(1) }],
      mClientData: { mTooltipData: { mLocKeys: { keyTooltip: "Test_Tooltip" } } },
    },
  },
}, "Test");
assert.ok(modePassive);
assert.equal(localizePassiveTooltip(modePassive, {
  entries: {
    test_tooltip: "{{Test_Tooltip_@GameModeInteger@}}",
    test_tooltip_1: "Summoner's Rift passive",
  },
}, "en_US").tooltip, "Summoner's Rift passive");

console.log("✅ Passive SpellObject localization pipeline passed");
