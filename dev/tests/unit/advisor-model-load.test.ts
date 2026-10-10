import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { test } from "node:test";
import { promisify } from "node:util";

const runNode = promisify(execFile);

test("모델 적재 실패 후 재시도하고 동시 요청은 하나로 합친다", async () => {
  const source = `
    import assert from "node:assert/strict";
    import { mock } from "node:test";
    let tokenizerAttempts = 0;
    let modelAttempts = 0;
    const messages = [];
    const tokenizer = {};
    const model = {};
    mock.module("@huggingface/transformers", { exports: {
      AutoTokenizer: { from_pretrained: async (_id, options) => {
        tokenizerAttempts++;
        options.progress_callback({ status: "download", file: "attempt-" + tokenizerAttempts, loaded: 1, total: 2 });
        if (tokenizerAttempts === 1) throw new Error("tokenizer download failed");
        return tokenizer;
      } },
      AutoModelForCausalLM: { from_pretrained: async () => {
        modelAttempts++;
        if (modelAttempts === 1) throw new Error("model download failed");
        return model;
      } },
    } });
    mock.module("./src/features/advisor/worker/lora.ts", { exports: { hideLoraInput() {} } });
    mock.module("./src/features/advisor/worker/modelCache.ts", { exports: { installCache() {} } });
    mock.module("./src/features/advisor/worker/port.ts", { exports: { post(message) { messages.push(message); } } });
    const { load, getModel, getTokenizer } = await import("./src/features/advisor/worker/model.ts");
    const spec = { id: "test", dtype: "q4" };
    await assert.rejects(load(spec), /tokenizer download failed/);
    assert.equal(getTokenizer(), null);
    await assert.rejects(load(spec), /model download failed/);
    assert.equal(getTokenizer(), null);
    assert.equal(getModel(), null);
    await Promise.all([load(spec), load(spec)]);
    assert.equal(tokenizerAttempts, 3);
    assert.equal(modelAttempts, 2);
    assert.equal(getTokenizer(), tokenizer);
    assert.equal(getModel(), model);
    assert.equal(messages.filter(message => message.type === "loaded").length, 1);
    assert.deepEqual(messages.at(-2).files.map(file => file.file), ["attempt-3"]);
    await load(spec);
    assert.equal(modelAttempts, 2);
  `;
  const { stderr } = await runNode(process.execPath, [
    "--experimental-test-module-mocks",
    "--disable-warning=ExperimentalWarning",
    "--import", "tsx",
    "--input-type=module",
    "--eval", source,
  ], { cwd: new URL("../../../", import.meta.url) });
  assert.equal(stderr, "");
});
