import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { structureItemDescription } from "./data-pipeline/normalization/item-description";
import { attachItemEffectDetails } from "./data-pipeline/normalization/item-effect-details";
import { itemDamageFormula } from "../src/pages/EncyclopediaPage/itemFormula";
import { decodeNormalizedItems } from "../src/data/contracts/normalizedDataDecoder";

const description =
  "<mainText><stats>공격력 <attention>20</attention><br>체력 100</stats><br><br><passive>첫 효과</passive><br>첫 설명.<br><br><active>두 번째 효과</active><br>둘째 설명.<br><rules>예외 조건</rules></mainText>";
const parsed = structureItemDescription("1", description);
assert.equal(parsed.statDescriptions.length, 2);
assert.deepEqual(
  parsed.effects.map((effect) => [effect.name, effect.kind]),
  [
    ["첫 효과", "passive"],
    ["두 번째 효과", "active"],
  ],
);
assert.equal(parsed.effects[0].description, "첫 설명.");
assert.match(parsed.effects[1].description, /예외 조건/);
assert.doesNotMatch(parsed.effects[0].description, /공격력|체력|둘째/);
assert.equal(
  structureItemDescription(
    "1",
    "<mainText><stats>이동 속도 25</stats></mainText>",
  ).effects.length,
  0,
);
assert.equal(
  structureItemDescription(
    "1",
    "<mainText>사용하면 체력을 회복합니다.</mainText>",
  ).effects[0].description,
  "사용하면 체력을 회복합니다.",
);
assert.equal(structureItemDescription("1", undefined).effects.length, 0);

const calculation = {
  mDataValues: [
    { mName: "MeleeValue", mValue: 0.09 },
    { mName: "RangedValue", mValue: 0.06 },
    { mName: "Cooldown", mValue: 15 },
  ],
  mItemCalculations: Object.fromEntries(
    ["Melee", "Ranged"].map((range) => [
      `${range}ItemCalcValue`,
      {
        __type: "GameCalculation",
        mDisplayAsPercent: true,
        mFormulaParts: [
          {
            __type: "NamedDataValueCalculationPart",
            mDataValue: `${range}Value`,
          },
        ],
      },
    ]),
  ),
};
const bork = attachItemEffectDetails({
  id: "3153",
  effects: parsed.effects,
  damage: [],
  calculation,
});
assert.deepEqual(bork[0].healthDamage, {
  damageType: "physical",
  health: "current",
  melee: 0.09,
  ranged: 0.06,
});
assert.equal(bork[1].cooldownSeconds, 15);
assert.equal(parsed.effects[0].healthDamage, undefined);
assert.equal(
  attachItemEffectDetails({
    id: "3153",
    effects: parsed.effects,
    damage: [],
    calculation: { mDataValues: calculation.mDataValues },
  })[0].healthDamage,
  undefined,
);

const release = JSON.parse(readFileSync("public/data/version.json", "utf8"));
for (const locale of ["ko_KR", "en_US", "zh_CN"]) {
  const data = decodeNormalizedItems(
    JSON.parse(
      readFileSync(
        `public/data/${release.patchVersion}/items-normalized-${locale}.json`,
        "utf8",
      ),
    ),
  );
  const sheen = data.items.find((item) => item.id === "3057")!;
  if (locale === "ko_KR") {
    const malformed = (changes: Record<string, unknown>) => ({ ...data, items: [{ ...sheen, effects: [{ ...sheen.effects[0], ...changes }] }] });
    assert.throws(() => decodeNormalizedItems(malformed({ cooldownSeconds: "1.5" })), /cooldown/);
    assert.throws(() => decodeNormalizedItems(malformed({ healthDamage: { health: "current", melee: "9%", ranged: 0.06 } })), /health damage/);
    assert.throws(() => decodeNormalizedItems(malformed({ damage: { ...sheen.effects[0].damage, scalings: [{ stat: "unknown", coefficient: 1 }] } })), /scalings/);
    assert.throws(() => decodeNormalizedItems(malformed({ damage: { ...sheen.effects[0].damage, conditions: [null] } })), /conditions/);
  }
  assert.ok(sheen.statDescriptions?.length, `${locale}: missing item stats`);
  assert.equal(sheen.effects[0].damage?.scalings?.[0].coefficient, 1);
  assert.equal(sheen.effects[0].cooldownSeconds, 1.5);
  const formula = itemDamageFormula(
    sheen.effects[0].damage!,
    {
      baseAttackDamage: "기본 공격력",
      attackDamage: "공격력",
      abilityPower: "주문력",
      targetMaxHealth: "대상 최대 체력",
    },
    "ko_KR",
  );
  assert.equal(formula, "기본 공격력 × 100%");
  const blade = data.items.find((item) => item.id === "3153")!;
  assert.ok(blade.effects[0].healthDamage);
  assert.ok(blade.effects[1].cooldownSeconds);
}
console.log(
  "✅ Structured item descriptions and source-backed formulas passed",
);
