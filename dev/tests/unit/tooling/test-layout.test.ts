/**
 * 시험 파일 자리 점검
 *
 * npm test는 unit·data의 기능별 하위 폴더까지 실행한다.
 * 단위·데이터 시험을 다른 실행 영역에 놓으면 여기서 멈춘다.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { test } from "node:test";
import ts from "typescript";

const root = process.cwd();

test("dev/scripts/ 에 예전 방식 시험 파일이 없다", () => {
  const stray = fs.readdirSync(path.join(root, "dev/scripts")).filter((name) => /^test-.*\.ts$/.test(name));
  assert.deepEqual(stray, [], "dev/tests/unit 이나 dev/tests/data 로 옮겨 <이름>.test.ts 로 둔다");
});

test("dev/tests/ 아래 시험 파일은 unit·data 실행 영역에 속한다", () => {
  const misplaced = fs
    .readdirSync(path.join(root, "dev/tests"), { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".test.ts"))
    .filter((file) => !path.matchesGlob(file.split(path.sep).join("/"), "{unit,data}/**/*.test.ts"));
  assert.deepEqual(misplaced, []);
});

test("npm test가 기능별 하위 폴더의 시험도 실행한다", () => {
  const { scripts } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  for (const tier of ["unit", "data"]) {
    assert.ok(scripts.test.includes(`dev/tests/${tier}/**/*.test.ts`));
    assert.ok(scripts[`test:${tier}`].includes(`dev/tests/${tier}/**/*.test.ts`));
  }
});

test("앱 코드가 개발 스크립트의 구현이나 타입을 가져오지 않는다", () => {
  const misplaced: string[] = [];
  const files = fs.readdirSync(path.join(root, "src"), { recursive: true, encoding: "utf8" });
  for (const file of files.filter(file => /\.(ts|tsx)$/.test(file))) {
    const sourceFile = path.join(root, "src", file);
    const tree = ts.createSourceFile(sourceFile, fs.readFileSync(sourceFile, "utf8"), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      if (ts.isStringLiteral(node) && node.text.startsWith(".")) {
        const destination = path.resolve(path.dirname(sourceFile), node.text);
        if (destination.startsWith(path.join(root, "dev/scripts") + path.sep)) {
          misplaced.push(`${file}: ${node.text}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
  }
  assert.deepEqual(misplaced, [], "앱과 생성기가 함께 쓰는 계약은 src/domain이 소유한다");
});
