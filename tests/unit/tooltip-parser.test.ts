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

const scalarSpell: ChampionSpell = {
  id: "TestSpell", maxrank: 5, cooldown: [], effectBurn: [null, "50"],
};

test("기본 변수 치환 테스트", () => {
  assert.equal(parseSpellTooltip("데미지: {{ e1 }}", scalarSpell, undefined, "ko_KR"), "데미지: 50");
});

test("레벨별 값 표시 테스트", () => {
  const spell = { ...scalarSpell, effectBurn: [null, "50/60/70/80/90"] };
  assert.equal(parseSpellTooltip("데미지: {{ e1 }}", spell, undefined, "ko_KR"), "데미지: 50/60/70/80/90");
});

test("XML 태그 변환 테스트", () => {
  const result = parseSpellTooltip("<mainText>데미지: {{ e1 }}</mainText>", scalarSpell, undefined, "ko_KR");
  assert.ok(result.includes("데미지"));
  assert.ok(!result.includes("<mainText>"));
});

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
    "(45/65/85/105/125/145 + (20 ~ 150[[si:scalelevel]]))",
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
    "((9 ~ 180[[si:scalelevel]]) + ([[si:scaleap]]40% Ability Power)) × 1.1/1.15/1.2/1.25/1.3",
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
  assert.equal(renderCalculation("Enhanced", 3, data), "30/50/70 × (1.3 ~ 1.6[[si:scalelevel]])");
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
  assert.equal(renderCalculation("Max", 5, data), "(125/200/275/350/425 + (5 ~ 85[[si:scalelevel]]))");
});

const levelRangeOnly = (key: string, calc: unknown): CommunityDragonSpellData =>
  ({ mSpellCalculations: { [key]: calc } }) as unknown as CommunityDragonSpellData;

test("레벨 범위 항 하나뿐인 계산식도 mMultiplier 를 적용한다 (가렌 P RegenCalc)", () => {
  const data = levelRangeOnly("RegenCalc", {
    __type: "GameCalculation",
    mDisplayAsPercent: true,
    mPrecision: 1,
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
  // 위키: 1.5% – 10.1% (배율 0.01 을 적용해야 1.5% 부터 시작한다)
  assert.equal(renderCalculation("RegenCalc", 1, data), "(1.5% ~ 10.1%[[si:scalelevel]])");
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
  // 촉수는 Q 를 배우기 전에도 내려친다. 위키: Q 랭크 0~5 에 0/10/15/20/25/30% 증가 (rankZeroReferences.ts)
  assert.equal(html, "((9 ~ 180[[si:scalelevel]]) + ([[si:scaleap]]40% Ability Power)) × 1/1.1/1.15/1.2/1.25/1.3");
});

// 다른 스킬 값의 0랭크(아직 배우지 않은 상태) 칸. rankZeroReferences.ts
function renderSiblingReference(
  template: string,
  owner: { id: string; isPassive?: boolean },
  targetName: string,
  target: Partial<CommunityDragonSpellData>,
): string {
  const spell = { id: owner.id, maxrank: owner.isPassive ? 1 : 5, cooldown: [] } as ChampionSpell;
  const data = {
    isPassive: owner.isPassive,
    siblings: { [targetName.toLowerCase()]: target },
  } as CommunityDragonSpellData;
  return parseSpellTooltip(template, spell, data, "en_US");
}

test("패시브가 부른 R 값은 R 을 배우기 전(0랭크) 값부터 적는다 (피오라 패시브 → FioraR)", () => {
  const html = renderSiblingReference(
    "grants {{ spell.FioraR:PercentMS*100 }}% Move Speed",
    { id: "FioraPassive", isPassive: true },
    "FioraR",
    { maxRank: 3, firstRankLevel: 6, DataValues: { PercentMS: [0.2, 0.3, 0.4, 0.5, 0.6] } },
  );
  // 위키: R 랭크 0~3 에 20/30/40/50%
  assert.equal(html, "grants 20/30/40/50% Move Speed");
});

test("패시브가 부른 R 계산식도 0랭크 값부터 읽는다 (멜 패시브 → MelR PassiveFlatDamage)", () => {
  const html = renderSiblingReference(
    "{{ spell.MelR:PassiveFlatDamage }}",
    { id: "MelPassive", isPassive: true },
    "MelR",
    {
      maxRank: 3,
      firstRankLevel: 6,
      DataValues: { BasePassiveFlatDamage: [50, 60, 70, 80, 90] },
      mSpellCalculations: {
        PassiveFlatDamage: {
          __type: "GameCalculation",
          mFormulaParts: [
            { __type: "NamedDataValueCalculationPart", mDataValue: "BasePassiveFlatDamage" },
            { __type: "StatByCoefficientCalculationPart", mCoefficient: 0.1 },
          ],
        },
      } as unknown as CommunityDragonSpellData["mSpellCalculations"],
    },
  );
  assert.equal(html, "(50/60/70/80 + ([[si:scaleap]]10% Ability Power))");
});

test("기본 스킬이 부른 R 값에는 0랭크를 붙이지 않는다 (아니비아 Q → GlacialStorm)", () => {
  const html = renderSiblingReference(
    "Slowing them by {{ spell.GlacialStorm:SlowAmount }}%",
    { id: "FlashFrost" },
    "GlacialStorm",
    { maxRank: 3, firstRankLevel: 6, DataValues: { SlowAmount: [20, 20, 30, 40, 50] } },
  );
  // 위키: 20/30/40%. 둔화는 R 랭크를 따라 커지고 0랭크는 1랭크와 같은 20% 다
  assert.equal(html, "Slowing them by 20/30/40%");
});

test("R 을 1레벨부터 가진 챔피언은 패시브가 불러도 0랭크를 붙이지 않는다 (엘리스 패시브 → EliseR)", () => {
  const html = renderSiblingReference(
    "up to {{ spell.EliseR:BaseSpiderlingsStored }}",
    { id: "ElisePassive", isPassive: true },
    "EliseR",
    { maxRank: 4, firstRankLevel: 1, DataValues: { BaseSpiderlingsStored: [2, 2, 3, 4, 5, 6] } },
  );
  // 위키: 2/3/4/5. 엘리스는 시작부터 R 1랭크라 0번 칸은 쓰지 않는 자리다
  assert.equal(html, "up to 2/3/4/5");
});

test("규칙 밖이어도 표에 적은 참조는 0랭크 값부터 읽는다 (그나르 W → GnarR)", () => {
  const html = renderSiblingReference(
    "grants {{ spell.GnarR:RHyperMovementSpeedPercent }}% Move Speed",
    { id: "GnarW" },
    "GnarR",
    { maxRank: 3, firstRankLevel: 6, DataValues: { RHyperMovementSpeedPercent: [20, 40, 60, 80, 100] } },
  );
  // 위키: GNAR! 랭크 0~3 에 20/40/60/80%. W 이동 속도는 R 을 배우기 전에도 붙는다
  assert.equal(html, "grants 20/40/60/80% Move Speed");
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

test("툴팁의 레벨별 값은 나온 순서대로 한 번씩 싣는다", () => {
  const data = {
    mSpellCalculations: {
      First: { __type: "GameCalculation", mFormulaParts: [{ __type: "ByCharLevelInterpolationCalculationPart", mStartValue: 10, mEndValue: 50 }] },
      Second: { __type: "GameCalculation", mFormulaParts: [{ __type: "ByCharLevelInterpolationCalculationPart", mStartValue: 1, mEndValue: 2 }] },
    },
  } as unknown as CommunityDragonSpellData;
  const spell = { id: "Test", maxrank: 1, cooldown: [] } as ChampionSpell;
  const rendered = parseSpellTooltipWithDiagnostics("{{ Second }} {{ First }} {{ Second }}", spell, data, "en_US");
  assert.deepEqual(rendered.levelValues.map((entry) => entry.values[17]), [2, 50]);
});

test("원문 아이콘 자리 표시만 지우고 스탯 글리프를 넘어 문장을 지우지 않는다 (중국어 야스오 P)", () => {
  const spell = { id: "Test", maxrank: 1, cooldown: [] } as ChampionSpell;
  // 띄어쓰기 없는 중국어에서 앞 값의 % 부터 글리프 자리 표시의 콜론을 지나 다음 % 까지를 %i:이름% 로 읽으면 사이 문장이 빠진다
  assert.equal(
    parseSpellTooltip(
      "亚索的暴击几率提升100%但他的暴击伤害降低至([[si:scalecritmult]]100% 暴击伤害)。%i:scaleCrit%",
      spell,
      {} as CommunityDragonSpellData,
      "zh_CN",
    ),
    "亚索的暴击几率提升100%但他的暴击伤害降低至([[si:scalecritmult]]100% 暴击伤害)。",
  );
});

test("레벨 글리프 자리 표시를 원문 아이콘으로 읽어 지우지 않는다 (중국어 문도 W, 아지르 W)", () => {
  const data = {
    mSpellCalculations: {
      Stored: {
        __type: "GameCalculation",
        mDisplayAsPercent: true,
        mFormulaParts: [{ __type: "ByCharLevelInterpolationCalculationPart", mStartValue: 0.8, mEndValue: 0.95 }],
      },
      Secondary: {
        __type: "GameCalculation",
        mDisplayAsPercent: true,
        mFormulaParts: [{ __type: "ByCharLevelInterpolationCalculationPart", mStartValue: 0.2, mEndValue: 1 }],
      },
    },
  } as unknown as CommunityDragonSpellData;
  const spell = { id: "Test", maxrank: 5, cooldown: [] } as ChampionSpell;
  // 띄어쓰기 없는 중국어에서 앞 범위의 % 부터 뒤 값의 % 까지를 %i:이름% 로 읽으면 사이 문장이 통째로 빠진다
  assert.equal(
    parseSpellTooltip("{{ Stored }}伤害值和在剩余时长里受到的25%伤害值", spell, data, "zh_CN"),
    "(80% ~ 95%[[si:scalelevel]])伤害值和在剩余时长里受到的25%伤害值",
  );
  // 원문이 값 뒤에 % 를 한 번 더 붙인다 ("@SecondaryTargetDamageMod@%의 피해")
  assert.equal(
    parseSpellTooltip("{{ Secondary }}%의 피해", spell, data, "ko_KR"),
    "(20% ~ 100%[[si:scalelevel]])의 피해",
  );
});
