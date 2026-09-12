import assert from "node:assert/strict";
import type { Champion } from "../src/types";
import type { NormalizedChampion } from "../src/types/combatNormalized";
import {
  buildChampionDetailV2,
  buildChampionIndexV2,
  inferDamageType,
} from "./data-pipeline/champion-data-v2";
import {
  decodeChampionDetail,
  decodeChampionIndex,
} from "../src/data/contracts/championDataDecoder";

const champion = {
  id: "Test",
  key: "1",
  name: "시험",
  title: "테스트 챔피언",
  tags: ["Mage"],
  passive: {
    name: "지속 효과",
    description: "완성된 패시브",
    summary: "패시브 요약",
    spellId: "TestP",
    tooltipSource: "communitydragon",
    image: { full: "TestP.png" },
  },
  spells: ["Q", "W", "E", "R"].map((slot) => ({
    id: `Test${slot}`,
    name: slot,
    maxrank: 2,
    description: `${slot} 요약`,
    tooltip: `${slot} 본문 10/20`,
    tooltipSource: "communitydragon",
    cooldown: [8, 7],
    cost: [40, 50],
    costType: "마나",
    range: [500, 500],
    image: { full: `Test${slot}.png` },
    leveltip: { label: ["피해량"], effect: ["{{ Damage }}"] },
  })),
} satisfies Champion;

const normalized = {
  id: "Test",
  type: "champion",
  name: "시험",
  baseStats: {},
  baseStatContributions: [],
  spells: Object.fromEntries(
    ["P", "Q", "W", "E", "R"].map((slot) => [
      slot,
      { slot, key: `Test${slot}`, name: slot, tooltip: "", scalings: [] },
    ])
  ),
} as unknown as NormalizedChampion;

const detail = buildChampionDetailV2({
  patchVersion: "26.17",
  locale: "ko_KR",
  sources: { ddragon: "16.17.1", cdragon: "16.17" },
  champion,
  normalized,
  spellData: {
    TestQ: { DataValues: { Damage: [0, 10, 20] } },
  },
});

assert.equal(detail.patchVersion, "26.17");
assert.equal(detail.sources.ddragon, "16.17.1");
assert.equal(detail.champion.abilities.P.bodyHtml, "완성된 패시브");
assert.deepEqual(detail.champion.abilities.Q.rankValues, [
  { label: "피해량", values: "10/20" },
]);
assert.deepEqual(detail.champion.abilities.Q.cooldownSeconds, [8, 7]);
assert.deepEqual(detail.champion.abilities.Q.cost, {
  values: [40, 50],
  resource: "마나",
});

const index = buildChampionIndexV2([detail]);
assert.deepEqual(index.champions[0], {
  id: "Test",
  key: "1",
  name: "시험",
  title: "테스트 챔피언",
  iconFile: "Test.png",
});
assert.equal(decodeChampionDetail(detail).champion.id, "Test");
assert.equal(decodeChampionIndex(index).champions.length, 1);
assert.throws(
  () => decodeChampionDetail({ ...detail, schemaVersion: 1 }),
  /Unsupported static data schema/
);

assert.equal(inferDamageType("<physicalDamage>물리 피해</physicalDamage>"), "physical");
assert.equal(inferDamageType("Deals magic damage"), "magical");
assert.equal(inferDamageType("造成真实伤害"), "true");
assert.equal(inferDamageType("적에게 피해를 줍니다."), "unknown");

// --- 공식 트리를 싣는 스킬의 디코딩 ---

const withExpression = {
  ...detail,
  champion: {
    ...detail.champion,
    abilities: {
      ...detail.champion.abilities,
      Q: {
        ...detail.champion.abilities.Q,
        simulation: {
          status: "expression",
          unsupportedPartTypes: ["nonlinear-product"],
          expression: {
            id: "TotalDamage",
            kind: "damage",
            damageType: "physical",
            requiresBuffStacks: false,
            root: {
              kind: "product",
              parts: [
                { kind: "value", value: { byRank: [10, 20] } },
                {
                  kind: "sum",
                  parts: [
                    { kind: "value", value: { byRank: [1, 1] } },
                    { kind: "stat", stat: "critChance", coefficient: { byRank: [0.3, 0.3] } },
                  ],
                },
              ],
            },
          },
        },
      },
    },
  },
};

assert.equal(
  decodeChampionDetail(withExpression).champion.abilities.Q.simulation.status,
  "expression"
);

// 잎이 곡선이 아니면 거른다. null 이 와도 예외 대신 우리 오류로 떨어져야 한다.
const brokenCurve = structuredClone(withExpression);
brokenCurve.champion.abilities.Q.simulation.expression.root.parts[0].value = null;
assert.throws(() => decodeChampionDetail(brokenCurve), /expression value/);

// 모르는 노드 종류는 통과시키지 않는다.
const brokenKind = structuredClone(withExpression);
brokenKind.champion.abilities.Q.simulation.expression.root.parts[0].kind = "wat";
assert.throws(() => decodeChampionDetail(brokenKind), /simulation expression/);

// 비어 있는 합은 평가할 수 없다.
const emptySum = structuredClone(withExpression);
emptySum.champion.abilities.Q.simulation.expression.root.parts[1].parts = [];
assert.throws(() => decodeChampionDetail(emptySum), /simulation expression/);

console.log("✅ Champion and Ability v2 contract passed");
