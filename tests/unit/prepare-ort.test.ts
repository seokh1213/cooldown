import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const runNode = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const script = path.join(repositoryRoot, "scripts/prepare-ort.ts");
const files = [
  "ort-wasm-simd-threaded.asyncify.mjs",
  "ort-wasm-simd-threaded.asyncify.wasm",
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.wasm",
];

test("크기가 같은 오래된 ORT 내용을 교체하고 같은 내용은 다시 쓰지 않는다", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "cooldown-ort-"));
  const source = path.join(directory, "node_modules/onnxruntime-web/dist");
  const target = path.join(directory, "public/ort");
  const prepare = () => runNode(process.execPath, [
    "--import", "tsx", "--input-type=module", "--eval",
    `process.chdir(${JSON.stringify(directory)}); await import(${JSON.stringify(script)});`,
  ], { cwd: repositoryRoot });
  try {
    await mkdir(source, { recursive: true });
    await mkdir(target, { recursive: true });
    for (const file of files) {
      await writeFile(path.join(source, file), "new runtime");
      await writeFile(path.join(target, file), "old runtime");
    }
    const copied = await prepare();
    assert.equal(copied.stderr, "");
    for (const file of files) {
      assert.equal(await readFile(path.join(target, file), "utf8"), "new runtime");
      await utimes(path.join(target, file), 946684800, 946684800);
    }
    await prepare();
    for (const file of files) assert.equal((await stat(path.join(target, file))).mtimeMs, 946684800000);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
