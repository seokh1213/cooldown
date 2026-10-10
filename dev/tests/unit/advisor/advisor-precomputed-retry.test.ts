import assert from "node:assert/strict";
import { test } from "node:test";
import { loadPrecomputed } from "../../../../src/features/advisor/retrieval/precomputed";

const file = { patch: "test", pairs: { Garen: { watch: "recovered" } } };

test("상성 답 503 실패 뒤에는 다시 받고 성공한 답은 재사용한다", async (context) => {
  let attempts = 0;
  context.mock.method(globalThis, "fetch", async () => {
    attempts++;
    return attempts === 1 ? new Response("", { status: 503 }) : Response.json(file);
  });
  assert.equal(await loadPrecomputed("review-503", "MonkeyKing"), undefined);
  assert.deepEqual(await loadPrecomputed("review-503", "MonkeyKing"), file);
  assert.deepEqual(await loadPrecomputed("review-503", "MonkeyKing"), file);
  assert.equal(attempts, 2);
});

test("네트워크 오류와 잘못된 JSON도 다음 상성 질문에서 재시도한다", async (context) => {
  let attempts = 0;
  context.mock.method(globalThis, "fetch", async () => {
    attempts++;
    if (attempts === 1) throw new TypeError("offline");
    if (attempts === 2) return new Response("invalid json");
    return Response.json(file);
  });
  assert.equal(await loadPrecomputed("review-offline", "MonkeyKing"), undefined);
  assert.equal(await loadPrecomputed("review-offline", "MonkeyKing"), undefined);
  assert.deepEqual(await loadPrecomputed("review-offline", "MonkeyKing"), file);
  assert.equal(attempts, 3);
});

for (const status of [404, 410]) {
  test(`없는 선택 자료 ${status}는 노트 답으로 돌아가고 반복 요청하지 않는다`, async (context) => {
    const fetch = context.mock.method(globalThis, "fetch", async () => new Response("", { status }));
    assert.equal(await loadPrecomputed(`review-${status}`, "MonkeyKing", "en_US"), undefined);
    assert.equal(await loadPrecomputed(`review-${status}`, "MonkeyKing", "en_US"), undefined);
    assert.equal(fetch.mock.callCount(), 1);
  });
}

test("같은 상성 답을 동시에 요청하면 한 번만 받는다", async (context) => {
  const fetch = context.mock.method(globalThis, "fetch", async () => Response.json(file));
  const results = await Promise.all([
    loadPrecomputed("review-concurrent", "MonkeyKing"),
    loadPrecomputed("review-concurrent", "MonkeyKing"),
  ]);
  assert.deepEqual(results, [file, file]);
  assert.equal(fetch.mock.callCount(), 1);
});
