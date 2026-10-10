import assert from "node:assert/strict";
import { test } from "node:test";
import { extractActiveSpells } from "../../../scripts/data-pipeline/sources/cdragon-active-spells";

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

test("CDragon 활성 스킬 추출", () => {
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
});

test("1랭크 레벨: 배움 조건 목록이 없으면 게임 기본값(R 6), 있으면 첫 칸 조건을 읽는다", () => {
  const slots = ["Q", "W", "E", "R"].map((slot) => `Characters/Test/Spells/Test${slot}`);
  const spells = Object.fromEntries(slots.map((path) => [path, { mSpell: {} }]));
  const rankUp = (level?: number) => ({
    __type: "SpellRankUpRequirements",
    mRequirements: level === undefined
      ? []
      : [{ __type: "HasSkillPointRequirement" }, { __type: "CharacterLevelRequirement", mLevel: level }],
  });
  const levelUp = (...ranks: ReturnType<typeof rankUp>[]) => ({ __type: "SpellLevelUpInfo", mRequirements: ranks });

  const byDefault = extractActiveSpells(
    { "Characters/Test/CharacterRecords/Root": { spells: slots }, ...spells },
    "Test",
  );
  assert.deepEqual(byDefault.ordered.map((spell) => spell.firstRankLevel), [1, 1, 1, 6]);

  // 엘리스처럼 R 첫 칸이 비어 있으면 시작부터 1랭크다. 필드 이름은 해시라 원소 __type 으로 찾는다
  const custom = extractActiveSpells(
    {
      "Characters/Test/CharacterRecords/Root": {
        spells: slots,
        "{1abb82c0}": {
          List: [
            levelUp(rankUp(2), rankUp(3)),
            levelUp(rankUp(), rankUp(3)),
            levelUp(rankUp(1), rankUp(3)),
            levelUp(rankUp(), rankUp(6)),
          ],
        },
      },
      ...spells,
    },
    "Test",
  );
  assert.deepEqual(custom.ordered.map((spell) => spell.firstRankLevel), [2, 1, 1, 1]);
});
