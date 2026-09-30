import assert from "node:assert/strict";
import { test } from "node:test";
import { partitionFavoriteChampions } from "../../src/components/features/championFavorites";

const champions = [
  { id: "Aatrox" },
  { id: "Ahri" },
  { id: "Akali" },
  { id: "MonkeyKing" },
];

const sections = partitionFavoriteChampions(
  champions,
  new Set(["MonkeyKing", "Ahri"]),
);

test("즐겨찾기는 원래 순서대로 앞 구획에 모인다", () => {
  assert.deepEqual(
    sections.favorites.map(({ id }) => id),
    ["Ahri", "MonkeyKing"],
    "Favorites should move to the first section without changing their relative order",
  );
});

test("나머지는 원래 순서를 유지한다", () => {
  assert.deepEqual(
    sections.others.map(({ id }) => id),
    ["Aatrox", "Akali"],
    "Non-favorites should remain in their original relative order",
  );
});
