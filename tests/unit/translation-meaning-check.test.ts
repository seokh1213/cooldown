import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { requireStagingStore, translationMeaningVerdict } from "../../scripts/llm/lib/translation-meaning-check";

test("none retains structurally passed staging candidates without calling a checker", async () => {
  let calls = 0;
  const verdict = await translationMeaningVerdict("none", 2, async () => {
    calls += 1;
    throw new Error("checker must not run");
  });
  assert.equal(calls, 0);
  assert.deepEqual(verdict, { "0": true, "1": true });
});

test("no structurally passed candidates means no checker calls", async () => {
  for (const checker of ["none", "claude", "codex"]) {
    assert.deepEqual(await translationMeaningVerdict(checker, 0, async () => {
      throw new Error("checker must not run");
    }), {});
  }
});

for (const checker of ["claude", "codex", "sonnet"]) {
  test(`${checker} preserves accepted and rejected verdicts`, async () => {
    let calls = 0;
    const verdict = await translationMeaningVerdict(checker, 2, async () => {
      calls += 1;
      return 'Result: {"0":true,"1":false}';
    });
    assert.equal(calls, 1);
    assert.deepEqual(verdict, { "0": true, "1": false });
  });
}

test("unreadable checker reply retries once and retains the second verdict", async () => {
  let calls = 0;
  const verdict = await translationMeaningVerdict("codex", 1, async () => ++calls === 1 ? "{broken}" : '{"0":false}');
  assert.equal(calls, 2);
  assert.deepEqual(verdict, { "0": false });
});

test("two unreadable replies remain unavailable for caller rejection handling", async () => {
  let calls = 0;
  assert.equal(await translationMeaningVerdict("claude", 1, async () => {
    calls += 1;
    return "not JSON";
  }), undefined);
  assert.equal(calls, 2);
});

test("empty verdict preserves existing empty-reply handling without a retry", async () => {
  let calls = 0;
  assert.deepEqual(await translationMeaningVerdict("claude", 1, async () => {
    calls += 1;
    return "{}";
  }), {});
  assert.equal(calls, 1);
});

test("checker execution errors propagate without retry", async () => {
  let calls = 0;
  const failure = new Error("checker failed");
  await assert.rejects(translationMeaningVerdict("codex", 1, async () => {
    calls += 1;
    throw failure;
  }), failure);
  assert.equal(calls, 1);
});

test("retry execution errors also propagate", async () => {
  let calls = 0;
  const failure = new Error("retry failed");
  await assert.rejects(translationMeaningVerdict("claude", 1, async () => {
    calls += 1;
    if (calls === 1) return "not JSON";
    throw failure;
  }), failure);
  assert.equal(calls, 2);
});

test("none requires an explicit store outside knowledge and public", () => {
  for (const store of [undefined, "knowledge", "knowledge/atoms", "public/data/staging", "research/../knowledge/atoms"]) {
    assert.throws(() => requireStagingStore("none", store), /staging/);
  }
  requireStagingStore("none", "research/translation-runs/staging/atoms");
  requireStagingStore("none", "research/translation-runs/staging/notes/en_US.json");
  requireStagingStore("none", "knowledge-staging/atoms");
  requireStagingStore("claude", undefined);
  requireStagingStore("codex", "knowledge/atoms");
});

for (const script of ["translate-atoms", "polish-note-translations", "translate-matchups"]) {
  test(`${script} rejects unchecked default/live stores before any model can run`, () => {
    for (const storeArgs of [[], ["--store", "knowledge/atoms"]]) {
      assert.throws(() => execFileSync(process.execPath, [
        "--import", "tsx", `scripts/llm/${script}.ts`, "--checker", "none", ...storeArgs,
      ], { env: { ...process.env, PATH: "" }, stdio: "pipe" }), (error: unknown) => {
        const failure = error as { status: number; stderr: Buffer };
        assert.equal(failure.status, 1);
        assert.match(failure.stderr.toString(), /staging --store/);
        return true;
      });
    }
  });
}

test("matchup staging candidates cannot be emitted without semantic review", () => {
  assert.throws(() => execFileSync(process.execPath, [
    "--import", "tsx", "scripts/llm/translate-matchups.ts", "--checker", "none",
    "--store", "research/translation-runs/staging/matchups", "--emit",
  ], { env: { ...process.env, PATH: "" }, stdio: "pipe" }), (error: unknown) => {
    const failure = error as { status: number; stderr: Buffer };
    assert.equal(failure.status, 1);
    assert.match(failure.stderr.toString(), /staging 후보는 --emit/);
    return true;
  });
});
