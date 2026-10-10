import assert from "node:assert/strict";
import test from "node:test";
import { codexUsageFromJson, groupMatchupJobs, maskNameOccurrences } from "../../../scripts/advisor/translations/matchup-translation-runtime";

test("Codex usage parser retains only token counts from the final event", () => {
  const events = [
    JSON.stringify({ type: "thread.started", thread_id: "must-not-escape" }),
    JSON.stringify({ type: "turn.completed", usage: { input_tokens: 1200, cached_input_tokens: 900, output_tokens: 180 } }),
  ].join("\n");
  assert.deepEqual(codexUsageFromJson(events), { input_tokens: 1200, cached_input_tokens: 900, output_tokens: 180 });
});

test("Codex usage parser handles malformed and empty output", () => {
  assert.equal(codexUsageFromJson("not-json\n{}"), undefined);
});

test("known ability names do not create a nested item-name match", () => {
  const source = "수호자의 성소를 깔고, 수호자를 구매합니다.";
  const masked = maskNameOccurrences(source, ["수호자의 성소"]);
  assert.ok(!masked.includes("수호자의 성소"));
  assert.ok(masked.includes("수호자를 구매합니다"));
});

test("matchup groups preserve eight-pair batches and cap pathological section counts", () => {
  const jobs = Array.from({ length: 65 }, (_, i) => ({ enemy: `Enemy${Math.floor(i / 8)}`, slot: `${i}` }));
  const groups = groupMatchupJobs(jobs, 8, 64);
  assert.ok(groups.every((group) => group.length <= 64));
  assert.equal(groups.flat().length, jobs.length);
});
