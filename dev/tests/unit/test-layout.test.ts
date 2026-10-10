/**
 * 시험 파일 자리 점검
 *
 * `npm test` 는 `dev/tests/unit/*.test.ts` 와 `dev/tests/data/*.test.ts` 만 모은다. 다른 곳에 둔 시험은
 * 오류 없이 빠진다. 예전 자리(`dev/scripts/test-*.ts`)나 하위 폴더에 두면 여기서 멈춘다.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { test } from "node:test";

const root = process.cwd();

test("dev/scripts/ 에 예전 방식 시험 파일이 없다", () => {
  const stray = fs.readdirSync(path.join(root, "dev/scripts")).filter((name) => /^test-.*\.ts$/.test(name));
  assert.deepEqual(stray, [], "dev/tests/unit 이나 dev/tests/data 로 옮겨 <이름>.test.ts 로 둔다");
});

test("dev/tests/ 아래 시험 파일은 unit·data 바로 아래에만 있다", () => {
  const misplaced = fs
    .readdirSync(path.join(root, "dev/tests"), { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".test.ts"))
    .filter((file) => !/^(unit|data)\/[^/]+\.test\.ts$/.test(file.split(path.sep).join("/")));
  assert.deepEqual(misplaced, []);
});
