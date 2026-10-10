import assert from "node:assert/strict";
import { test } from "node:test";
import { GenerationAdapter } from "../../../src/features/advisor/worker/generationAdapter";

test("numeric generation enables only QA and ordinary generation disables all adapters", async () => {
  const adapter = new GenerationAdapter();
  adapter.setInputs(["lora_scale", "embed_scale", "qa_scale"]);
  await adapter.run("grounded-numeric", async () => {
    assert.deepEqual(adapter.values(), { lora_scale: 0, embed_scale: 0, qa_scale: 1 });
  });
  await adapter.run(undefined, async () => {
    assert.deepEqual(adapter.values(), { lora_scale: 0, embed_scale: 0, qa_scale: 0 });
  });
});

test("failed generation clears QA before the next request", async () => {
  const adapter = new GenerationAdapter(); adapter.setInputs(["qa_scale"]);
  await assert.rejects(adapter.run("grounded-numeric", async () => { throw new Error("generation failed"); }));
  assert.deepEqual(adapter.values(), { qa_scale: 0 });
  await adapter.run("grounded-summary", async () => { assert.deepEqual(adapter.values(), { qa_scale: 0 }); });
});

test("legacy graphs keep normal generation and reject an unavailable QA adapter", async () => {
  const adapter = new GenerationAdapter(); adapter.setInputs(["lora_scale", "embed_scale"]);
  await adapter.run(undefined, async () => { assert.deepEqual(adapter.values(), { lora_scale: 0, embed_scale: 0 }); });
  await assert.rejects(adapter.run("grounded-numeric", async () => undefined), /준비되지/);
});

test("overlapping generation cannot change an active adapter", async () => {
  const adapter = new GenerationAdapter(); adapter.setInputs(["qa_scale"]);
  await adapter.run("grounded-numeric", async () => {
    await assert.rejects(adapter.run(undefined, async () => undefined), /하나씩/);
    assert.deepEqual(adapter.values(), { qa_scale: 1 });
  });
  assert.deepEqual(adapter.values(), { qa_scale: 0 });
});
