import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluationPaths } from "../../../scripts/advisor/kev-agent/evaluation_config";

test("experiment heads cannot silently fall back to shipped heads", () => {
  const paths = evaluationPaths("/repo", { JUDGE_HEAD_DIR: "/experiment/heads" });
  assert.deepEqual(paths.heads, ["/experiment/heads"]);
});

test("experiment cache and namespace leave the default cache separate", () => {
  const paths = evaluationPaths("/repo", {
    JUDGE_CACHE_FILE: "/experiment/cache.json", JUDGE_CACHE_NAMESPACE: "candidate-1",
  });
  assert.equal(paths.cache, "/experiment/cache.json");
  assert.equal(paths.namespace, "candidate-1");
  assert.equal(evaluationPaths("/repo", {}).namespace, "legacy");
});
