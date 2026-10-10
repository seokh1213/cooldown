import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { test } from "node:test";
import { promisify } from "node:util";

const source = `
  import assert from "node:assert/strict";
  import { mock } from "node:test";
  const slots = [];
  let cursor = 0;
  let cleanup;
  let error;
  let constructFails = false;
  let postFails = false;
  const timers = new Map();
  let timerId = 0;
  const workers = [];
  globalThis.window = { setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); } };
  class FakeWorker {
    listeners = new Map(); messages = []; terminated = false;
    constructor() { if (constructFails) throw new Error("blocked"); workers.push(this); }
    addEventListener(type, callback) { this.listeners.set(type, callback); }
    postMessage(message) { if (postFails) throw new Error("cannot clone"); this.messages.push(message); }
    terminate() { this.terminated = true; }
    emit(type, data) { this.listeners.get(type)?.({ data, preventDefault() {} }); }
  }
  globalThis.Worker = FakeWorker;
  mock.module("react", { exports: {
    useCallback: fn => fn,
    useEffect(fn) { cleanup = fn(); },
    useRef(value) { const index = cursor++; return slots[index] ??= { current: value }; },
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], next => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }];
    },
  } });
  const { useAdvisorWorker } = await import("./src/features/advisor/session/useAdvisorWorker.ts");
  const chunks = [];
  const dones = [];
  const render = () => { cursor = 0; return useAdvisorWorker({ onChunk: (...args) => chunks.push(args), onDone: value => dones.push(value), setError: value => { error = value; }, failureMessage: "localized failure" }); };
  const spec = { id: "test", dtype: "q4" };
  const judge = id => ({ type: "judge", id, model: spec, state: "", questions: [], subset: [] });
  const embed = id => ({ type: "embed", id, model: spec, text: "" });
  let hook = render();
  for (const [index, type] of ["error", "messageerror"].entries()) {
    hook.post({ type: "load", model: spec });
    const worker = workers.at(-1);
    worker.emit("message", { type: "loaded" });
    assert.equal(render().modelReady, true);
    const rejection1 = assert.rejects(hook.requestJudge(judge(index * 2)), /localized failure/);
    const rejection2 = assert.rejects(hook.requestEmbed(embed(index * 2 + 1)), /localized failure/);
    assert.equal(timers.size, 2);
    worker.emit(type);
    await Promise.all([rejection1, rejection2]);
    hook = render();
    assert.equal(hook.status, "error");
    assert.equal(hook.modelReady, false);
    assert.equal(hook.hasWorker(), false);
    assert.equal(worker.terminated, true);
    assert.equal(timers.size, 0);
    hook.post({ type: "load", model: spec });
    assert.notEqual(workers.at(-1), worker);
    worker.emit("message", { type: "loaded" });
    assert.equal(render().modelReady, false);
    hook.shutdown();
  }
  for (const failure of ["constructor", "postMessage"]) {
    constructFails = failure === "constructor";
    postFails = failure === "postMessage";
    await assert.rejects(hook.requestJudge(judge(10)), /localized failure/);
    assert.equal(timers.size, 0);
    assert.equal(hook.hasWorker(), false);
    assert.equal(render().status, "error");
    constructFails = postFails = false;
  }
  hook.post({ type: "load", model: spec });
  workers.at(-1).emit("message", { type: "error", message: "download failed" });
  assert.equal(hook.hasWorker(), false);
  assert.equal(error, "download failed");
  hook.post({ type: "load", model: spec });
  assert.equal(hook.hasWorker(), true);
  const current = workers.at(-1);
  const fallback = assert.rejects(hook.requestJudge(judge(20)), /ordinary failure/);
  current.emit("message", { type: "error", id: 20, message: "ordinary failure" });
  await fallback;
  assert.equal(hook.hasWorker(), true);
  const success = hook.requestEmbed(embed(21));
  current.emit("message", { type: "embedded", id: 21, vector: new Float32Array([1]) });
  assert.deepEqual(await success, new Float32Array([1]));
  assert.equal(timers.size, 0);
  const shuttingDown = assert.rejects(hook.requestJudge(judge(22)), /worker stopped/);
  hook.shutdown(); await shuttingDown;
  assert.equal(render().status, "idle");
  assert.equal(timers.size, 0);
  const unmounting = assert.rejects(hook.requestEmbed(embed(23)), /worker stopped/);
  cleanup(); await unmounting;
  assert.equal(hook.hasWorker(), false);
  assert.equal(timers.size, 0);
`;

test("worker 치명 오류·동기 실패·종료는 대기자를 즉시 정리하고 재시도를 허용한다", async () => {
  const { stderr } = await promisify(execFile)(process.execPath, [
    "--experimental-test-module-mocks", "--disable-warning=ExperimentalWarning",
    "--import", "tsx", "--input-type=module", "--eval", source,
  ], { cwd: new URL("../../../../", import.meta.url) });
  assert.equal(stderr, "");
});
