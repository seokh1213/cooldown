import assert from "node:assert/strict";
import {
  APP_STORAGE_KEYS,
  decodeSelectedChampions,
  decodeTabs,
  initializeAppStorage,
  readJsonStorage,
  readSessionStorage,
  type StorageLike,
  writeSessionStorage,
} from "../src/data/storage/appStorage";

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const storage = new MemoryStorage();
storage.setItem("another-pages-app", "keep-me");
storage.setItem(APP_STORAGE_KEYS.tabs, "old-state");
initializeAppStorage(storage);
assert.equal(storage.getItem("another-pages-app"), "keep-me");
assert.equal(storage.getItem(APP_STORAGE_KEYS.tabs), null);
assert.equal(storage.getItem(APP_STORAGE_KEYS.schema), "2");

storage.setItem(APP_STORAGE_KEYS.selectedChampions, JSON.stringify([{ id: "Ahri" }]));
assert.deepEqual(
  readJsonStorage(APP_STORAGE_KEYS.selectedChampions, decodeSelectedChampions, storage),
  [{ id: "Ahri" }]
);
storage.setItem(APP_STORAGE_KEYS.tabs, JSON.stringify([
  { id: "valid", mode: "normal", champions: ["Ahri"] },
]));
assert.equal(readJsonStorage(APP_STORAGE_KEYS.tabs, decodeTabs, storage)?.[0].id, "valid");
storage.setItem(APP_STORAGE_KEYS.tabs, JSON.stringify([
  { id: "broken", mode: "vs", champions: ["Ahri"] },
]));
assert.equal(readJsonStorage(APP_STORAGE_KEYS.tabs, decodeTabs, storage), null);
assert.equal(storage.getItem(APP_STORAGE_KEYS.tabs), null);

writeSessionStorage(APP_STORAGE_KEYS.championSelectorScroll, "320", storage);
assert.equal(
  readSessionStorage(APP_STORAGE_KEYS.championSelectorScroll, storage),
  "320",
);

console.log("✅ App-owned storage migration and decoders passed");
