/** 챔피언 레벨 구간·성장 곡선·정밀도 계산의 회귀 검사. */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseSpellTooltip,
  parseSpellTooltipWithDiagnostics,
} from "../../src/lib/spellTooltipParser/parser";
import type { ChampionSpell } from "../../src/types";
import type { AbilityLevelValues } from "../../src/data/contracts/championData";
import type { CommunityDragonSpellData } from "../../src/lib/spellTooltipParser/types";
import { evaluateSpellCalculation } from "../../src/lib/spellTooltipParser/spellCalculationEvaluator";
import { formatCalculationResult } from "../../src/lib/spellTooltipParser/calculationResultFormatter";
import { interpolationLevelValues } from "../../src/lib/championLevel";


// 랭크 벡터와 레벨 범위(1~20레벨 값)가 섞인 계산식 (CI 로그의 "Vector length mismatch")
function renderCalculation(
  key: string,
  maxrank: number,
  data: CommunityDragonSpellData,
): string | null {
  const spell = { id: "Test", maxrank } as ChampionSpell;
  return formatCalculationResult(
    evaluateSpellCalculation({ key, spell, data, lang: "en_US" }),
    "en_US",
  );
}

/** 계산식을 적으며 넘긴 레벨별 값 */
function reportedLevelValues(
  key: string,
  maxrank: number,
  data: CommunityDragonSpellData,
): AbilityLevelValues[] {
  const spell = { id: "Test", maxrank } as ChampionSpell;
  const entries: AbilityLevelValues[] = [];
  formatCalculationResult(
    evaluateSpellCalculation({ key, spell, data, lang: "en_US" }),
    "en_US",
    (entry) => entries.push(entry),
  );
  return entries;
}

const levelRangeOnly = (key: string, calc: unknown): CommunityDragonSpellData =>
  ({ mSpellCalculations: { [key]: calc } }) as unknown as CommunityDragonSpellData;

test("mInitialBonusPerLevel 은 첫 브레이크포인트 전까지 레벨당 더한다 (아칼리 P)", () => {
  const data = levelRangeOnly("Damage", {
    __type: "GameCalculation",
    mFormulaParts: [
      {
        __type: "ByCharLevelBreakpointsCalculationPart",
        mLevel1Value: 35,
        mInitialBonusPerLevel: 3,
        mBreakpoints: [
          { __type: "Breakpoint", mLevel: 8, mBonusPerLevelAtAndAfter: 9 },
          { __type: "Breakpoint", mLevel: 14, mBonusPerLevelAtAndAfter: 15 },
        ],
      },
      { __type: "StatByCoefficientCalculationPart", mCoefficient: 0.55 },
    ],
  });
  // 위키: 35 – 182
  assert.equal(
    renderCalculation("Damage", 1, data),
    "((35 ~ 182[[si:scalelevel]]) + ([[si:scaleap]]55% Ability Power))",
  );
});

test("이름 브레이크포인트 파트의 레벨당 증가량 필드를 읽고, 없는 이름은 0 으로 본다 (벨베스 P)", () => {
  const data = {
    DataValues: {
      Level1: [0.1, 0.1],
      Initial: [0.05, 0.05],
      Level6: [0.1, 0.1],
      Level11: [0.15, 0.15],
    },
    mSpellCalculations: {
      AttackSpeedPerStack: {
        __type: "GameCalculation",
        mPrecision: 2,
        mFormulaParts: [
          {
            __type: "{4ce08984}",
            "{91d404a5}": "Level1",
            "{bbd778a2}": "Initial",
            "{9823b29a}": [
              { __type: "{0333530c}", level: 6, "{ae9b464d}": "AdditionalBonusAtThisLevel", "{b0d8b2ac}": "Level6" },
              { __type: "{0333530c}", level: 11, "{ae9b464d}": "AdditionalBonusAtThisLevel", "{b0d8b2ac}": "Level11" },
            ],
          },
        ],
      },
    },
  } as unknown as CommunityDragonSpellData;
  const spell = { id: "BelvethPassive", maxrank: 1, cooldown: [] } as ChampionSpell;
  const rendered = parseSpellTooltipWithDiagnostics(
    "{{ AttackSpeedPerStack }}",
    spell,
    data,
    "en_US",
  );
  // 위키: 0.1% – 2%. mPrecision 2 라 끝자리 0 까지 적는다. 없는 이름·__type 해시는 값 누락 진단으로 잡지 않는다.
  assert.equal(rendered.html, "(0.10 ~ 2.00[[si:scalelevel]])");
  assert.deepEqual(rendered.droppedCalculations, []);
});

test("레벨 범위 뒤에 붙은 % 는 지우지 않는다 (세나 P)", () => {
  const data = levelRangeOnly("BonusCurrentHealthDamage", {
    __type: "GameCalculation",
    mFormulaParts: [
      {
        __type: "ByCharLevelBreakpointsCalculationPart",
        mLevel1Value: 1,
        mInitialBonusPerLevel: 1,
        mBreakpoints: [{ __type: "Breakpoint", mLevel: 11 }],
      },
    ],
  });
  const spell = { id: "SennaPassive", maxrank: 1, cooldown: [] } as ChampionSpell;
  assert.equal(
    parseSpellTooltip("deals {{ BonusCurrentHealthDamage }}% current Health", spell, data, "en_US"),
    "deals (1 ~ 10[[si:scalelevel]])% current Health",
  );
});

// 스킬 수치는 18레벨 뒤로 오르지 않는다(탑 라인 역할 퀘스트로 20레벨이 되어도). 레벨 범위의 끝값은 18레벨 값이다.
function levelCalculation(parts: unknown[], extra: Record<string, unknown> = {}): CommunityDragonSpellData {
  return {
    mSpellCalculations: { Calc: { __type: "GameCalculation", mFormulaParts: parts, ...extra } },
  } as unknown as CommunityDragonSpellData;
}

test("19레벨 브레이크포인트는 18레벨 끝값에 들어가지 않는다 (라칸 P 재사용 대기시간)", () => {
  const data = levelCalculation([{
    __type: "ByCharLevelBreakpointsCalculationPart",
    mLevel1Value: 40,
    mInitialBonusPerLevel: -1.5,
    mBreakpoints: [{ __type: "Breakpoint", mLevel: 19, mBonusPerLevelAtAndAfter: -0.875 }],
  }], { mPrecision: 1, mSimpleTooltipCalculationDisplay: 6 });
  // 위키: 40 to 14.5. mPrecision 1 이라 끝자리 0 까지 적는다(인게임 나르 P 공격 속도 (5.5% ~ 99.0%) 와 같은 규칙)
  assert.equal(renderCalculation("Calc", 1, data), "(40.0 ~ 14.5[[si:scalelevel]])");
});

test("브레이크포인트마다 레벨당 증가량이 바뀐다 (조이 Q 레벨 항)", () => {
  const data = levelCalculation([{
    __type: "ByCharLevelBreakpointsCalculationPart",
    mLevel1Value: 2,
    mInitialBonusPerLevel: 2,
    mBreakpoints: [
      { __type: "Breakpoint", mLevel: 10, mBonusPerLevelAtAndAfter: 3 },
      { __type: "Breakpoint", mLevel: 14, mBonusPerLevelAtAndAfter: 4 },
    ],
  }], { mSimpleTooltipCalculationDisplay: 6 });
  // 2레벨부터 +2, 10레벨부터 +3, 14레벨부터 +4 → 18레벨 50
  assert.equal(renderCalculation("Calc", 1, data), "(2 ~ 50[[si:scalelevel]])");
});

const shenCooldownReduction = (precision: number) => levelCalculation([{
  __type: "ByCharLevelBreakpointsCalculationPart",
  mLevel1Value: 4,
  mInitialBonusPerLevel: 0.23499999940395355,
  mBreakpoints: [{ __type: "Breakpoint", mLevel: 19, mBonusPerLevelAtAndAfter: 0.125 }],
}], { mPrecision: precision, mSimpleTooltipCalculationDisplay: 6 });

test("레벨 범위는 mPrecision 자릿수로 끝자리 0 까지 적는다 (쉔 P 재사용 대기시간 감소)", () => {
  // 위키: 4 to 8
  assert.equal(renderCalculation("Calc", 1, shenCooldownReduction(1)), "(4.0 ~ 8.0[[si:scalelevel]])");
});

test("자릿수는 float32 잡음을 걷어낸 10진 값으로 반올림한다", () => {
  // float32 증가량으로 18레벨이 7.99499… 라 toFixed(2) 만 쓰면 7.99 가 된다. 10진으로는 7.995 → 8.00
  assert.equal(renderCalculation("Calc", 1, shenCooldownReduction(2)), "(4.00 ~ 8.00[[si:scalelevel]])");
});

test("레벨별 값 나열은 values[i] 가 i레벨이다 (럭스 P 폭발 피해)", () => {
  const values = Array.from({ length: 31 }, (_, level) => 20 + 10 * level);
  const data = levelCalculation([{ __type: "ByCharLevelFormulaCalculationPart", values }]);
  // 위키: 30 to 200
  assert.equal(renderCalculation("Calc", 1, data), "(30 ~ 200[[si:scalelevel]])");
});

test("자릿수가 없는 레벨 범위는 소수 둘째 자리까지 적는다 (신짜오 W 미니언 피해)", () => {
  const data = levelCalculation([{
    __type: "ByCharLevelBreakpointsCalculationPart",
    mLevel1Value: 50,
    mInitialBonusPerLevel: 3.3329999446868896,
    mBreakpoints: [{ __type: "Breakpoint", mLevel: 16, mAdditionalBonusAtThisLevel: 3.3399999141693115 }],
  }], { mSimpleTooltipCalculationDisplay: 6 });
  assert.equal(renderCalculation("Calc", 1, data), "(50 ~ 100[[si:scalelevel]])");
});

test("스탯 계수가 레벨 범위면 랭크 값이 아니라 범위로 적는다 (마오카이 P 회복)", () => {
  const data = levelCalculation([{
    __type: "StatBySubPartCalculationPart",
    mStat: 12,
    mSubpart: {
      __type: "ByCharLevelBreakpointsCalculationPart",
      mLevel1Value: 0.03999999910593033,
      mInitialBonusPerLevel: 0.0020000000949949026,
      mBreakpoints: [{ __type: "Breakpoint", mLevel: 7, mBonusPerLevelAtAndAfter: 0.006500000134110451 }],
    },
  }], { mSimpleTooltipCalculationDisplay: 6 });
  assert.equal(renderCalculation("Calc", 1, data), "([[si:scalehealth]](4% ~ 12.8%[[si:scalelevel]]) Health)");
});

test("특정 레벨에서만 더해지는 값도 레벨 범위로 적는다 (니달리 W 덫 개수)", () => {
  const data = levelCalculation([
    {
      __type: "ByCharLevelBreakpointsCalculationPart",
      mLevel1Value: 4,
      mBreakpoints: [6, 11, 16].map((level) => ({
        __type: "Breakpoint", mLevel: level, mAdditionalBonusAtThisLevel: 2,
      })),
    },
    { __type: "NumberCalculationPart", mNumber: 0 },
  ]);
  assert.equal(renderCalculation("Calc", 1, data), "(4 ~ 10[[si:scalelevel]])");
});

test("합 안의 레벨 범위도 레벨 범위로 남는다 (케이틀린 P 헤드샷 계수)", () => {
  const data = levelCalculation([{
    __type: "StatBySubPartCalculationPart",
    mStat: 2,
    mSubpart: {
      __type: "SumOfSubPartsCalculationPart",
      mSubparts: [
        {
          __type: "ByCharLevelBreakpointsCalculationPart",
          mLevel1Value: 0.6000000238418579,
          mBreakpoints: [7, 13].map((level) => ({
            __type: "Breakpoint", mLevel: level, mAdditionalBonusAtThisLevel: 0.20000000298023224,
          })),
        },
        { __type: "NumberCalculationPart", mNumber: 0 },
      ],
    },
  }]);
  assert.equal(renderCalculation("Calc", 1, data), "([[si:scalead]](60% ~ 100%[[si:scalelevel]]) Attack Damage)");
});

test("1레벨 값·레벨당 증가량 이름 파트는 레벨마다 더한다 (이렐리아 P 적중 시 피해)", () => {
  const data = {
    DataValues: { OnHitBaseDamage: [10, 10, 10], OnHitPerLevel: [3, 3, 3] },
    mSpellCalculations: {
      Calc: {
        __type: "GameCalculation",
        mSimpleTooltipCalculationDisplay: 6,
        mFormulaParts: [{ __type: "{b22609db}", "{91d404a5}": "OnHitBaseDamage", "{b2cd0eb0}": "OnHitPerLevel" }],
      },
    },
  } as unknown as CommunityDragonSpellData;
  // 위키: 10 – 61
  assert.equal(renderCalculation("Calc", 1, data), "(10 ~ 61[[si:scalelevel]])");
});

test("mScaleByStatProgressionMultiplier 보간은 끝값은 같고 중간 레벨이 성장 곡선을 따른다 (야스오 P 보호막)", () => {
  const curve = interpolationLevelValues(125, 600, true);
  const linear = interpolationLevelValues(125, 600);
  assert.equal(curve[0], 125);
  assert.equal(curve[17], 600);
  assert.equal(curve[9].toFixed(2), "341.26");
  assert.equal(linear[9].toFixed(2), "376.47");
});

test("mLevel 이 없는 브레이크포인트는 1레벨이고 그 증가량은 1레벨 값에도 붙는다 (요네 W 미니언 최소 피해)", () => {
  const data = levelCalculation([{
    __type: "ByCharLevelBreakpointsCalculationPart",
    mLevel1Value: 30,
    mBreakpoints: [
      { __type: "Breakpoint", mBonusPerLevelAtAndAfter: 10 },
      { __type: "Breakpoint", mLevel: 9, mBonusPerLevelAtAndAfter: 20 },
      { __type: "Breakpoint", mLevel: 14, mBonusPerLevelAtAndAfter: 40 },
    ],
  }], { mSimpleTooltipCalculationDisplay: 6 });
  // 인게임 1~20레벨: 40 50 … 110 130 … 210 250 … 410 450 490. 툴팁 범위는 18레벨까지
  assert.equal(renderCalculation("Calc", 1, data), "(40 ~ 410[[si:scalelevel]])");
});

test("CDragon 이 필드명을 풀어 내보내도 1레벨·18레벨 값 파트를 읽는다 (나르 P 메가 나르 체력)", () => {
  const withFields = (fields: Record<string, string>) => ({
    DataValues: { MegaHealthStartingValue: Array(7).fill(100), MegaHealthEndingValue: Array(7).fill(831) },
    mSpellCalculations: {
      Calc: { __type: "GameCalculation", mFormulaParts: [{ __type: "{ee18a47b}", ...fields }] },
    },
  }) as unknown as CommunityDragonSpellData;
  const hashed = withFields({ "{0589a59c}": "MegaHealthStartingValue", "{0b65bc23}": "MegaHealthEndingValue" });
  const resolved = withFields({ StartDataValue: "MegaHealthStartingValue", EndDataValue: "MegaHealthEndingValue" });
  const unknown = withFields({ SomeFutureName: "MegaHealthStartingValue", OtherFutureName: "MegaHealthEndingValue" });
  for (const data of [hashed, resolved, unknown]) {
    assert.equal(renderCalculation("Calc", 1, data), "(100 ~ 831[[si:scalelevel]])");
  }
});

test("mPrecision -1 인 레벨 범위는 반올림하지 않는다 (벡스 P 공포 지속 시간)", () => {
  const data = levelCalculation([{
    __type: "ByCharLevelBreakpointsCalculationPart",
    mLevel1Value: 0.75,
    mBreakpoints: [6, 9, 13].map((level) => ({
      __type: "Breakpoint", mLevel: level, mAdditionalBonusAtThisLevel: 0.25,
    })),
  }], { mPrecision: -1 });
  // 인게임: 0.75 = (0.75 ~ 1.5). 1~5레벨 0.75, 6~8 1, 9~12 1.25, 13~ 1.5
  assert.equal(renderCalculation("Calc", 1, data), "(0.75 ~ 1.5[[si:scalelevel]])");
});

test("구간형 레벨 범위는 20레벨까지의 값을 넘긴다 (요네 W 미니언 최소 피해)", () => {
  const data = levelCalculation([{
    __type: "ByCharLevelBreakpointsCalculationPart",
    mLevel1Value: 30,
    mBreakpoints: [
      { __type: "Breakpoint", mBonusPerLevelAtAndAfter: 10 },
      { __type: "Breakpoint", mLevel: 9, mBonusPerLevelAtAndAfter: 20 },
      { __type: "Breakpoint", mLevel: 14, mBonusPerLevelAtAndAfter: 40 },
    ],
  }], { mSimpleTooltipCalculationDisplay: 6 });
  assert.deepEqual(reportedLevelValues("Calc", 1, data), [{
    values: [40, 50, 60, 70, 80, 90, 100, 110, 130, 150, 170, 190, 210, 250, 290, 330, 370, 410, 450, 490],
    digits: 0,
  }]);
});

test("보간형 레벨 범위의 19·20레벨은 18레벨 값이다", () => {
  const values = interpolationLevelValues(10, 50);
  assert.equal(values.length, 20);
  assert.deepEqual(values.slice(17), [50, 50, 50]);
});

test("배율은 레벨마다 곱해 레벨별 값에도 들어간다 (조이 Q 최대 피해)", () => {
  const data = {
    DataValues: { Base: [0, 50, 80, 110, 140, 170] },
    mSpellCalculations: {
      Max: {
        __type: "GameCalculation",
        mFormulaParts: [
          { __type: "NamedDataValueCalculationPart", mDataValue: "Base" },
          { __type: "ByCharLevelInterpolationCalculationPart", mStartValue: 2, mEndValue: 36 },
        ],
        mMultiplier: { mNumber: 2.5 },
      },
    },
  } as unknown as CommunityDragonSpellData;
  const [entry] = reportedLevelValues("Max", 5, data);
  assert.deepEqual([entry.values[0], entry.values[1], entry.values[17], entry.values[19]], [5, 10, 90, 90]);
});

test("반올림하지 않는 레벨 범위는 소수 셋째 자리까지 끝자리 0 을 지워 적는다 (벡스 P 공포 지속 시간)", () => {
  const data = levelCalculation([{
    __type: "ByCharLevelBreakpointsCalculationPart",
    mLevel1Value: 0.75,
    mBreakpoints: [6, 9, 13].map((level) => ({
      __type: "Breakpoint", mLevel: level, mAdditionalBonusAtThisLevel: 0.25,
    })),
  }], { mPrecision: -1 });
  const [entry] = reportedLevelValues("Calc", 1, data);
  assert.equal(entry.digits, 3);
  assert.equal(entry.trimZeros, true);
  assert.deepEqual([entry.values[4], entry.values[5], entry.values[8], entry.values[12]], [0.75, 1, 1.25, 1.5]);
});
