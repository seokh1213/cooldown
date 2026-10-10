import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

test("첫 질문과 여러 상성의 평가도 맥락을 보존한 빈 정답 초안으로 내보낸다", () => {
  const directory = mkdtempSync(join(tmpdir(), "advisor-feedback-"));
  try {
    const file = join(directory, "feedback.json");
    const prior = { patch: "test", conditions: [], matchups: [{ mine: "MonkeyKing", enemy: "Rumble", conditions: [] },
      { mine: "MonkeyKing", enemy: "Mordekaiser", conditions: [] }] };
    writeFileSync(file, JSON.stringify({ feedback: [
      { question: "챔피언 100개 비교", rating: "down", trace: { judge: "offline", parts: [], rejected: "scope" } },
      { question: "둘 다 아이템은?", rating: "down", previousMemory: prior, trace: { judge: "offline", parts: [] } },
    ] }));
    const output = execFileSync(process.execPath, ["--import", "tsx", "dev/scripts/advisor/kev-agent/feedback-to-tests.ts", file], { encoding: "utf8" });
    const rows = output.trim().split("\n").map(line => JSON.parse(line));
    assert.equal(rows.length, 2);
    assert.equal(rows[0].trace.rejected, "scope");
    assert.deepEqual(rows[1].previousMemory.matchups, prior.matchups);
    assert.ok(rows.every(row => row.expected === null && row.act === ""));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
