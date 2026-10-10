import assert from "node:assert/strict";
import { test } from "node:test";
import { championReorderIndices } from "../../../../src/features/champions/comparison/table/reorderChampions";

const champions = [{ id: "Ahri" }, { id: "Lux" }, { id: "Jayce" }];

test("챔피언 드래그는 현재 목록의 시작·도착 인덱스를 반환한다", () => {
  assert.deepEqual(championReorderIndices(champions, "Jayce", "Ahri"), [2, 0]);
  assert.deepEqual(championReorderIndices(champions, "Ahri", "Lux"), [0, 1]);
});

test("같은 자리·취소·목록 밖 드래그는 순서를 바꾸지 않는다", () => {
  for (const [active, over] of [["Ahri", "Ahri"], ["Ahri", null], ["Missing", "Lux"], ["Ahri", "Missing"]] as const) {
    assert.equal(championReorderIndices(champions, active, over), undefined);
  }
});
