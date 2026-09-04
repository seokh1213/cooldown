import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Champion } from "../src/types";
import type { NormalizedChampion } from "../src/types/combatNormalized";
import { writeChampionV2Dataset } from "./data-pipeline/champion-v2-writer";

const champion = {
  id: "Test",
  key: "1",
  name: "시험",
  title: "테스트 챔피언",
  tags: ["Mage"],
  passive: {
    name: "지속 효과",
    description: "패시브",
    image: { full: "TestP.png" },
  },
  spells: ["Q", "W", "E", "R"].map((slot) => ({
    id: `Test${slot}`,
    name: slot,
    maxrank: 1,
    description: `${slot} 설명`,
    tooltip: `${slot} 본문`,
    cooldown: [8],
    cost: [40],
    costType: "마나",
    range: [500],
    image: { full: `Test${slot}.png` },
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

const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "champion-v2-writer-"));

try {
  const count = writeChampionV2Dataset({
    versionDir: outputRoot,
    patchVersion: "26.17",
    locale: "ko_KR",
    sources: { ddragon: "16.17.1", cdragon: "16.17" },
    championIds: ["Test"],
    normalizedChampions: [normalized],
    championsById: new Map([["Test", champion]]),
    spellDataByChampion: new Map([["Test", {}]]),
  });

  const detailPath = path.join(outputRoot, "champions", "ko_KR", "Test.json");
  const indexPath = path.join(outputRoot, "champions", "ko_KR", "index.json");
  assert.equal(count, 1);
  assert.equal(JSON.parse(fs.readFileSync(detailPath, "utf-8")).champion.id, "Test");
  assert.equal(JSON.parse(fs.readFileSync(indexPath, "utf-8")).champions.length, 1);
  assert.equal(fs.existsSync(path.join(outputRoot, "spells", "Test.json")), false);
} finally {
  fs.rmSync(outputRoot, { recursive: true, force: true });
}

console.log("✅ Champion v2 map writer passed");
