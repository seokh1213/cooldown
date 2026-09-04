import assert from "node:assert/strict";
import { VersionedCache, type CacheStorage } from "../src/data/cache/versionedCache";
import { GameDataRepository } from "../src/data/repositories/gameDataRepository";
import type { StaticDataClient } from "../src/data/http/staticDataClient";

const metadata = {
  schemaVersion: 2,
  patchVersion: "26.17",
  locale: "ko_KR",
  sources: { ddragon: "16.17.1", cdragon: "16.17" },
} as const;

const itemResponse = {
    ...metadata,
    items: [{
      id: "1001", type: "item", name: "장화", price: 300, priceTotal: 300,
      tags: [], buildsFrom: [], buildsInto: [], stats: [], effects: [],
    }],
};

const responses: Record<string, unknown> = {
  "data/26.17/items-normalized-ko_KR.json": itemResponse,
  "data/26.17/runes-normalized-ko_KR.json": {
    ...metadata,
    runes: [{
      id: "8005", type: "rune", name: "집중 공격", pathId: 8000,
      slotIndex: 0, stats: [],
    }],
    statShards: [{
      id: "5001", type: "statShard", name: "체력", rowIndex: 0,
      columnIndex: 0, stats: [],
    }],
  },
  "data/26.17/summoner-normalized-ko_KR.json": {
    ...metadata,
    spells: [{
      id: "SummonerFlash", key: "4", name: "점멸", tooltip: "이동합니다.",
      cooldown: [300], iconPath: "SummonerFlash.png", modes: ["CLASSIC"],
    }],
  },
};

const requests: string[] = [];
const client: StaticDataClient = {
  async getJson(path) {
    requests.push(path);
    await Promise.resolve();
    return responses[path];
  },
};
const repository = new GameDataRepository(
  client,
  new VersionedCache("test:game-data")
);

const [firstRunes, secondRunes] = await Promise.all([
  repository.getRunes("26.17", "ko_KR"),
  repository.getRunes("26.17", "ko_KR"),
]);
assert.equal(firstRunes, secondRunes);
assert.equal(requests.filter((path) => path.includes("runes-")).length, 1);
assert.equal((await repository.getItems("26.17", "ko_KR")).items[0].name, "장화");
assert.equal(
  (await repository.getSummoners("26.17", "ko_KR")).spells[0].name,
  "점멸"
);

const mismatchClient: StaticDataClient = {
  async getJson() {
    return { ...itemResponse, locale: "en_US" };
  },
};
await assert.rejects(
  new GameDataRepository(
    mismatchClient,
    new VersionedCache("test:mismatch")
  ).getItems("26.17", "ko_KR"),
  /identity mismatch/
);

const failingStorage: CacheStorage = {
  get length(): number { throw new Error("disabled"); },
  getItem() { throw new Error("disabled"); },
  setItem() { throw new Error("quota"); },
  removeItem() { throw new Error("disabled"); },
  key() { throw new Error("disabled"); },
};
const resilientCache = new VersionedCache("test:resilient", failingStorage);
assert.equal(resilientCache.get("missing", (value) => value), undefined);
assert.deepEqual(resilientCache.set("available", { ok: true }), { ok: true });
assert.deepEqual(resilientCache.get("available", (value) => value), { ok: true });
resilientCache.clearExceptPatch("26.17");

console.log("✅ Game data repository, decoder, dedupe, and cache resilience passed");
