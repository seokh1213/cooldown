import assert from "node:assert/strict";
import { extractActiveSpells } from "./data-pipeline/cdragon-active-spells";

const spellPath = "Characters/Test/Spells/TestQAbility/TestQ";
const data: Record<string, unknown> = {
  "Characters/Test/CharacterRecords/Root": { spells: [spellPath] },
  [spellPath]: {
    mSpell: {
      DataValues: [{ name: "Damage", values: [0, 10, 20] }],
      cooldownTime: [8, 8, 7],
      mana: [40, 40, 45],
      mSpellCalculations: {
        TotalDamage: {
          __type: "GameCalculation",
          mFormulaParts: [
            { __type: "NamedDataValueCalculationPart", mDataValue: "Damage" },
          ],
        },
      },
      mClientData: {
        mTooltipData: {
          mLocKeys: {
            keyName: "Spell_TestQ_Name",
            keyTooltip: "Spell_TestQ_Tooltip",
          },
        },
      },
    },
  },
};

const result = extractActiveSpells(data, "Test");
assert.equal(result.ordered.length, 1);
assert.equal(result.aliases["0"], result.aliases.TestQ);
assert.deepEqual(result.ordered[0].DataValues?.Damage, [0, 10, 20]);
assert.deepEqual(result.ordered[0].source.cooldowns, [8, 8, 7]);
assert.deepEqual(result.ordered[0].source.costs, [40, 40, 45]);
assert.equal(
  result.ordered[0].source.locKeys.keyTooltip,
  "Spell_TestQ_Tooltip"
);

console.log("✅ CDragon active spell extraction passed");
