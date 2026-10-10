import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolveStaticDataRelease,
  toOfficialPatchVersion,
} from "../../../../src/domain/game/static-data/staticDataRelease";

test("공식 패치 버전 변환", () => {
  assert.equal(toOfficialPatchVersion("15.17.1"), "25.17");
  assert.equal(toOfficialPatchVersion("14.24.1"), "14.24");
});

test("정적 데이터 릴리스 해석", () => {
  assert.deepEqual(resolveStaticDataRelease("16.17.1"), {
    patchVersion: "26.17",
    sources: { ddragon: "16.17.1", cdragon: "16.17" },
  });
});

test("고정 버전 없이 latest로 배포 자료를 해석하지 않는다", () => {
  assert.throws(() => resolveStaticDataRelease("latest"), /Invalid Data Dragon/);
});
