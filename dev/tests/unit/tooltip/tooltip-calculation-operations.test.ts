import assert from "node:assert/strict";
import { test } from "node:test";
import type { CommunityDragonSpellData } from "../../../../src/domain/game/tooltip/contracts";
import { parseSpellTooltipWithDiagnostics } from "../../../../src/domain/game/tooltip/parser";
import type { ChampionSpell } from "../../../../src/domain/game/types";

const spell: ChampionSpell = { id: "Test", maxrank: 3, cooldown: [] };
const numberPart = (value: number) => ({ __type: "NumberCalculationPart", mNumber: value });
const referencePart = (key: string) => ({ __type: "SpellCalculationSubPart", mSpellCalculationKey: key });

function data(calculations: Record<string, unknown>, values = {}): CommunityDragonSpellData {
  return { mSpellCalculations: calculations, DataValues: values } as CommunityDragonSpellData;
}

function render(source: CommunityDragonSpellData, token: string) {
  return parseSpellTooltipWithDiagnostics(`{{ ${token} }}`, spell, source, "en_US");
}

function rankAndLevelSource(): CommunityDragonSpellData {
  return data({
    Inner: {
      __type: "GameCalculation",
      mFormulaParts: [
        { __type: "NamedDataValueCalculationPart", mDataValue: "Base" },
        { __type: "ByCharLevelInterpolationCalculationPart", mStartValue: 10, mEndValue: 100 },
      ],
    },
    Outer: { __type: "GameCalculation", mFormulaParts: [referencePart("Inner")] },
  }, { Base: [0, 50, 80, 110] });
}

for (const [operator, expected] of [["*2", "200"], ["+50", "150"], ["-30", "70"], ["/2", "50"], ["*0", "0"]]) {
  test(`계산식 토큰의 ${operator} 연산을 적용한다`, () => {
    const source = data({ Damage: { __type: "GameCalculation", mFormulaParts: [numberPart(100)] } });
    const result = render(source, `Damage${operator}`);
    assert.equal(result.html, expected);
    assert.deepEqual(result.unresolvedTokens, []);
  });
}

test("계산식 토큰의 연산은 기본값과 스탯 계수를 함께 바꾼다", () => {
  const source = data({ Damage: {
    __type: "GameCalculation",
    mFormulaParts: [
      { __type: "NamedDataValueCalculationPart", mDataValue: "Base" },
      { __type: "StatByCoefficientCalculationPart", mCoefficient: 0.5 },
    ],
  } }, { Base: [0, 10, 20, 30] });
  assert.equal(render(source, "Damage*2").html, "(20/40/60 + ([[si:scaleap]]100% Ability Power))");
});

test("계산식 토큰의 0 나누기는 해결하지 못한 값으로 남긴다", () => {
  const source = data({ Damage: { __type: "GameCalculation", mFormulaParts: [numberPart(100)] } });
  const result = render(source, "Damage/0");
  assert.equal(result.html, "?");
  assert.deepEqual(result.unresolvedTokens, ["Damage/0"]);
});

test("계산식 토큰의 배율을 레벨 상세 수치에도 적용한다", () => {
  const source = data({ Damage: {
    __type: "GameCalculation",
    mFormulaParts: [{ __type: "ByCharLevelInterpolationCalculationPart", mStartValue: 10, mEndValue: 100 }],
  } });
  const result = render(source, "Damage*2");
  assert.equal(result.html, "(20 ~ 200[[si:scalelevel]])");
  assert.deepEqual(result.levelValues.map((entry) => [entry.values[0], entry.values[17]]), [[20, 200]]);
});

test("참조한 계산식의 랭크 값과 별도 레벨 범위를 모두 보존한다", () => {
  const source = rankAndLevelSource();
  const inner = render(source, "Inner");
  const outer = render(source, "Outer");
  assert.equal(outer.html, inner.html);
  assert.deepEqual(outer.levelValues, inner.levelValues);
  assert.deepEqual(outer.droppedCalculations, []);
});

function multipliedSource(): CommunityDragonSpellData {
  return data({
    Inner: {
      __type: "GameCalculation",
      mFormulaParts: [numberPart(100)],
      mMultiplier: {
        __type: "SumOfSubPartsCalculationPart",
        mSubparts: [numberPart(1), { __type: "StatByCoefficientCalculationPart", mStat: 4, mStatFormula: 2, mCoefficient: 0.3 }],
      },
    },
    Outer: { __type: "GameCalculation", mFormulaParts: [referencePart("Inner")] },
  });
}

test("참조한 계산식의 스탯 배율을 보존한다", () => {
  const source = multipliedSource();
  assert.equal(render(source, "Outer").html, render(source, "Inner").html);
  assert.ok(render(source, "Outer").html.includes("30% bonus Attack Speed"));
});

test("스탯 배율이 붙은 계산식에 상수를 더하면 배율 바깥에 더한다", () => {
  const result = render(multipliedSource(), "Outer+50");
  assert.equal(result.html, "(50 + 100 × (1 + [[si:scaleas]]30% bonus Attack Speed))");
});

test("중첩 합에서도 참조한 계산식의 별도 레벨 범위를 보존한다", () => {
  const source = rankAndLevelSource();
  source.mSpellCalculations!.Outer = {
    __type: "GameCalculation",
    mFormulaParts: [{ __type: "SumOfSubPartsCalculationPart", mSubparts: [numberPart(5), referencePart("Inner")] }],
  };
  const result = render(source, "Outer");
  assert.equal(result.html, "(5 + (50/80/110 + (10 ~ 100[[si:scalelevel]])))");
  assert.equal(result.levelValues.length, 1);
});

test("복합 계산식 참조에 상수 배율을 붙이면 레벨 상세 수치도 바꾼다", () => {
  const source = rankAndLevelSource();
  source.mSpellCalculations!.Outer = {
    __type: "GameCalculation",
    mFormulaParts: [referencePart("Inner")],
    mMultiplier: { mNumber: 2 },
  };
  const result = render(source, "Outer");
  assert.equal(result.html, "(100/160/220 + (20 ~ 200[[si:scalelevel]]))");
  assert.deepEqual(result.levelValues.map((entry) => [entry.values[0], entry.values[17]]), [[20, 200]]);
});

test("참조한 복합 계산식을 배율로 써도 전체를 보존한다", () => {
  const source = multipliedSource();
  source.mSpellCalculations!.Outer = {
    __type: "GameCalculation",
    mFormulaParts: [numberPart(2)],
    mMultiplier: referencePart("Inner"),
  };
  const result = render(source, "Outer");
  assert.equal(result.html, "2 × (100 × (1 + [[si:scaleas]]30% bonus Attack Speed))");
  assert.deepEqual(result.droppedCalculations, []);
});

test("참조한 계산식을 곱의 피연산자로 써도 레벨 범위를 보존한다", () => {
  const source = rankAndLevelSource();
  source.mSpellCalculations!.Outer = {
    __type: "GameCalculation",
    mFormulaParts: [{
      __type: "ProductOfSubPartsCalculationPart",
      mPart1: referencePart("Inner"),
      mPart2: numberPart(2),
    }],
  };
  const result = render(source, "Outer");
  assert.equal(result.html, "(100/160/220 + (20 ~ 200[[si:scalelevel]]))");
  assert.deepEqual(result.levelValues.map((entry) => [entry.values[0], entry.values[17]]), [[20, 200]]);
});

test("복합 참조를 제한값으로 평가할 수 없으면 누락 사유를 남긴다", () => {
  const source = rankAndLevelSource();
  source.mSpellCalculations!.Outer = {
    __type: "GameCalculation",
    mFormulaParts: [numberPart(5), {
      __type: "ClampSubPartsCalculationPart",
      mFloor: 0,
      mCeiling: 100,
      mSubparts: [referencePart("Inner")],
    }],
  };
  assert.ok(render(source, "Outer").droppedCalculations.some((entry) =>
    entry.reason === "unsupported-part" && entry.detail === "ClampSubPartsCalculationPart"));
});

test("복합 참조를 스탯 계수로 평가할 수 없으면 누락 사유를 남긴다", () => {
  const source = rankAndLevelSource();
  source.mSpellCalculations!.Outer = {
    __type: "GameCalculation",
    mFormulaParts: [numberPart(5), {
      __type: "StatBySubPartCalculationPart",
      mSubpart: referencePart("Inner"),
    }],
  };
  assert.ok(render(source, "Outer").droppedCalculations.some((entry) =>
    entry.reason === "unsupported-part" && entry.detail === "StatBySubPartCalculationPart"));
});

test("알 수 없는 스탯은 템플릿 연산 후에도 확정된 0으로 표시하지 않는다", () => {
  const source = data({ Damage: {
    __type: "GameCalculation",
    mFormulaParts: [{ __type: "StatByCoefficientCalculationPart", mStat: 999, mCoefficient: 1 }],
  } });
  const result = render(source, "Damage+0");
  assert.equal(result.html, "?");
  assert.deepEqual(result.unresolvedTokens, ["Damage+0"]);
});

test("퍼센트 계산식에 0을 곱해도 퍼센트 단위를 유지한다", () => {
  const source = data({ Damage: {
    __type: "GameCalculation",
    mDisplayAsPercent: true,
    mFormulaParts: [numberPart(0.1)],
  } });
  assert.equal(render(source, "Damage*0").html, "0%");
});
