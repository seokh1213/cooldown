import assert from "node:assert/strict";
import {
  resolveStaticDataRelease,
  toCommunityDragonVersion,
  toOfficialPatchVersion,
} from "../src/lib/staticDataRelease";

assert.equal(toOfficialPatchVersion("15.17.1"), "25.17");
assert.equal(toOfficialPatchVersion("16.17.1"), "26.17");
assert.equal(toCommunityDragonVersion("16.17.1"), "16.17");
assert.deepEqual(resolveStaticDataRelease("16.17.1"), {
  patchVersion: "26.17",
  sources: { ddragon: "16.17.1", cdragon: "16.17" },
});
for (const invalid of ["invalid", "latest", "16.17", "16.17.x"]) {
  assert.throws(() => resolveStaticDataRelease(invalid), /Invalid Data Dragon/);
}

console.log("✅ Official patch version formatting passed");
