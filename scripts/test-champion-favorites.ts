import assert from "node:assert/strict";
import { partitionFavoriteChampions } from "../src/components/features/championFavorites";

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

assert.deepEqual(
  sections.favorites.map(({ id }) => id),
  ["Ahri", "MonkeyKing"],
  "Favorites should move to the first section without changing their relative order",
);
assert.deepEqual(
  sections.others.map(({ id }) => id),
  ["Aatrox", "Akali"],
  "Non-favorites should remain in their original relative order",
);

console.log("✅ Champion favorite partitioning passed");
