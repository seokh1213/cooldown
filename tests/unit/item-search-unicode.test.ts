import assert from "node:assert/strict";
import { test } from "node:test";
import { groupItemsByTier } from "../../src/pages/EncyclopediaPage/itemCatalogModel";
import type { NormalizedItem } from "../../src/types/combatNormalized";

function item(id: string, name: string, aliases: string[] = []): NormalizedItem {
  return {
    id, name, aliases, type: "item", price: 300, priceTotal: 300,
    tags: [], buildsFrom: [], buildsInto: [], stats: [], effects: [],
  };
}

function matches(items: NormalizedItem[], query: string): string[] {
  return Object.values(groupItemsByTier(items, query)).flat().map(({ id }) => id);
}

test("Chinese names and partial names exclude unrelated items", () => {
  const items = [item("3031", "无尽之刃", ["wjzr"]), item("1001", "鞋子", ["sdzx"])];
  assert.deepEqual(matches(items, "无尽之刃"), ["3031"]);
  assert.deepEqual(matches(items, "无尽"), ["3031"]);
  assert.deepEqual(matches(items, "不存在的装备"), []);
  assert.deepEqual(matches(items, "WJZR"), ["3031"]);
});

test("Korean names, initials, mixed initials, and aliases still filter", () => {
  const items = [item("1018", "민첩성의 망토"), item("1001", "장화", ["똥신"])];
  for (const query of ["민첩성", "ㅁㅊㅅ", "ㅁ첩성의 망토"]) {
    assert.deepEqual(matches(items, query), ["1018"]);
  }
  assert.deepEqual(matches(items, "똥신"), ["1001"]);
});

test("English punctuation, case, and abbreviations still filter", () => {
  const items = [item("1038", "B. F. Sword", ["bf"]), item("1055", "Doran's Blade")];
  assert.deepEqual(matches(items, "b f SWORD"), ["1038"]);
  assert.deepEqual(matches(items, "BF"), ["1038"]);
  assert.deepEqual(matches(items, "dorans"), ["1055"]);
  assert.equal(matches(items, "").length, 2);
});
