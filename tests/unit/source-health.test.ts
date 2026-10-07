import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isTransientError, nextHealth, OUTAGE_LIMIT_MS, readHealth, sourceFailure, SourceHttpError } from "../../scripts/ci/source-health.mjs";

const start = new Date("2026-10-07T00:00:00.000Z");
const unavailable = [sourceFailure("cdragon:items", new SourceHttpError(522, "https://example.com/16.20/items"))];
const local = { patchVersion: "26.19", sources: { ddragon: "16.19.1", cdragon: "16.19" } };

test("일시 장애는 시작 시각을 보존하고 정확히 6시간부터 실패한다", () => {
  const first = nextHealth(undefined, unavailable, start);
  assert.equal(first.status, "deferred");
  const before = nextHealth(first, unavailable, new Date(start.getTime() + OUTAGE_LIMIT_MS - 1));
  assert.equal(before.status, "deferred");
  assert.equal(before.firstUnavailableAt, first.firstUnavailableAt);
  const expired = nextHealth(before, unavailable, new Date(start.getTime() + OUTAGE_LIMIT_MS));
  assert.equal(expired.status, "unavailable");
  assert.equal(expired.outageMs, OUTAGE_LIMIT_MS);
});

test("완전 복구만 대기를 해제하고 다음 장애는 새 시각부터 계산한다", () => {
  const previous = nextHealth(undefined, unavailable, start);
  const recoveredAt = new Date(start.getTime() + 1000);
  const recovered = nextHealth(previous, [], recoveredAt);
  assert.equal(recovered.status, "available");
  assert.equal(recovered.firstUnavailableAt, undefined);
  assert.equal(recovered.lastSuccessAt, recoveredAt.toISOString());
  const next = nextHealth(recovered, unavailable, new Date(start.getTime() + 2000));
  assert.equal(next.firstUnavailableAt, "2026-10-07T00:00:02.000Z");
  assert.equal(next.lastSuccessAt, recoveredAt.toISOString());
});

test("404·403·잘못된 JSON·코드 오류는 대기 처리하지 않는다", () => {
  for (const error of [new SourceHttpError(404, "missing"), new SourceHttpError(403, "forbidden"), new SyntaxError("JSON"), new TypeError("Cannot read properties of undefined")]) {
    assert.equal(isTransientError(error), false);
    assert.equal(nextHealth(undefined, [sourceFailure("required", error)], start).status, "unavailable");
  }
  assert.equal(nextHealth(undefined, [...unavailable, sourceFailure("schema", new Error("Invalid source"))], start).status, "unavailable");
  assert.equal(isTransientError(new SourceHttpError(429, "rate-limited")), true);
  assert.equal(isTransientError(new TypeError("fetch failed")), true);
  assert.equal(isTransientError(new DOMException("deadline", "TimeoutError")), true);
});

test("저장된 장애 시각이 잘못되면 새 장애로 초기화하지 않고 실패한다", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cooldown-health-"));
  const file = path.join(root, "health.json");
  try {
    assert.equal(readHealth(file), undefined);
    await fs.writeFile(file, JSON.stringify({ schemaVersion: 1, status: "deferred", checkedAt: start.toISOString(), firstUnavailableAt: "broken" }));
    assert.throws(() => readHealth(file), /Invalid saved/);
    assert.throws(() => nextHealth(nextHealth(undefined, unavailable, start), unavailable, new Date(start.getTime() - 1)), /Invalid source outage/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("새 패치 필수 원천 522는 4회 후 대기하며 다른 패치로 바꾸지 않는다", async () => {
  const { checkUpstream } = await import(new URL("../../scripts/ci/upstream-changed.mjs", import.meta.url).href);
  const urls: string[] = [];
  const result = await checkUpstream({ event: "workflow_dispatch", local, fetcher: async (url: string) => {
    urls.push(url);
    return url.endsWith("versions.json") ? Response.json(["16.20.1"]) : new Response("timeout", { status: 522 });
  } });
  assert.equal(result.run, false);
  assert.equal(result.requestedDdragon, "16.20.1");
  assert.equal(result.failure.transient, true);
  assert.equal(result.failure.httpStatus, 522);
  assert.deepEqual(urls.slice(1), Array(4).fill("https://raw.communitydragon.org/16.20/game/items.cdtb.bin.json"));
});

test("주소·JSON·스키마 오류는 재시도 없이 실제 실패로 남긴다", async () => {
  const { checkUpstream } = await import(new URL("../../scripts/ci/upstream-changed.mjs", import.meta.url).href);
  for (const response of [() => new Response("missing", { status: 404 }), () => new Response("not json"), () => Response.json([]), () => Response.json({})]) {
    let calls = 0;
    const result = await checkUpstream({ event: "workflow_dispatch", local, fetcher: async (url: string) => {
      calls++;
      return url.endsWith("versions.json") ? Response.json(["16.20.1"]) : response();
    } });
    assert.equal(calls, 2);
    assert.equal(result.run, false);
    assert.equal(result.failure.transient, false);
  }
});

test("코드 push는 장애 상태를 성공으로 초기화하지 않고 원천 조회 없이 배포한다", async () => {
  const { checkUpstream } = await import(new URL("../../scripts/ci/upstream-changed.mjs", import.meta.url).href);
  const result = await checkUpstream({ event: "push", local, fetcher: () => { throw new Error("No network on code push"); } });
  assert.equal(result.run, true);
  assert.equal(result.checked, false);
});

test("같은 패치·빌드여도 장애 대기 중이면 필수 원천을 다시 확인한다", async () => {
  const { checkUpstream } = await import(new URL("../../scripts/ci/upstream-changed.mjs", import.meta.url).href);
  const urls: string[] = [];
  const marker = { ...local, cdragonBuild: { content: "same", characters: "same" } };
  const fetcher = async (url: string) => {
    urls.push(url);
    if (url.endsWith("versions.json")) return Response.json(["16.19.1"]);
    if (url.endsWith("content-metadata.json")) return Response.json({ version: "same" });
    if (url.endsWith("/data/")) return Response.json([{ name: "characters", mtime: "same" }]);
    return Response.json({ "Items/1001": {} });
  };
  const result = await checkUpstream({ event: "schedule", local: marker, retryPending: true, now: new Date("2026-10-07T02:17:00Z"), fetcher });
  assert.equal(result.run, true);
  assert.equal(result.failure, undefined);
  assert.ok(urls.includes("https://raw.communitydragon.org/16.19/game/items.cdtb.bin.json"));
  urls.length = 0;
  const healthy = await checkUpstream({ event: "schedule", local: marker, now: new Date("2026-10-07T02:17:00Z"), fetcher });
  assert.equal(healthy.run, false);
  assert.equal(urls.length, 3);
});

test("정상 원천은 일일 검수만 하고 대기·장기 장애는 매시간 재시도한다", async () => {
  const { shouldWatch } = await import(new URL("../../scripts/ci/game-knowledge-trigger.mjs", import.meta.url).href);
  const now = new Date("2026-10-07T02:37:00Z");
  assert.equal(shouldWatch("schedule", [], { now, health: { status: "available", lastSuccessAt: "2026-10-07T00:40:00Z" } }), false);
  assert.equal(shouldWatch("schedule", [], { now, health: { status: "available", lastSuccessAt: "2026-10-06T00:40:00Z" } }), true);
  for (const status of ["deferred", "unavailable"]) assert.equal(shouldWatch("schedule", [], { now, health: { status } }), true);
  assert.equal(shouldWatch("schedule", [], { now }), true);
  assert.equal(shouldWatch("workflow_run", [{ name: "update-data", conclusion: "skipped" }], { now, health: { status: "deferred" } }), false);
});
