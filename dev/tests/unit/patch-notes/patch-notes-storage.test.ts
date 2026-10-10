import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { archiveJson, readJson, writeJson } from "../../../scripts/patch-notes/storage";

test("소급 수집을 다시 실행해도 기존 원본 JSON을 보존한다", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "cooldown-patch-archive-"));
  try {
    const file = path.join(directory, "sources", "26.18.json");
    await archiveJson(file, { damage: [10, 20] });
    await archiveJson(file, { damage: [15, 25] });
    assert.deepEqual(await readJson(file), { damage: [10, 20] });
    assert.deepEqual(await fs.readdir(path.dirname(file)), ["26.18.json"]);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test("완성된 변경 보고서를 교체하고 임시 파일을 남기지 않는다", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "cooldown-patch-report-"));
  try {
    const file = path.join(directory, "index.json");
    assert.equal(await readJson(file), undefined);
    await writeJson(file, { latest: "26.18" });
    await writeJson(file, { latest: "26.19" });
    assert.deepEqual(await readJson(file), { latest: "26.19" });
    assert.deepEqual(await fs.readdir(directory), ["index.json"]);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
