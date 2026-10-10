import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { test } from "node:test";
import { promisify } from "node:util";

const source = `
  import assert from "node:assert/strict";
  import { mock } from "node:test";
  let loading = Promise.resolve();
  let resolveLoad;
  let duringGeneration;
  const encoded = [];
  const responses = [];
  const generations = [];
  const purposes = [];
  class Stopper { interrupted = false; interrupt() { this.interrupted = true; } }
  class Streamer { constructor(_tokenizer, options) { this.callback = options.callback_function; } }
  const tokenizer = { apply_chat_template(messages) {
    encoded.push(messages);
    return { input_ids: { dims: [1, messages.reduce((sum, message) => sum + message.content.length, 0)] } };
  } };
  const model = { async generate(options) {
    generations.push(options);
    assert.ok(options.input_ids.dims[1] <= 1900);
    assert.equal(options.stopping_criteria.interrupted, false);
    options.streamer.callback("answer");
    duringGeneration?.(options);
  } };
  mock.module("@huggingface/transformers", { exports: { InterruptableStoppingCriteria: Stopper, TextStreamer: Streamer } });
  mock.module("./src/features/advisor/worker/model.ts", { exports: { getModel: () => model, getTokenizer: () => tokenizer, load: () => loading } });
  mock.module("./src/features/advisor/worker/lora.ts", { exports: { withGenerationAdapter: (purpose, operation) => { purposes.push(purpose); return operation(); } } });
  mock.module("./src/features/advisor/worker/port.ts", { exports: { post(message) { responses.push(message); } } });
  const { generate, stopGeneration } = await import("./src/features/advisor/worker/generate.ts");
  const request = (id, content) => ({ type: "generate", id, model: { id: "test", dtype: "q4" }, messages: [{ role: "user", content }] });
  loading = new Promise(resolve => { resolveLoad = resolve; });
  const pending = generate(request(1, "question"));
  stopGeneration(); resolveLoad(); await pending;
  assert.equal(generations.length, 0);
  assert.equal(purposes.length, 0);
  assert.deepEqual(responses.at(-1), { type: "done", id: 1, text: "", tokens: 0, seconds: 0 });
  loading = Promise.resolve();
  await generate(request(2, "new question"));
  assert.equal(responses.at(-1).text, "answer");
  duringGeneration = options => { stopGeneration(); assert.equal(options.stopping_criteria.interrupted, true); };
  await generate(request(3, "stop during stream"));
  assert.equal(responses.at(-1).type, "done");
  assert.equal(responses.at(-1).text, "answer");
  duringGeneration = undefined;
  await generate(request(4, "next question"));
  const attempts = generations.length;
  await assert.rejects(generate(request(5, "x".repeat(1901))), /1900토큰/);
  assert.equal(generations.length, attempts);
  await generate(request(6, "x".repeat(1900)));
  assert.equal(generations.at(-1).input_ids.dims[1], 1900);
  await generate({ ...request(7, "latest question"), system: "s".repeat(5000) });
  assert.equal(encoded.at(-1).at(-1).content, "latest question");
  await generate({ ...request(8, "latest"), messages: [
    { role: "user", content: "old".repeat(1000) },
    { role: "assistant", content: "old".repeat(1000) },
    { role: "user", content: "latest" },
  ] });
  assert.deepEqual(encoded.at(-1), [{ role: "user", content: "latest" }]);
  const before = responses.length;
  await generate({ ...request(9, "numeric"), purpose: "grounded-numeric", maxTokens: 100 });
  assert.equal(purposes.at(-1), "grounded-numeric");
  assert.equal(generations.at(-1).max_new_tokens, 24);
  assert.equal(generations.at(-1).repetition_penalty, 1);
  assert.equal(generations.at(-1).no_repeat_ngram_size, 0);
  assert.ok(responses.slice(before).every(message => message.type !== "chunk"));
`;

test("적재 중 중단을 유지하고 긴 질문은 의미를 자르지 않고 GPU 실행 전에 거절한다", async () => {
  const { stderr } = await promisify(execFile)(process.execPath, [
    "--experimental-test-module-mocks", "--disable-warning=ExperimentalWarning",
    "--import", "tsx", "--input-type=module", "--eval", source,
  ], { cwd: new URL("../../../", import.meta.url) });
  assert.equal(stderr, "");
});
