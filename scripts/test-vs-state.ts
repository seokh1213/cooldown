import assert from "node:assert/strict";
import { parseVsState, serializeVsState } from "../src/pages/VsPage/vsState";
import {
  rankCooldowns,
  cooldownRankCount,
  ACTIVE_SLOTS,
  isShorterCooldown,
} from "../src/pages/VsPage/vsCooldownTable";
import type { ChampionDetailV2 } from "../src/data/contracts/championData";
import { readFileSync } from "node:fs";
import { decodeDataManifest } from "../src/data/contracts/dataManifest";

const state = parseVsState(
  "a=Aatrox&t=Fiora&ah=25&th=10&ar=3.1.2.1&tr=1.1.1.1",
);
assert.equal(state.mine.id, "Aatrox");
assert.equal(isShorterCooldown(6, 8), true);
assert.equal(isShorterCooldown(0, 1), true);
assert.equal(isShorterCooldown(6, 6), false);
assert.equal(isShorterCooldown(8, 6), false);
assert.equal(isShorterCooldown(null, 6), false);
assert.equal(isShorterCooldown(6, null), false);
assert.equal(isShorterCooldown(NaN, 6), false);
assert.equal(isShorterCooldown(-1, 6), false);
assert.equal(state.opponent.id, "Fiora");
assert.deepEqual(parseVsState(serializeVsState(state)), state);
assert.deepEqual(parseVsState(""), {
  mine: { id: "" },
  opponent: { id: "" },
});
// Old shared links still select the pair, but rank selections no longer affect the table.
assert.equal(serializeVsState(state), "a=Aatrox&t=Fiora");
assert.deepEqual(parseVsState("ar=99.-2.NaN.2.5"), parseVsState(""));
assert.deepEqual(
  rankCooldowns({
    ability: { maxRank: 5 },
    values: [14, 12, 10, 8, 6],
    columns: 5,
  }),
  [14, 12, 10, 8, 6],
);
assert.deepEqual(
  rankCooldowns({
    ability: { maxRank: 3 },
    values: [120, 100, 80],
    columns: 5,
  }),
  [120, 100, 80, null, null],
);
assert.deepEqual(
  rankCooldowns({ ability: { maxRank: 3 }, values: [10], columns: 5 }),
  [10, 10, 10, null, null],
);
assert.deepEqual(
  rankCooldowns({
    ability: { maxRank: 5 },
    values: [0, NaN, -1, Infinity],
    columns: 5,
  }),
  [0, null, null, null, null],
);
assert.deepEqual(
  rankCooldowns({ ability: undefined, values: [10], columns: 5 }),
  [null, null, null, null, null],
);
assert.deepEqual(
  rankCooldowns({ ability: { maxRank: 5 }, values: [], columns: 5 }),
  [null, null, null, null, null],
);
const manifest = decodeDataManifest(
  JSON.parse(
    readFileSync(
      new URL("../public/data/version.json", import.meta.url),
      "utf8",
    ),
  ),
);
const champion = (id: string): ChampionDetailV2 =>
  JSON.parse(
    readFileSync(
      new URL(
        "../public/data/" +
          manifest.patchVersion +
          "/champions/ko_KR/" +
          id +
          ".json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
assert.equal(champion("Udyr").champion.abilities.R.maxRank, 6);
assert.equal(cooldownRankCount([]), 5);
assert.equal(cooldownRankCount([undefined, { maxRank: 3 }, { maxRank: 5 }]), 5);
assert.equal(cooldownRankCount(ACTIVE_SLOTS.map((slot) => champion("Udyr").champion.abilities[slot])), 6);
assert.equal(cooldownRankCount(ACTIVE_SLOTS.map((slot) => champion("Teemo").champion.abilities[slot])), 5);
const teemoR = champion("Teemo").champion.abilities.R;
assert.deepEqual(
  rankCooldowns({
    ability: teemoR,
    values: teemoR.rechargeSeconds ?? [],
    columns: 5,
  }),
  [35, 30, 25, null, null],
);
const swapped = { mine: state.opponent, opponent: state.mine };
assert.equal(parseVsState(serializeVsState(swapped)).mine.id, "Fiora");
assert.equal(parseVsState(serializeVsState(swapped)).opponent.id, "Aatrox");
console.log("✅ Independent VS state and all-rank cooldown table passed");
