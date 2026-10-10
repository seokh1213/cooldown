import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test } from "node:test";

test("내부 생성은 채팅에 노출되지 않고 중단·시간 초과·워커 종료에서 끝난다", async () => {
  const source = `
    import assert from "node:assert/strict";
    import { mock } from "node:test";
    const cleanups = [];
    mock.module("react", { exports: {
      useCallback: fn => fn, useEffect: fn => cleanups.push(fn()),
      useRef: value => ({ current: value }), useState: value => [value, () => {}],
    } });
    let worker;
    class FakeWorker {
      listeners = new Map();
      constructor() { worker = this; }
      addEventListener(type, listener) { this.listeners.set(type, listener); }
      postMessage() {}
      terminate() {}
      emit(data) { this.listeners.get("message")({ data }); }
    }
    globalThis.Worker = FakeWorker;
    globalThis.window = globalThis;
    mock.timers.enable({ apis: ["setTimeout"] });
    const { useAdvisorWorker } = await import("./src/features/advisor/session/useAdvisorWorker.ts");
    let displayed = 0;
    const api = useAdvisorWorker({ onChunk: () => displayed++, onDone: () => displayed++, setError() {} });
    const request = id => ({ type: "generate", id, model: { id: "test", dtype: "q4" }, messages: [] });
    const first = api.requestGenerate(request(-1));
    worker.emit({ type: "chunk", id: -1, text: "private" });
    worker.emit({ type: "done", id: -1, text: "scope" });
    assert.equal(await first, "scope");
    assert.equal(displayed, 0);
    const timeout = assert.rejects(api.requestGenerate(request(-2)), /timeout/);
    mock.timers.tick(30_000);
    await timeout;
    worker.emit({ type: "done", id: -2, text: "late" });
    assert.equal(displayed, 0);
    worker.emit({ type: "done", id: 10, text: "visible" });
    assert.equal(displayed, 1);
    const interrupted = assert.rejects(api.requestGenerate(request(-3)), /interrupted/);
    api.interrupt(); await interrupted;
    const failed = assert.rejects(api.requestGenerate(request(-4)), /failed/);
    worker.listeners.get("error")({ preventDefault() {} }); await failed;
    const stopped = assert.rejects(api.requestGenerate(request(-5)), /stopped/);
    api.shutdown(); await stopped;
    const unmounted = assert.rejects(api.requestGenerate(request(-6)), /stopped/);
    cleanups.forEach(fn => fn?.()); await unmounted;
    await assert.rejects(api.requestGenerate(request(1)), /negative/);
    assert.equal(displayed, 1);
    mock.timers.reset();
  `;
  await promisify(execFile)(process.execPath, ["--experimental-test-module-mocks", "--disable-warning=ExperimentalWarning",
    "--import", "tsx", "--input-type=module", "--eval", source], { cwd: new URL("../../../../", import.meta.url) });
});
