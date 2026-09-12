import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createBuildRelease } from "./pwa/buildRelease";
import { decodeAppRelease, revisionedDataPath } from "../src/pwa/release";

const root = mkdtempSync(path.join(tmpdir(), "cooldown-release-hash-"));
const write = (file: string, contents: string) => {
  const target = path.join(root, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, contents);
};
const build = () => createBuildRelease(root, path.join(root, "public"), "production").release;

try {
  for (const file of ["index.html", "vite.config.ts", "package-lock.json", "src/main.ts", "scripts/pwa/bridge.ts"]) write(file, "initial");
  write("public/data/version.json", JSON.stringify({ schemaVersion: 2, patchVersion: "26.18", sources: { ddragon: "16.18.1", cdragon: "16.18" } }));
  write("public/data/26.18/example.json", '{"description":"old"}');
  write("public/logo.svg", "old asset");
  const initial = build();
  assert.deepEqual(build(), initial, "An unchanged rebuild must not trigger another update");
  assert.deepEqual(decodeAppRelease(initial), initial);

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

  assert.equal(revisionedDataPath("data/version.json", initial.dataVersion), `data/releases/${initial.dataVersion}/version.json`);
  assert.notEqual(revisionedDataPath("data/26.18/example.json", initial.dataVersion), revisionedDataPath("data/26.18/example.json", dataChange.dataVersion));
  assert.equal(revisionedDataPath("data/version.json", "dev"), "data/version.json");
  assert.throws(() => decodeAppRelease({ ...initial, dataVersion: "../../other" }));
  assert.throws(() => decodeAppRelease({ ...initial, patchVersion: "unknown" }));
  assert.throws(() => decodeAppRelease(null));
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log("PWA release hashing, immutable URLs and manifest validation passed.");
