import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { test } from "node:test";
import { promisify } from "node:util";

const source = `
  import assert from "node:assert/strict";
  import { mock } from "node:test";
  let handle;
  let failure;
  let modelReady = true;
  let prefixReady = true;
  let hiddenReady = true;
  let sessionReady = true;
  const responses = [];
  const calls = [];
  const generatedIds = [];
  let blocked;
  const spec = { id: "test", dtype: "q4" };
  const run = async (type, id) => {
    calls.push(type);
    if (blocked) await blocked;
    if (failure) throw failure;
    if (!modelReady) modelReady = true;
    assert.equal(prefixReady || hiddenReady || sessionReady, false);
    responses.push({ type: "success", id });
  };
  mock.module("@huggingface/transformers", { exports: { env: { backends: { onnx: {} } } } });
  mock.module("./src/workers/advisor/model.ts", { exports: {
    load: async () => { if (failure) throw failure; modelReady = true; },
    releaseModel() { modelReady = false; },
  } });
  mock.module("./src/workers/advisor/generate.ts", { exports: {
    generate: (request) => { generatedIds.push(request.id); return run("generate", request.id); },
    stopGeneration() { calls.push("stop"); },
  } });
  mock.module("./src/workers/advisor/logitJudge.ts", { exports: {
    forgetJudgePrefix() { prefixReady = false; }, judge: (id) => run("judge", id),
  } });
  mock.module("./src/workers/advisor/lora.ts", { exports: {
    forgetLoraSession() { sessionReady = false; },
  } });
  mock.module("./src/workers/advisor/loraFeatures.ts", { exports: {
    forgetLoraFeatures() { hiddenReady = false; },
    judgeHidden: (id) => run("hidden", id), embedText: (id) => run("embed", id),
  } });
  mock.module("./src/workers/advisor/port.ts", { exports: {
    onRequest(callback) { handle = callback; }, post(message) { responses.push(message); },
  } });
  await import("./src/workers/advisor.worker.ts");
  const flush = () => new Promise(resolve => setImmediate(resolve));
  for (const [index, type] of ["generate", "judge", "embed", "load"].entries()) {
    modelReady = prefixReady = hiddenReady = sessionReady = true;
    failure = new Error("WebGPU device lost");
    handle({ type, id: index, model: spec, messages: [], questions: [], subset: [], state: "", text: "" });
    await flush();
    assert.equal(modelReady, false, type + " model");
    assert.equal(prefixReady || hiddenReady || sessionReady, false, type + " caches");
    assert.equal(responses.at(-1).type, "error");
    assert.equal(responses.at(-1).id, type === "load" ? undefined : index);
    failure = undefined;
    handle({ type: "embed", id: 100 + index, model: spec, text: "retry" });
    await flush();
    assert.deepEqual(responses.at(-1), { type: "success", id: 100 + index });
  }
  modelReady = prefixReady = hiddenReady = sessionReady = true;
  failure = new Error("ordinary input failure");
  handle({ type: "generate", id: 200, model: spec, messages: [] });
  await flush();
  assert.equal(modelReady && prefixReady && hiddenReady && sessionReady, true);
  assert.deepEqual(responses.at(-1), { type: "error", id: 200, message: "ordinary input failure" });
  failure = "network failure";
  handle({ type: "embed", id: 201, model: spec, text: "" });
  await flush();
  assert.equal(responses.at(-1).message, "network failure");
  handle({ type: "stop" });
  assert.equal(calls.at(-1), "stop");
  failure = undefined;
  prefixReady = hiddenReady = sessionReady = false;
  let release;
  blocked = new Promise(resolve => { release = resolve; });
  handle({ type: "embed", id: 300, model: spec, text: "held preceding operation" });
  await flush();
  handle({ type: "generate", id: 301, model: spec, messages: [] });
  handle({ type: "stop" });
  blocked = undefined; release(); await flush();
  assert.equal(generatedIds.includes(301), false);
  assert.deepEqual(responses.at(-1), { type: "done", id: 301, text: "", tokens: 0, seconds: 0 });
  handle({ type: "generate", id: 302, model: spec, messages: [] });
  await flush();
  assert.equal(generatedIds.includes(302), true);
  assert.deepEqual(responses.at(-1), { type: "success", id: 302 });
`;

test("GPU 실패 뒤 생성·판정·검색은 같은 세션의 모든 상태를 버리고 다음 요청을 실행한다", async () => {
  const { stderr } = await promisify(execFile)(process.execPath, [
    "--experimental-test-module-mocks", "--disable-warning=ExperimentalWarning",
    "--import", "tsx", "--input-type=module", "--eval", source,
  ], { cwd: new URL("../../", import.meta.url) });
  assert.equal(stderr, "");
});
