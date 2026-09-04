import assert from "node:assert/strict";
import { getCommunityDragonSpellData } from "../src/services/api";

const originalFetch = globalThis.fetch;
let requestedUrl = "";

globalThis.fetch = async (input) => {
  requestedUrl = String(input);
  return new Response(JSON.stringify({
    ddragonVersion: "16.17.1",
    cdragonVersion: "16.17",
    spellData: {
      MonkeyKingDoubleAttack: {
        DataValues: {
          AttackRangeBonus: [125, 135, 145, 155, 165, 175, 185],
        },
      },
    },
  }), { status: 200 });
};

try {
  const result = await getCommunityDragonSpellData("MonkeyKing", "26.17");
  assert.ok(requestedUrl.endsWith("/data/26.17/spells/MonkeyKing.json"));
  assert.deepEqual(result.spellDataMap.MonkeyKingDoubleAttack, {
    DataValues: {
      AttackRangeBonus: [125, 135, 145, 155, 165, 175, 185],
    },
  });
  assert.equal(result.ddragonVersion, "16.17.1");
  assert.equal(result.cdragonVersion, "16.17");
} finally {
  globalThis.fetch = originalFetch;
}

console.log("✅ Legacy CommunityDragon spell path passed");
