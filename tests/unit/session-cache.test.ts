import assert from "node:assert/strict";
import { test } from "node:test";
import { createReleaseCache } from "../../src/data/cache/releaseCache";
import { getSessionCacheStorage } from "../../src/data/cache/versionedCache";

test("세션 저장소 접근이 막혀도 저장소를 불러오고 메모리에 캐시한다", async (t) => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  t.after(() => {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      get sessionStorage() {
        throw new DOMException("Storage denied", "SecurityError");
      },
    },
  });

  assert.equal(getSessionCacheStorage(), undefined);
  const { ChampionRepository } = await import("../../src/data/repositories/championRepository");
  const identity = {
    patchVersion: "26.17",
    sources: { ddragon: "16.17.1", cdragon: "16.17" },
  };
  const getJson = t.mock.fn(async () => ({
    ...identity,
    schemaVersion: 2,
    locale: "ko_KR",
    champions: [{ id: "Test", key: "1", name: "시험", title: "", iconFile: "Test.png" }],
  }));
  const repository = new ChampionRepository({ getJson }, createReleaseCache());

  const first = await repository.getIndex(identity, "ko_KR");
  assert.equal(first.champions[0].name, "시험");
  assert.equal(await repository.getIndex(identity, "ko_KR"), first);
  assert.equal(getJson.mock.callCount(), 1);
});
