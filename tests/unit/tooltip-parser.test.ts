/**
 * Tooltip Parser 테스트 스크립트
 * npm run test:one tests/unit/tooltip-parser.test.ts 로 실행
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseSpellTooltip,
  parseSpellTooltipWithDiagnostics,
} from "../../src/lib/spellTooltipParser/parser";
import type { ChampionSpell } from "../../src/types";
import type { CommunityDragonSpellData } from "../../src/lib/spellTooltipParser/types";
import { evaluateSpellCalculation } from "../../src/lib/spellTooltipParser/spellCalculationEvaluator";
import { formatCalculationResult } from "../../src/lib/spellTooltipParser/calculationResultFormatter";

// 테스트 케이스 정의
interface TestCase {
  name: string;
  tooltip: string | undefined;
  spell?: ChampionSpell;
  communityDragonData?: CommunityDragonSpellData;
  lang?: "ko_KR" | "en_US";
  expectedContains?: string[];
  expectedNotContains?: string[];
  /**
   * 커스텀 검증 로직
   * - 반환된 배열에 에러 메시지를 넣으면 해당 테스트가 실패로 처리됨
   */
  assert?: (result: string) => string[];
}

const testCases: TestCase[] = [
  {
    name: "기본 변수 치환 테스트",
    tooltip: "데미지: {{ e1 }}",
    spell: {
      id: "TestSpell",
      name: "Test Spell",
      description: "",
      tooltip: "데미지: {{ e1 }}",
      maxrank: 5,
      cooldown: [10, 9, 8, 7, 6],
      cooldownBurn: "10/9/8/7/6",
      cost: [50, 50, 50, 50, 50],
      costBurn: "50",
      effectBurn: [null, "50", "100", "150", "200", "250"],
      range: [600],
      rangeBurn: "600",
    },
    expectedContains: ["50"],
  },
  {
    name: "레벨별 값 표시 테스트",
    tooltip: "데미지: {{ e1 }}",
    spell: {
      id: "TestSpell",
      name: "Test Spell",
      description: "",
      tooltip: "데미지: {{ e1 }}",
      maxrank: 5,
      cooldown: [10, 9, 8, 7, 6],
      cooldownBurn: "10/9/8/7/6",
      cost: [50, 50, 50, 50, 50],
      costBurn: "50",
      effectBurn: [null, "50/60/70/80/90", "100/110/120/130/140"],
      range: [600],
      rangeBurn: "600",
    },
    expectedContains: ["50/60/70/80/90"],
  },
  {
    name: "XML 태그 변환 테스트",
    tooltip: "<mainText>데미지: {{ e1 }}</mainText>",
    spell: {
      id: "TestSpell",
      name: "Test Spell",
      description: "",
      tooltip: "<mainText>데미지: {{ e1 }}</mainText>",
      maxrank: 5,
      cooldown: [10],
      cooldownBurn: "10",
      cost: [50],
      costBurn: "50",
      effectBurn: [null, "100"],
      range: [600],
      rangeBurn: "600",
    },
    expectedContains: ["데미지"],
    expectedNotContains: ["<mainText>"],
  },
  {
    name: "빈 툴팁 처리",
    tooltip: "",
    expectedContains: [""],
  },
  {
    name: "undefined 툴팁 처리",
    tooltip: undefined,
    expectedContains: [""],
  },
];

for (const testCase of testCases) {
  test(testCase.name, () => {
    const result = parseSpellTooltip(
      testCase.tooltip,
      testCase.spell,
      testCase.communityDragonData,
      testCase.lang || "ko_KR"
    );

    const errors: string[] = [];

    // expectedContains 검증
    if (testCase.expectedContains) {
      for (const expected of testCase.expectedContains) {
        if (!result.includes(expected)) {
          errors.push(`예상된 문자열 "${expected}"을 찾을 수 없습니다.`);
        }
      }
    }

    // expectedNotContains 검증
    if (testCase.expectedNotContains) {
      for (const notExpected of testCase.expectedNotContains) {
        if (result.includes(notExpected)) {
          errors.push(`예상치 못한 문자열 "${notExpected}"이 포함되어 있습니다.`);
        }
      }
    }

    // 커스텀 검증 로직
    if (testCase.assert) {
      errors.push(...testCase.assert(result));
    }

    assert.deepEqual(errors, [], `결과: ${result.substring(0, 100)}...`);
  });
}

// 랭크 벡터와 레벨 범위([1레벨, 최대 레벨])가 섞인 계산식 (CI 로그의 "Vector length mismatch")
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

test("레벨 범위 뒤에 오는 랭크 값도 합산한다 (우디르 W RecastShield)", () => {
  const data = {
    DataValues: { ShieldBase: [25, 45, 65, 85, 105, 125, 145] },
    mSpellCalculations: {
      RecastShield: {
        __type: "GameCalculation",
        mFormulaParts: [
          { __type: "ByCharLevelInterpolationCalculationPart", mStartValue: 20, mEndValue: 150 },
          { __type: "NamedDataValueCalculationPart", mDataValue: "ShieldBase" },
        ],
      },
    },
  } as unknown as CommunityDragonSpellData;
  assert.equal(
    renderCalculation("RecastShield", 6, data),
    "(45/65/85/105/125/145 + (20 ~ 165.29))",
  );
});

test("레벨 범위 base 에 랭크 배율은 접지 않고 × 로 남긴다 (일라오이 Q TentacleDamageTotal)", () => {
  const data = {
    DataValues: { Amp: [0, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35] },
    mSpellCalculations: {
      Total: {
        __type: "GameCalculation",
        mFormulaParts: [
          { __type: "ByCharLevelInterpolationCalculationPart", mStartValue: 9, mEndValue: 180 },
          { __type: "StatByCoefficientCalculationPart", mCoefficient: 0.4 },
        ],
        mMultiplier: {
          __type: "SumOfSubPartsCalculationPart",
          mSubparts: [
            { __type: "NumberCalculationPart", mNumber: 1 },
            { __type: "NamedDataValueCalculationPart", mDataValue: "Amp" },
          ],
        },
      },
    },
  } as unknown as CommunityDragonSpellData;
  assert.equal(
    renderCalculation("Total", 5, data),
    "((9 ~ 200.12) + ([[si:scaleap]]40% Ability Power)) × 1.1/1.15/1.2/1.25/1.3",
  );
});

test("랭크 값에 레벨 범위 배율은 범위로 붙인다 (유미 R EnhancedHealPerWave)", () => {
  const data = {
    DataValues: { BaseHeal: [10, 30, 50, 70, 90] },
    mSpellCalculations: {
      Heal: {
        __type: "GameCalculation",
        mFormulaParts: [{ __type: "NamedDataValueCalculationPart", mDataValue: "BaseHeal" }],
      },
      Perc: {
        __type: "GameCalculation",
        mFormulaParts: [
          {
            __type: "ByCharLevelBreakpointsCalculationPart",
            mLevel1Value: 1.3,
            mBreakpoints: [
              { __type: "Breakpoint", mLevel: 7, mBonusPerLevelAtAndAfter: 0.05 },
              { __type: "Breakpoint", mLevel: 13 },
            ],
          },
        ],
      },
      Enhanced: {
        __type: "GameCalculationModified",
        mModifiedGameCalculation: "Heal",
        mMultiplier: { __type: "{f3cbe7b2}", mSpellCalculationKey: "Perc" },
      },
    },
  } as unknown as CommunityDragonSpellData;
  assert.equal(renderCalculation("Enhanced", 3, data), "30/50/70 × (1.3 ~ 1.6)");
});

test("상수 배율은 옆에 붙은 레벨 범위 항에도 곱한다 (조이 Q 최대 피해)", () => {
  const data = {
    DataValues: { Base: [0, 50, 80, 110, 140, 170] },
    mSpellCalculations: {
      Max: {
        __type: "GameCalculation",
        mFormulaParts: [
          { __type: "NamedDataValueCalculationPart", mDataValue: "Base" },
          { __type: "ByCharLevelInterpolationCalculationPart", mStartValue: 2, mEndValue: 34 },
        ],
        mMultiplier: { mNumber: 2.5 },
      },
    },
  } as unknown as CommunityDragonSpellData;
  assert.equal(renderCalculation("Max", 5, data), "(125/200/275/350/425 + (5 ~ 94.41))");
});

const levelRangeOnly = (key: string, calc: unknown): CommunityDragonSpellData =>
  ({ mSpellCalculations: { [key]: calc } }) as unknown as CommunityDragonSpellData;

test("레벨 범위 항 하나뿐인 계산식도 mMultiplier 를 적용한다 (가렌 P RegenCalc)", () => {
  const data = levelRangeOnly("RegenCalc", {
    __type: "GameCalculation",
    mDisplayAsPercent: true,
    mMultiplier: { __type: "NumberCalculationPart", mNumber: 0.01 },
    mFormulaParts: [
      {
        __type: "ByCharLevelBreakpointsCalculationPart",
        mLevel1Value: 1.5,
        mInitialBonusPerLevel: 0.2,
        mBreakpoints: [
          { __type: "Breakpoint", mLevel: 7, mBonusPerLevelAtAndAfter: 0.8 },
          { __type: "Breakpoint", mLevel: 14, mBonusPerLevelAtAndAfter: 0.4 },
        ],
      },
    ],
  });
  // 위키: 18레벨 10.1%, 20레벨 10.9% (배율 0.01 을 적용해야 1.5% 부터 시작한다)
  assert.equal(renderCalculation("RegenCalc", 1, data), "(1.5% ~ 10.9%)");
});

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
  // 위키: 18레벨 182, 20레벨 212
  assert.equal(
    renderCalculation("Damage", 1, data),
    "((35 ~ 212) + ([[si:scaleap]]55% Ability Power))",
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
  // 위키: 18레벨 2%, 20레벨 2.3%. 없는 이름·__type 해시는 값 누락 진단으로 잡지 않는다.
  assert.equal(rendered.html, "(0.1 ~ 2.3)");
  assert.deepEqual(rendered.droppedCalculations, []);
});

test("다른 스킬 계산식은 그 스킬의 랭크 축으로 읽는다 (일라오이 패시브 → IllaoiQ)", () => {
  const illaoiQ = {
    maxRank: 5,
    DataValues: { Amp: [0, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35] },
    mSpellCalculations: {
      TentacleDamageTotal: {
        __type: "GameCalculation",
        mFormulaParts: [
          { __type: "ByCharLevelInterpolationCalculationPart", mStartValue: 9, mEndValue: 180 },
          { __type: "StatByCoefficientCalculationPart", mCoefficient: 0.4 },
        ],
        mMultiplier: {
          __type: "SumOfSubPartsCalculationPart",
          mSubparts: [
            { __type: "NumberCalculationPart", mNumber: 1 },
            { __type: "NamedDataValueCalculationPart", mDataValue: "Amp" },
          ],
        },
      },
    },
  } as unknown as CommunityDragonSpellData;
  const passive = { id: "IllaoiPassive", maxrank: 1, cooldown: [] } as ChampionSpell;
  const html = parseSpellTooltip(
    "{{ spell.IllaoiQ:TentacleDamageTotal }}",
    passive,
    { siblings: { illaoiq: illaoiQ } } as CommunityDragonSpellData,
    "en_US",
  );
  // 예전에는 패시브 랭크 1 로 잘려 ×1.1 이 접힌 (9.9 ~ 198) 이었다
  assert.equal(html, "((9 ~ 200.12) + ([[si:scaleap]]40% Ability Power)) × 1.1/1.15/1.2/1.25/1.3");
});

test("배율이 겹치면 이어 곱하고, 풀지 못한 항은 진단에 남긴다 (아크샨 E CriticalCalc)", () => {
  const data = {
    DataValues: { Base: [0, 8, 16, 24, 32, 40], CritMod: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5] },
    mSpellCalculations: {
      Damage: {
        __type: "GameCalculation",
        mFormulaParts: [
          { __type: "NamedDataValueCalculationPart", mDataValue: "Base" },
          { __type: "NamedDataValueCalculationPart", mDataValue: "Missing" },
        ],
        mMultiplier: {
          __type: "SumOfSubPartsCalculationPart",
          mSubparts: [
            { __type: "NumberCalculationPart", mNumber: 1 },
            { __type: "StatByCoefficientCalculationPart", mStat: 4, mStatFormula: 2, mCoefficient: 0.3 },
          ],
        },
      },
      Critical: {
        __type: "GameCalculationModified",
        mModifiedGameCalculation: "Damage",
        mMultiplier: {
          __type: "ProductOfSubPartsCalculationPart",
          mPart1: { __type: "NamedDataValueCalculationPart", mDataValue: "CritMod" },
          mPart2: { __type: "StatByCoefficientCalculationPart", mStat: 9, mCoefficient: 1 },
        },
      },
    },
  } as unknown as CommunityDragonSpellData;
  const spell = { id: "AkshanE", maxrank: 5, cooldown: [] } as ChampionSpell;
  const rendered = parseSpellTooltipWithDiagnostics("{{ Critical }}", spell, data, "en_US");
  assert.equal(
    rendered.html,
    "8/16/24/32/40 × (1 + [[si:scaleas]]30% bonus Attack Speed) × ([[si:scalecritmult]]50% Critical Strike Damage)",
  );
  assert.deepEqual(
    rendered.droppedCalculations.map(({ key, reason }) => `${key}:${reason}`).sort(),
    ["Damage:missing-data-value", "Damage:unresolved-part"],
  );
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
    "deals (1 ~ 10)% current Health",
  );
});

// 챔피언 레벨은 탑 라인 역할 퀘스트로 20 까지 오른다. 레벨 범위의 끝값은 20레벨 값이다.
function levelCalculation(parts: unknown[], extra: Record<string, unknown> = {}): CommunityDragonSpellData {
  return {
    mSpellCalculations: { Calc: { __type: "GameCalculation", mFormulaParts: parts, ...extra } },
  } as unknown as CommunityDragonSpellData;
}

test("19레벨 브레이크포인트가 있으면 그 증가량으로 20레벨까지 잇는다 (라칸 P 재사용 대기시간)", () => {
  const data = levelCalculation([{
    __type: "ByCharLevelBreakpointsCalculationPart",
    mLevel1Value: 40,
    mInitialBonusPerLevel: -1.5,
    mBreakpoints: [{ __type: "Breakpoint", mLevel: 19, mBonusPerLevelAtAndAfter: -0.875 }],
  }], { mPrecision: 1, mSimpleTooltipCalculationDisplay: 6 });
  // 위키: 40 to 14.5 for 18; then -0.875*x for 2
  assert.equal(renderCalculation("Calc", 1, data), "(40 ~ 12.75)");
});

test("마지막 브레이크포인트 증가량은 20레벨까지 이어진다 (조이 Q 레벨 항)", () => {
  const data = levelCalculation([{
    __type: "ByCharLevelBreakpointsCalculationPart",
    mLevel1Value: 2,
    mInitialBonusPerLevel: 2,
    mBreakpoints: [
      { __type: "Breakpoint", mLevel: 10, mBonusPerLevelAtAndAfter: 3 },
      { __type: "Breakpoint", mLevel: 14, mBonusPerLevelAtAndAfter: 4 },
    ],
  }], { mSimpleTooltipCalculationDisplay: 6 });
  // 위키: 2; then +2*x for 8; then +3*x for 4; then +4*x for 7
  assert.equal(renderCalculation("Calc", 1, data), "(2 ~ 58)");
});

test("mPrecision 자릿수는 float32 잡음을 걷어낸 10진 값으로 반올림한다 (쉔 P 재사용 대기시간 감소)", () => {
  const data = levelCalculation([{
    __type: "ByCharLevelBreakpointsCalculationPart",
    mLevel1Value: 4,
    mInitialBonusPerLevel: 0.23499999940395355,
    mBreakpoints: [{ __type: "Breakpoint", mLevel: 19, mBonusPerLevelAtAndAfter: 0.125 }],
  }], { mPrecision: 1, mSimpleTooltipCalculationDisplay: 6 });
  // 위키: 4 to 8 for 18; then +0.125*x for 2
  assert.equal(renderCalculation("Calc", 1, data), "(4 ~ 8.25)");
});

test("레벨별 값 나열은 values[i] 가 i레벨이다 (럭스 P 폭발 피해)", () => {
  const values = Array.from({ length: 31 }, (_, level) => 20 + 10 * level);
  const data = levelCalculation([{ __type: "ByCharLevelFormulaCalculationPart", values }]);
  // 위키: 30 to 200 (18레벨), 20레벨 220
  assert.equal(renderCalculation("Calc", 1, data), "(30 ~ 220)");
});

test("자릿수가 없는 레벨 범위는 소수 둘째 자리까지 적는다 (신짜오 W 미니언 피해)", () => {
  const data = levelCalculation([{
    __type: "ByCharLevelBreakpointsCalculationPart",
    mLevel1Value: 50,
    mInitialBonusPerLevel: 3.3329999446868896,
    mBreakpoints: [{ __type: "Breakpoint", mLevel: 16, mAdditionalBonusAtThisLevel: 3.3399999141693115 }],
  }], { mSimpleTooltipCalculationDisplay: 6 });
  assert.equal(renderCalculation("Calc", 1, data), "(50 ~ 100)");
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
  assert.equal(renderCalculation("Calc", 1, data), "([[si:scalehealth]](4% ~ 14.1%) Health)");
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
  assert.equal(renderCalculation("Calc", 1, data), "(4 ~ 10)");
});

test("mScalePastDefaultMaxLevel 이 false 인 레벨 보간은 18레벨 값에서 멈춘다 (오른 P)", () => {
  const data = levelCalculation([{
    __type: "ByCharLevelInterpolationCalculationPart",
    mStartValue: 90,
    mEndValue: 10,
    mScalePastDefaultMaxLevel: false,
  }]);
  assert.equal(renderCalculation("Calc", 1, data), "(90 ~ 10)");
});

test("19레벨부터 부호가 뒤집히는 값은 0 에서 멈춘다 (아이번 P 숲 생성 비용)", () => {
  const data = levelCalculation([{
    __type: "ByCharLevelBreakpointsCalculationPart",
    mLevel1Value: 15,
    mInitialBonusPerLevel: -0.8820000290870667,
  }], { mSimpleTooltipCalculationDisplay: 6 });
  assert.equal(renderCalculation("Calc", 1, data), "(15 ~ 0)");
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
  assert.equal(renderCalculation("Calc", 1, data), "([[si:scalead]](60% ~ 100%) Attack Damage)");
});
