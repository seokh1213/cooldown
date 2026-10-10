import assert from "node:assert/strict";
import { test } from "node:test";
import {
  APP_STORAGE_KEYS,
  decodeFavoriteChampionIds,
  decodeSelectedChampions,
  decodeTabs,
  initializeAppStorage,
  readJsonStorage,
  readSessionStorage,
  type StorageLike,
  writeSessionStorage,
} from "../../../../src/infrastructure/storage/appStorage";

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const storage = new MemoryStorage();

test("초기화는 앱 소유 옛 키만 지우고 schema 를 적는다", () => {
  storage.setItem("another-pages-app", "keep-me");
  storage.setItem(APP_STORAGE_KEYS.tabs, "old-state");
  initializeAppStorage(storage);
  assert.equal(storage.getItem("another-pages-app"), "keep-me");
  assert.equal(storage.getItem(APP_STORAGE_KEYS.tabs), null);
  assert.equal(storage.getItem(APP_STORAGE_KEYS.schema), "2");
});

test("선택 챔피언을 읽는다", () => {
  storage.setItem(APP_STORAGE_KEYS.selectedChampions, JSON.stringify([{ id: "Ahri" }]));
  assert.deepEqual(
    readJsonStorage(APP_STORAGE_KEYS.selectedChampions, decodeSelectedChampions, storage),
    [{ id: "Ahri" }]
  );
});

test("탭은 올바르면 읽고 깨졌으면 지운다", () => {
  storage.setItem(APP_STORAGE_KEYS.tabs, JSON.stringify([
    { id: "valid", mode: "normal", champions: ["Ahri"] },
  ]));
  assert.equal(readJsonStorage(APP_STORAGE_KEYS.tabs, decodeTabs, storage)?.[0].id, "valid");
  storage.setItem(APP_STORAGE_KEYS.tabs, JSON.stringify([
    { id: "broken", mode: "normal", champions: ["Ahri", "Zed"] },
  ]));
  assert.equal(readJsonStorage(APP_STORAGE_KEYS.tabs, decodeTabs, storage), null);
  assert.equal(storage.getItem(APP_STORAGE_KEYS.tabs), null);
});

test("저장본의 VS 탭은 버리고 일반 탭만 읽는다", () => {
  storage.setItem(APP_STORAGE_KEYS.tabs, JSON.stringify([
    { id: "vs", mode: "vs", champions: ["Ahri", "Zed"] },
    { id: "normal", mode: "normal", champions: ["Ahri"] },
  ]));
  assert.deepEqual(
    readJsonStorage(APP_STORAGE_KEYS.tabs, decodeTabs, storage)?.map((tab) => tab.id),
    ["normal"],
  );
});

test("즐겨찾기는 중복을 빼고 깨졌으면 지운다", () => {
  storage.setItem(
    APP_STORAGE_KEYS.favoriteChampionIds,
    JSON.stringify(["Ahri", "Ahri", "MonkeyKing"]),
  );
  assert.deepEqual(
    readJsonStorage(
      APP_STORAGE_KEYS.favoriteChampionIds,
      decodeFavoriteChampionIds,
      storage,
    ),
    ["Ahri", "MonkeyKing"],
  );
  storage.setItem(APP_STORAGE_KEYS.favoriteChampionIds, JSON.stringify(["Ahri", 1]));
  assert.equal(
    readJsonStorage(
      APP_STORAGE_KEYS.favoriteChampionIds,
      decodeFavoriteChampionIds,
      storage,
    ),
    null,
  );
  assert.equal(storage.getItem(APP_STORAGE_KEYS.favoriteChampionIds), null);
});

test("세션 저장소를 쓰고 읽는다", () => {
  writeSessionStorage(APP_STORAGE_KEYS.championSelectorScroll, "320", storage);
  assert.equal(
    readSessionStorage(APP_STORAGE_KEYS.championSelectorScroll, storage),
    "320",
  );
});
