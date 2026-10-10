import assert from "node:assert/strict";
import { after, test, type TestContext } from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildSync } from "esbuild";
import type { AppRelease } from "../../../src/app/pwa/release";

const root = path.resolve(import.meta.dirname, "../../..");
const directory = mkdtempSync(path.join(tmpdir(), "cooldown-production-cache-"));
after(() => rmSync(directory, { recursive: true, force: true }));
const current = "a".repeat(32);
const next = "b".repeat(32);
const output = path.join(directory, "runtime.mjs");
buildSync({
  stdin: { resolveDir: root, loader: "ts", contents: [
    "export { createStaticDataClient } from './src/infrastructure/http/staticDataClient';",
    "export { GameDataRepository } from './src/infrastructure/repositories/gameDataRepository';",
    "export { ChampionRepository } from './src/infrastructure/repositories/championRepository';",
    "export { VersionedCache } from './src/infrastructure/cache/versionedCache';",
    "export { prepareReleaseData, trackStaticDataPath } from './src/app/pwa/staticDataRevision';",
  ].join("\n") },
  outfile: output, bundle: true, format: "esm", platform: "node", tsconfig: path.join(root, "tsconfig.json"),
  define: { "import.meta.env": JSON.stringify({ BASE_URL: "/", VITE_DATA_VERSION: current, VITE_RELEASE_ID: current }) },
});
const runtime: typeof import("../../../src/infrastructure/http/staticDataClient") &
  typeof import("../../../src/infrastructure/repositories/gameDataRepository") &
  typeof import("../../../src/infrastructure/repositories/championRepository") &
  typeof import("../../../src/infrastructure/cache/versionedCache") &
  typeof import("../../../src/app/pwa/staticDataRevision") = await import(pathToFileURL(output).href);
const manifest = JSON.parse(readFileSync(path.join(root, "public/data/version.json"), "utf8"));
const metadata = { ...manifest, locale: "ko_KR" };
const items = { ...metadata, items: [] };
const runes = { ...metadata, runes: [], statShards: [] };
const summoners = { ...metadata, spells: [] };
const detail = JSON.parse(readFileSync(path.join(root, `public/data/${manifest.patchVersion}/champions/ko_KR/Aatrox.json`), "utf8"));
const profile = { ...metadata, champion: { id: "Aatrox", name: "Aatrox", title: "", lore: "", skins: [] } };
const files: Record<string, unknown> = {
  "version.json": manifest,
  [`${manifest.patchVersion}/items-normalized-ko_KR.json`]: items,
  [`${manifest.patchVersion}/runes-normalized-ko_KR.json`]: runes,
  [`${manifest.patchVersion}/summoner-normalized-ko_KR.json`]: summoners,
  [`${manifest.patchVersion}/champions/ko_KR/Aatrox.json`]: detail,
  [`${manifest.patchVersion}/champion-profiles/ko_KR/Aatrox.json`]: profile,
};
const itemPath = `data/${manifest.patchVersion}/items-normalized-ko_KR.json`;
const candidate: AppRelease = { schemaVersion: 1, releaseId: next, appVersion: next, dataVersion: next, patchVersion: manifest.patchVersion };
const response = (value: unknown) => new Response(JSON.stringify(value));
const canonical = (version: string, file: string) => `/data/releases/${version}/${file}`;

function storage(t: TestContext) {
  const values = new Map<string, Response>();
  const absolute = (url: string | Request) => new URL(typeof url === "string" ? url : url.url, "https://app.test").href;
  const cache = {
    put: async (url: string | Request, value: Response) => { values.set(absolute(url), value.clone()); },
    match: async (url: string | Request) => values.get(absolute(url))?.clone(),
    delete: async (url: string | Request) => values.delete(absolute(url)),
    keys: async () => [...values.keys()].map((url) => new Request(url)),
  };
  for (const [key, value] of Object.entries({ caches: { open: async () => cache }, location: { origin: "https://app.test" } })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, key, previous);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
  return cache;
}

for (const [field, value] of [["schemaVersion", 999], ["patchVersion", "0.0"], ["locale", "en_US"], ["sources", { ddragon: "0.0.1", cdragon: "0.0" }]] as const) {
  test(`invalid ${field} cannot poison CacheFirst retries or valid offline data`, async (t) => {
    const cache = storage(t);
    const bad = { ...items, [field]: value };
    let repaired = false;
    let offline = false;
    const network: string[] = [];
    const fetcher = async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      const cached = await cache.match(url);
      if (cached) return cached;
      if (offline) throw new Error("offline");
      network.push(url);
      const value = response(repaired ? items : bad);
      await cache.put(url, value); // The real SW caches before the repository validates.
      return value;
    };
    const client = runtime.createStaticDataClient(fetcher, "/");
    const repo = new runtime.GameDataRepository(client, new runtime.VersionedCache("retry"));
    const url = canonical(current, `${manifest.patchVersion}/items-normalized-ko_KR.json`);
    await cache.put("/keep-offline-data", response({ safe: true }));
    await assert.rejects(repo.getItems(manifest, "ko_KR"));
    assert.equal(await cache.match(url), undefined);
    await cache.put(url, response(bad)); // Also reproduce a late SW cache write.
    repaired = true;
    assert.deepEqual(await repo.getItems(manifest, "ko_KR"), items);
    assert.equal(network.length, 2);
    assert.match(network[1], /\?cooldown-retry=/);
    offline = true;
    const fresh = new runtime.GameDataRepository(runtime.createStaticDataClient(fetcher, "/"), new runtime.VersionedCache("offline"));
    assert.deepEqual(await fresh.getItems(manifest, "ko_KR"), items);
    assert.equal(network.length, 2);
    assert.deepEqual(await (await cache.match("/keep-offline-data"))!.json(), { safe: true });
  });
}

test("wrong champion detail id is rejected for both downloaded and cached data", async (t) => {
  storage(t);
  const bad = { ...detail, champion: { ...detail.champion, id: "Ahri" } };
  let requests = 0;
  const cache = new runtime.VersionedCache("detail");
  const repo = new runtime.ChampionRepository({ getJson: async () => { requests += 1; return requests === 1 ? bad : detail; } }, cache);
  await assert.rejects(repo.getDetail(manifest, "ko_KR", "Aatrox"), /id mismatch/);
  assert.equal((await repo.getDetail(manifest, "ko_KR", "Aatrox")).champion.id, "Aatrox");
  const key = `champions:forms-v1:${manifest.patchVersion}:${manifest.sources.ddragon}:${manifest.sources.cdragon}:ko_KR:Aatrox`;
  cache.set(key, bad);
  assert.equal((await repo.getDetail(manifest, "ko_KR", "Aatrox")).champion.id, "Aatrox");
  assert.equal(requests, 3);
});

for (const failure of [
  { file: "version.json", value: { ...manifest, schemaVersion: 999 } },
  { file: "version.json", value: { ...manifest, patchVersion: "0.0" } },
  { file: `${manifest.patchVersion}/items-normalized-ko_KR.json`, value: { ...items, patchVersion: "0.0" } },
  { file: `${manifest.patchVersion}/runes-normalized-ko_KR.json`, value: { ...runes, locale: "en_US" } },
  { file: `${manifest.patchVersion}/summoner-normalized-ko_KR.json`, value: { ...summoners, spells: [{}] } },
  { file: `${manifest.patchVersion}/champions/ko_KR/Aatrox.json`, value: { ...detail, champion: { ...detail.champion, id: "Ahri" } } },
  { file: `${manifest.patchVersion}/champion-profiles/ko_KR/Aatrox.json`, value: { ...profile, sources: { ddragon: "0.0.1", cdragon: "0.0" } } },
]) {
  test(`release preparation validates and repairs ${failure.file} without losing offline data`, async (t) => {
    const cache = storage(t);
    let repaired = false;
    let offline = false;
    let requests = 0;
    for (const file of Object.keys(files)) runtime.trackStaticDataPath(`data/${file}`);
    runtime.trackStaticDataPath(itemPath);
    const invalidUrl = canonical(next, failure.file);
    await cache.put(canonical(current, `${manifest.patchVersion}/items-normalized-ko_KR.json`), response(items));
    await cache.put(invalidUrl, response(failure.value));
    t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "https://app.test");
      const cached = await cache.match(url.href);
      if (cached) return cached;
      if (offline) throw new Error("offline");
      requests += 1;
      const file = url.pathname.split(`/data/releases/${next}/`)[1];
      assert.ok(file in files, file);
      const value = response(!repaired && file === failure.file ? failure.value : files[file]);
      await cache.put(url.href, value);
      return value;
    });
    await assert.rejects(runtime.prepareReleaseData(candidate));
    assert.equal(await cache.match(invalidUrl), undefined);
    repaired = true;
    await runtime.prepareReleaseData(candidate);
    assert.deepEqual(await (await cache.match(invalidUrl))!.json(), files[failure.file]);
    assert.deepEqual(await (await cache.match(canonical(current, `${manifest.patchVersion}/items-normalized-ko_KR.json`)))!.json(), items);
    const beforeOffline = requests;
    offline = true;
    await runtime.prepareReleaseData(candidate);
    assert.equal(requests, beforeOffline);
  });
}
