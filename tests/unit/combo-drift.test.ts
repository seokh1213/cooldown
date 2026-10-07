import assert from "node:assert/strict";
import test from "node:test";
import { comboDrift } from "../../scripts/llm/lib/comboDrift";
import { abilityTextHash } from "../../scripts/llm/lib/comboNotes";
import type { ChampionCard } from "../../src/lib/knowledge/facts";
import type { ComboGuideFile } from "../../src/lib/knowledge/comboGuide";

test("수치 차이도 자동 승인하지 않고 모든 변경을 검수 자료에 포함한다", () => {
  const before = [{ id: "Example", spells: [{ slot: "Q", text: "2초 기절" }] }] as ChampionCard[];
  const guides = { champions: [{ champion: "Example", abilityTextHash: abilityTextHash(before[0]), patterns: [] }] } as unknown as ComboGuideFile;
  assert.deepEqual(comboDrift(guides, before, before), []);
  const next = structuredClone(before); next[0].spells[0].text = "3초 기절";
  const [change] = comboDrift(guides, before, next);
  assert.equal(change.baselineVerified, true);
  assert.equal(change.slots[0].numericOnly, true);
  assert.equal(change.status, "needs-review");
  next[0].spells[0].text = "3초 둔화";
  assert.equal(comboDrift(guides, before, next)[0].slots[0].numericOnly, false);
  assert.equal(comboDrift(guides, [], next)[0].baselineVerified, false);
});
