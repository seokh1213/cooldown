import assert from "node:assert/strict";
import { decodeDataManifest } from "../src/data/contracts/dataManifest";

const manifest = decodeDataManifest({
  schemaVersion: 2,
  patchVersion: "26.17",
  sources: { ddragon: "16.17.1", cdragon: "16.17" },
});
assert.equal(manifest.patchVersion, "26.17");
assert.equal(manifest.sources.ddragon, "16.17.1");
assert.equal(manifest.sources.cdragon, "16.17");
assert.throws(
  () => decodeDataManifest({ version: "26.17" }),
  /Unsupported static data manifest/
);

console.log("✅ Static data manifest v2 decoding passed");
