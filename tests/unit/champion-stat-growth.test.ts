import assert from "node:assert/strict";
import test from "node:test";
import { attachStatGrowth } from "../../scripts/llm/refresh-card-growth";
import { createChampionCardBuilder } from "../../src/lib/knowledge/facts";
import type { ChampionRecord } from "../../src/lib/knowledge/sourceRecords";

const champion: ChampionRecord = {
  id: "Example", key: "1", name: "예시", tags: ["Fighter"],
  baseStats: {
    health: { base: 610, perLevel: 110 }, healthRegen: { base: 3.5, perLevel: 0.65 },
    armor: { base: 31, perLevel: 4.7 }, magicResist: { base: 28, perLevel: 2.05 },
    attackDamage: { base: 66, perLevel: 3.5 }, attackSpeed: { base: 0.69, perLevel: 3 },
    moveSpeed: { base: 340, perLevel: 0 }, attackRange: { base: 175, perLevel: 0 },
  },
  abilities: { P: { slot: "P", id: "passive", name: "패시브", bodyHtml: "검수된 설명" } },
};
const card = () => createChampionCardBuilder([champion]).buildAll()[0];

test("카드 생성은 원본 성장치를 보존하고 공속 성장치는 퍼센트 값 그대로 둔다", () => {
  const result = card();
  assert.equal(result.stats.health.perLevel, 110);
  assert.equal(result.stats.attackSpeed.perLevel, 3);
  assert.equal(result.stats.moveSpeed.perLevel, 0);
});

test("기존 카드의 성장치만 갱신하고 수치·스킬·역할군을 보존하며 반복 실행해도 같다", () => {
  const legacy = card();
  for (const snap of Object.values(legacy.stats)) delete snap.perLevel;
  const before = structuredClone(legacy);
  assert.equal(attachStatGrowth([legacy], [champion]), 7);
  assert.equal(attachStatGrowth([legacy], [champion]), 0);
  const withoutGrowth = structuredClone(legacy);
  for (const snap of Object.values(withoutGrowth.stats)) delete snap.perLevel;
  assert.deepEqual(withoutGrowth, before);
});

test("원본이 사라졌거나 성장치가 잘못됐으면 카드를 쓰기 전에 멈춘다", () => {
  assert.throws(() => attachStatGrowth([card()], []), /원본 없음/);
  const invalid = structuredClone(champion);
  invalid.baseStats.health.perLevel = Infinity;
  assert.throws(() => attachStatGrowth([card()], [invalid]), /잘못된 성장치/);
});
