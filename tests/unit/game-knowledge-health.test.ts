import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { nextHealth, OUTAGE_LIMIT_MS, readHealth, sourceFailure, SourceHttpError } from "../../scripts/ci/source-health.mjs";
import { watchSources } from "../../scripts/llm/game-knowledge/watch";
import { PATCH_INDEX, SITEMAP } from "../../scripts/llm/game-knowledge/sources";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cooldown-ci-health-"));
  await fs.mkdir(path.join(root, "public/data"), { recursive: true });
  await fs.mkdir(path.join(root, "knowledge"));
  await fs.writeFile(path.join(root, "public/data/version.json"), JSON.stringify({ patchVersion: "26.19", sources: { ddragon: "16.19.1", cdragon: "16.19" } }));
  const baseline = JSON.stringify({ schemaVersion: 1, patch: "26.19", snapshots: [] });
  await fs.writeFile(path.join(root, "knowledge/game-source-baseline.json"), baseline);
  await fs.writeFile(path.join(root, "knowledge/game-source-registry.json"), JSON.stringify({ wiki: [{ title: "Example" }], cdragon: [], pinnedOfficialPatches: [], recentOfficialCount: 1 }));
  return { root, baseline, output: path.join(root, "output"), healthFile: path.join(root, "research/.cache/source-health/knowledge.json") };
}

function sourceResponse(url: string, official: () => Response) {
  if (url === SITEMAP) return new Response('<loc>https://www.leagueoflegends.com/en-us/news/game-updates/patch-26-20-notes/</loc>');
  if (url === PATCH_INDEX) return new Response("<main>Patch index</main>");
  if (url.includes("api.php")) return Response.json({ parse: { wikitext: "{{stats}}", text: "<p>Damage 100</p>", revid: 12 } });
  return official();
}

test("CI의 부분 수집은 대기로 기록하며 기준·검수 패치는 보존하고 복구 시 해제한다", async context => {
  context.mock.method(console, "warn", () => {});
  const { root, baseline, output, healthFile } = await fixture();
  let recovered = false;
  context.mock.method(globalThis, "fetch", async (url: string) => sourceResponse(url, () => recovered
    ? new Response('<main><div id="patch-notes-container"><p>26.20</p></div></main>')
    : new Response("unavailable", { status: 503 })));
  try {
    const first = await watchSources(output, "ci", root);
    assert.equal(first.complete, false);
    assert.equal(first.availability, "deferred");
    assert.equal(first.patch, "26.19");
    assert.equal(first.discoveredLatestPatch, "26.20");
    assert.equal(first.snapshots.length, 1);
    assert.equal(first.expectedSources, 2);
    const second = await watchSources(output, "ci", root);
    assert.equal(second.firstUnavailableAt, first.firstUnavailableAt);
    assert.equal(await fs.readFile(path.join(root, "knowledge/game-source-baseline.json"), "utf8"), baseline);
    recovered = true;
    const complete = await watchSources(output, "ci", root);
    assert.equal(complete.complete, true);
    assert.equal(complete.availability, "available");
    assert.equal(readHealth(healthFile)?.firstUnavailableAt, undefined);
    assert.equal(await fs.readFile(path.join(root, "knowledge/game-source-baseline.json"), "utf8"), baseline);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("CI도 6시간 넘는 일시 장애는 실패하고 불완전 보고서를 남긴다", async context => {
  const { root, output, healthFile } = await fixture();
  await fs.mkdir(path.dirname(healthFile), { recursive: true });
  const first = nextHealth(undefined, [sourceFailure("official", new SourceHttpError(522, "source"))], new Date(Date.now() - OUTAGE_LIMIT_MS));
  await fs.writeFile(healthFile, JSON.stringify(first));
  context.mock.method(globalThis, "fetch", async (url: string) => sourceResponse(url, () => new Response("unavailable", { status: 522 })));
  try {
    await assert.rejects(watchSources(output, "ci", root), /Incomplete source check/);
    const report = JSON.parse(await fs.readFile(path.join(output, "report.json"), "utf8"));
    assert.equal(report.complete, false);
    assert.equal(report.availability, "unavailable");
    assert.equal(report.firstUnavailableAt, first.firstUnavailableAt);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("공식 목록 탐색 장애도 대기 기록하며 주소·본문 오류는 즉시 실패한다", async context => {
  context.mock.method(console, "warn", () => {});
  const { root, output } = await fixture();
  context.mock.method(globalThis, "fetch", async () => new Response("unavailable", { status: 503 }));
  try {
    const deferred = await watchSources(output, "ci", root);
    assert.equal(deferred.complete, false);
    assert.equal(deferred.availability, "deferred");
    assert.equal(deferred.expectedSources, null);
    assert.equal(deferred.errors[0].id, "source-discovery");
    for (const response of [() => new Response("missing", { status: 404 }), () => new Response("<main>Body missing</main>")]) {
      context.mock.method(globalThis, "fetch", async (url: string) => sourceResponse(url, response));
      await assert.rejects(watchSources(output, "ci", root), /Incomplete source check/);
      const report = JSON.parse(await fs.readFile(path.join(output, "report.json"), "utf8"));
      assert.equal(report.availability, "unavailable");
      assert.equal(report.errors[0].transient, false);
    }
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("정적 자료 CI는 연속 장애 상태를 저장하고 기존 버전 파일을 바꾸지 않는다", async context => {
  context.mock.method(console, "warn", () => {});
  const { root } = await fixture();
  const { main } = await import(new URL("../../scripts/ci/upstream-changed.mjs", import.meta.url).href);
  let recovered = false;
  const fetcher = async (url: string) => url.endsWith("versions.json") ? Response.json(["16.20.1"])
    : recovered ? Response.json({ "Items/1001": {} }) : new Response("timeout", { status: 522 });
  try {
    const file = path.join(root, "research/.cache/source-health/static.json");
    const before = await fs.readFile(path.join(root, "public/data/version.json"), "utf8");
    assert.equal((await main(root, fetcher)).run, false);
    const first = readHealth(file);
    assert.equal(first?.status, "deferred");
    assert.equal((await main(root, fetcher)).run, false);
    assert.equal(readHealth(file)?.firstUnavailableAt, first?.firstUnavailableAt);
    assert.equal(await fs.readFile(path.join(root, "public/data/version.json"), "utf8"), before);
    recovered = true;
    assert.equal((await main(root, fetcher)).run, true);
    assert.equal(readHealth(file)?.status, "available");
    assert.equal(readHealth(file)?.firstUnavailableAt, undefined);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("수집 예산이 끝나면 남은 원천을 미수집으로 기록해 CI 강제 종료 전에 상태를 보존한다", async context => {
  context.mock.method(console, "warn", () => {});
  const { root, output } = await fixture();
  await fs.writeFile(path.join(root, "knowledge/game-source-registry.json"), JSON.stringify({ wiki: [{ title: "A" }, { title: "B" }, { title: "C" }], cdragon: [], pinnedOfficialPatches: [], recentOfficialCount: 1 }));
  let clockCalls = 0;
  context.mock.method(Date, "now", () => ++clockCalls <= 2 ? 0 : 8 * 60 * 1000);
  context.mock.method(globalThis, "fetch", async (url: string) => sourceResponse(url, () => new Response('<main><div id="patch-notes-container">Body</div></main>')));
  try {
    const report = await watchSources(output, "ci", root);
    assert.equal(report.complete, false);
    assert.equal(report.availability, "deferred");
    assert.equal(report.expectedSources, 4);
    assert.equal(report.snapshots.length, 2);
    assert.equal(report.errors.length, 2);
    assert.ok(report.errors.every(error => error.transient && error.error.includes("budget exhausted")));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
