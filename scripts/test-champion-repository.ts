import assert from "node:assert/strict";
import { VersionedCache, type CacheStorage } from "../src/data/cache/versionedCache";
import { ChampionRepository } from "../src/data/repositories/championRepository";
import type { StaticDataClient } from "../src/data/http/staticDataClient";

class MemoryStorage implements CacheStorage {
  private readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
}

const requests: string[] = [];
const client: StaticDataClient = {
  async getJson(path) {
    requests.push(path);
    return {
      schemaVersion: 2,
      patchVersion: "26.17",
      locale: "ko_KR",
      sources: { ddragon: "16.17.1", cdragon: "16.17" },
      champions: [
        { id: "Test", key: "1", name: "시험", title: "", iconFile: "Test.png" },
      ],
    };
  },
};
const storage = new MemoryStorage();
const repository = new ChampionRepository(
  client,
  new VersionedCache("test:v2", storage)
);

const first = await repository.getIndex("26.17", "ko_KR");
const second = await repository.getIndex("26.17", "ko_KR");
assert.equal(first.champions[0].name, "시험");
assert.equal(second, first);
assert.deepEqual(requests, ["data/26.17/champions/ko_KR/index.json"]);

storage.setItem("test:v2:champions:25.24:ko_KR:index", "{}");
repository.clearExceptPatch("26.17");
assert.equal(storage.getItem("test:v2:champions:25.24:ko_KR:index"), null);

console.log("✅ Champion repository path and versioned cache passed");
