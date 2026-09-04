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

console.log("✅ Champion and Ability v2 contract passed");
