import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";

const runner = path.resolve("dev/scripts/advisor/translations/run-translation-background.sh");

function runWithMockTranslator(concurrency?: string): {
  status: number | null;
  stderr: string;
  calls: string[][];
} {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "translation-runner-test-"));
  const runDir = path.join(dir, "run");
  const binDir = path.join(dir, "bin");
  const trace = path.join(dir, "calls.jsonl");
  try {
    fs.mkdirSync(binDir);
    for (const tree of ["seed", "candidates"]) {
      for (const subdir of ["en_US", "zh_CN", "atoms", "note-translations"]) {
        fs.mkdirSync(path.join(runDir, tree, subdir), { recursive: true });
      }
      for (const lang of ["en_US", "zh_CN"]) {
        fs.writeFileSync(path.join(runDir, tree, "note-translations", `${lang}.json`), "{}");
      }
    }
    fs.writeFileSync(
      path.join(binDir, "npx"),
      '#!/usr/bin/env node\nconst fs = require("node:fs");\nfs.appendFileSync(process.env.RUN_TRACE, JSON.stringify(process.argv.slice(2)) + "\\n");\n',
      { mode: 0o755 },
    );
    const env: NodeJS.ProcessEnv = { ...process.env, RUN_DIR: runDir, RUN_TRACE: trace, PATH: `${binDir}${path.delimiter}${process.env.PATH}` };
    delete env.MATCHUP_CONCURRENCY;
    if (concurrency !== undefined) env.MATCHUP_CONCURRENCY = concurrency;
    const result = spawnSync("bash", [runner], { env, encoding: "utf8" });
    const calls = fs.existsSync(trace)
      ? fs.readFileSync(trace, "utf8").trim().split("\n").map((line) => JSON.parse(line) as string[])
      : [];
    return { status: result.status, stderr: result.stderr, calls };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("background runner applies four workers to both matchup languages", () => {
  const result = runWithMockTranslator();
  assert.equal(result.status, 0, result.stderr);
  const matchups = result.calls.filter((args) => args.includes("dev/scripts/advisor/translations/translate-matchups.ts"));
  assert.equal(matchups.length, 2);
  for (const args of matchups) assert.equal(args[args.indexOf("--concurrency") + 1], "4");
  const atoms = result.calls.filter((args) => args.includes("dev/scripts/advisor/translations/translate-atoms.ts"));
  for (const args of atoms) assert.equal(args[args.indexOf("--concurrency") + 1], "1");
});

test("background runner supports configured matchup worker counts", () => {
  for (const count of ["2", "8"]) {
    const result = runWithMockTranslator(count);
    assert.equal(result.status, 0, result.stderr);
    const matchups = result.calls.filter((args) => args.includes("dev/scripts/advisor/translations/translate-matchups.ts"));
    for (const args of matchups) assert.equal(args[args.indexOf("--concurrency") + 1], count);
  }
});

test("background runner rejects invalid concurrency before invoking translation", () => {
  for (const value of ["0", "9", "invalid"]) {
    const result = runWithMockTranslator(value);
    assert.equal(result.status, 2);
    assert.equal(result.calls.length, 0);
  }
});
