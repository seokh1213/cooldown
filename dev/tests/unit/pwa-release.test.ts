import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { createBuildRelease } from "../../scripts/build/pwa/buildRelease";
import { decodeAppRelease, revisionedDataPath } from "../../../src/app/pwa/release";

const root = mkdtempSync(path.join(tmpdir(), "cooldown-release-hash-"));
after(() => rmSync(root, { recursive: true, force: true }));
const write = (file: string, contents: string) => {
  const target = path.join(root, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, contents);
};
const build = () => createBuildRelease(root, path.join(root, "public"), "production").release;

for (const file of ["index.html", "dev/config/vite.config.ts", "package-lock.json", "src/main.ts", "dev/scripts/build/pwa/bridge.ts"]) write(file, "initial");
write("public/data/version.json", JSON.stringify({ schemaVersion: 2, patchVersion: "26.18", sources: { ddragon: "16.18.1", cdragon: "16.18" } }));
write("public/data/26.18/example.json", '{"description":"old"}');
write("public/logo.svg", "old asset");
const initial = build();

test("변경 없는 재빌드는 같은 릴리스를 낸다", () => {
  assert.deepEqual(build(), initial, "An unchanged rebuild must not trigger another update");
  assert.deepEqual(decodeAppRelease(initial), initial);
});

test("데이터·앱·에셋 변경은 해당 버전만 바꾼다", () => {
  write("public/data/26.18/example.json", '{"description":"corrected"}');
  const dataChange = build();
  assert.equal(dataChange.appVersion, initial.appVersion);
  assert.notEqual(dataChange.dataVersion, initial.dataVersion);
  assert.notEqual(dataChange.releaseId, initial.releaseId);
  assert.equal(dataChange.patchVersion, initial.patchVersion);
  write("src/main.ts", "updated app");
  const appChange = build();
  assert.notEqual(appChange.appVersion, dataChange.appVersion);
  assert.equal(appChange.dataVersion, dataChange.dataVersion);
  write("public/logo.svg", "new asset");
  assert.notEqual(build().appVersion, appChange.appVersion);

  assert.notEqual(revisionedDataPath("data/26.18/example.json", initial.dataVersion), revisionedDataPath("data/26.18/example.json", dataChange.dataVersion));
});

test("데이터 경로는 dataVersion 으로 불변 URL 이 된다", () => {
  assert.equal(revisionedDataPath("data/version.json", initial.dataVersion), `data/releases/${initial.dataVersion}/version.json`);
  assert.equal(revisionedDataPath("data/version.json", "dev"), "data/version.json");
});

test("잘못된 릴리스 매니페스트는 거부한다", () => {
  assert.throws(() => decodeAppRelease({ ...initial, dataVersion: "../../other" }));
  assert.throws(() => decodeAppRelease({ ...initial, patchVersion: "unknown" }));
  assert.throws(() => decodeAppRelease(null));
});
