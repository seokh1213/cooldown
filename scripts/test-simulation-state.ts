import assert from "node:assert/strict";
import {
  parseSimulationSearch,
  serializeSimulationState,
  type SimulationUrlState,
} from "../src/pages/simulationState";

const state: SimulationUrlState = {
  patchVersion: "26.17",
  attackerId: "MonkeyKing",
  targetId: "Garen",
  attackerLevel: 11,
  targetLevel: 10,
  itemIds: ["3115", null, "3078", null, null, null],
  summonerIds: ["SummonerFlash", "SummonerDot"],
  runeId: "CheapShot",
  ranks: { Q: 5, W: 1, E: 3, R: 2 },
  counts: { AA: 2, Q: 1, "item:3115:on-hit": 1 },
  excludedActions: ["item:3115:on-hit"],
  defense: {
    health: 1250,
    armor: 80,
    magicResist: 55,
    damageReductionPercent: 10,
  },
};

const restored = parseSimulationSearch(serializeSimulationState(state));
assert.deepEqual(restored, state);

const invalid = parseSimulationSearch("?al=99&tl=-2&sr=Q:99.W:-1&hp=-5&ar=5000&off=Q");
assert.equal(invalid.attackerLevel, 18);
assert.equal(invalid.targetLevel, 1);
assert.deepEqual(invalid.ranks, { Q: 6, W: 0, E: 1, R: 1 });
assert.deepEqual(invalid.defense, {
  health: 0,
  armor: 1000,
  magicResist: 0,
  damageReductionPercent: 0,
});

const defaults = parseSimulationSearch("");
assert.equal(defaults.attackerLevel, 18);
assert.equal(defaults.targetLevel, 18);

console.log("✅ Simulation URL state codec passed");
