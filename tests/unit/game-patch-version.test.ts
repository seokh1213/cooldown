import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolveStaticDataRelease,
  toCommunityDragonVersion,
  patchLabel,
  toOfficialPatchVersion,
} from "../../src/lib/staticDataRelease";

test("공식 패치 버전 변환", () => {
  assert.equal(toOfficialPatchVersion("15.17.1"), "25.17");
  assert.equal(toOfficialPatchVersion("16.17.1"), "26.17");
});

test("CDragon 버전 변환", () => {
  assert.equal(toCommunityDragonVersion("16.17.1"), "16.17");
});

test("정적 데이터 릴리스 해석", () => {
  assert.deepEqual(resolveStaticDataRelease("16.17.1"), {
    patchVersion: "26.17",
    sources: { ddragon: "16.17.1", cdragon: "16.17" },
  });
});

for (const invalid of ["invalid", "latest", "16.17", "16.17.x"]) {
  test(`잘못된 Data Dragon 버전 거부: ${invalid}`, () => {
    assert.throws(() => resolveStaticDataRelease(invalid), /Invalid Data Dragon/);
  });
}

test("패치 라벨", () => {
  assert.equal(patchLabel("26.19"), "v26.19");
});
