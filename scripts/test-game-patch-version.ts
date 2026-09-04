import assert from "node:assert/strict";
import { toOfficialPatchVersion } from "../src/lib/gamePatchVersion";

assert.equal(toOfficialPatchVersion("15.17.1"), "25.17");
assert.equal(toOfficialPatchVersion("16.17.1"), "26.17");
assert.equal(toOfficialPatchVersion("invalid"), "invalid");

console.log("✅ Official patch version formatting passed");
