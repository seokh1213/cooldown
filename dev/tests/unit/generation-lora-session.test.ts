import assert from "node:assert/strict";
import { test } from "node:test";
import type { PreTrainedModel } from "@huggingface/transformers";
import { activeGates, forgetLoraSession, gates, getLoraSession, hideLoraInput, withGenerationAdapter,
  type OrtFeeds, type OrtSession } from "../../../src/features/advisor/worker/lora";

function modelWith(inputs: string[]) {
  const raw = { inputNames: inputs, run: async (feeds: OrtFeeds) => feeds };
  const model = { sessions: { model: raw as OrtSession & { inputNames: string[] } } };
  hideLoraInput(model as unknown as PreTrainedModel);
  return { model, raw };
}

async function values(feeds: OrtFeeds) {
  return Object.fromEntries(await Promise.all(Object.entries(feeds).map(async ([name, tensor]) =>
    [name, Array.from(await tensor.getData() as Float32Array)])));
}

test("generation proxy hides all gates and fills only the explicitly requested QA gate", async () => {
  try {
    const { model, raw } = modelWith(["input_ids", "lora_scale", "embed_scale", "qa_scale"]);
    assert.deepEqual(model.sessions.model.inputNames, ["input_ids"]);
    assert.equal(getLoraSession(), raw);
    const result = await withGenerationAdapter("grounded-numeric", () => model.sessions.model.run({}));
    assert.deepEqual(await values(result), { lora_scale: [0], embed_scale: [0], qa_scale: [1] });
    const ordinary = await model.sessions.model.run({});
    assert.deepEqual(await values(ordinary), { lora_scale: [0], embed_scale: [0], qa_scale: [0] });
  } finally { forgetLoraSession(); }
});

test("direct classifier and retrieval requests leave generation off", async () => {
  try {
    modelWith(["lora_scale", "embed_scale", "qa_scale"]);
    assert.deepEqual(await values(gates({ lora_scale: 1 })), { lora_scale: [1], embed_scale: [0], qa_scale: [0] });
    assert.deepEqual(await values(gates({ embed_scale: 1 })), { lora_scale: [0], embed_scale: [1], qa_scale: [0] });
  } finally { forgetLoraSession(); }
  assert.deepEqual(activeGates(), []);
});
