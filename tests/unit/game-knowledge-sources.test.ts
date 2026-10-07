import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { collectSource, diffSnapshots, getText, officialBody, officialPatches, PATCH_INDEX, SITEMAP, wikiGameplay } from "../../scripts/llm/game-knowledge/sources";
import { watchSources } from "../../scripts/llm/game-knowledge/watch";

test("대기하던 배포는 원천 갱신 뒤의 master를 체크아웃한다", async () => {
  const workflow = await fs.readFile(new URL("../../.github/workflows/update-static-data.yml", import.meta.url), "utf8");
  const checkout = workflow.split("- name: Checkout repository")[1]?.split("- name: Setup Node.js")[0];
  assert.ok(checkout, "배포 자료 체크아웃 단계");
  assert.match(checkout, /^\s+ref: master$/m, "이벤트 시점의 옛 SHA로 최신 데이터를 되돌리지 않는다");
});

test("원천 갱신 뒤에도 최신 자료의 전체 회귀를 수동 실행할 수 있다", async () => {
  const workflow = await fs.readFile(new URL("../../.github/workflows/advisor-quality.yml", import.meta.url), "utf8");
  assert.match(workflow, /^ {2}workflow_dispatch:$/m);
});

test("수집을 건너뛰는 후속 회차는 실제 원천 감시의 대기열을 차지하지 않는다", async () => {
  const workflow = await fs.readFile(new URL("../../.github/workflows/watch-game-knowledge.yml", import.meta.url), "utf8");
  assert.doesNotMatch(workflow.split("jobs:")[0], /^concurrency:/m);
  const watch = workflow.split("\n  watch:")[1];
  assert.match(watch, /^ {4}needs: check$/m);
  assert.match(watch, /^ {4}if: needs\.check\.outputs\.run == 'true'$/m);
  assert.match(watch, /^ {4}concurrency:\n {6}group: watch-game-knowledge\n {6}cancel-in-progress: false$/m);
});

test("매시 상류 확인만 끝난 경우는 건너뛰고 실제 생성 뒤에 검사한다", async () => {
  const { shouldWatch } = await import(new URL("../../scripts/ci/game-knowledge-trigger.mjs", import.meta.url).href);
  assert.equal(shouldWatch("workflow_run", [{ name: "update-data", conclusion: "skipped" }]), false);
  assert.equal(shouldWatch("workflow_run", [{ name: "update-data", conclusion: "success", steps: [{ name: "Generate static data", conclusion: "success" }] }]), true);
  assert.equal(shouldWatch("workflow_run", [{ name: "update-data", conclusion: "success", steps: [{ name: "Generate static data", conclusion: "skipped" }] }]), false);
  assert.equal(shouldWatch("workflow_run", [{ name: "update-data", conclusion: "failure", steps: [{ name: "Generate static data", conclusion: "success" }] }]), false);
  assert.equal(shouldWatch("schedule"), true);
  assert.equal(shouldWatch("workflow_dispatch"), true);
});

test("공식 주소 형식이 바뀌어도 실제 PC 패치 URL을 발견한다", () => {
  const xml = '<loc>https://www.leagueoflegends.com/en-us/news/game-updates/patch-14-1-notes/</loc><loc>https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-19-notes/</loc><loc>https://example.com/patch-26-19-notes/</loc>';
  assert.deepEqual(officialPatches(xml).map(patch => patch.patch), ["14.1", "26.19"]);
});

test("공식 목록의 최신 패치와 사이트맵을 합치고 중복·다른 게임 링크를 제외한다", () => {
  const content = '<loc>https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-19-notes/</loc>'
    + '<a href="/en-us/news/game-updates/league-of-legends-patch-26-19-notes">old</a>'
    + '<a href="/en-us/news/game-updates/league-of-legends-patch-26-20-notes">new</a>'
    + '<a href="https://example.com/en-us/news/game-updates/patch-26-21-notes/">other</a>'
    + '<a href="http://[broken">malformed unrelated link</a>'
    + '<a href="/en-us/news/game-updates/teamfight-tactics-patch-26-20-notes/">TFT</a>';
  assert.deepEqual(officialPatches(content).map(patch => patch.patch), ["26.19", "26.20"]);
  assert.equal(officialPatches(content)[1].url, "https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-20-notes");
});

test("공식 본문의 핫픽스는 포함하고 footer와 스크립트는 제외한다", () => {
  const article = '<main><div id="patch-notes-container"><h2>Mid-Patch Updates</h2><p>Damage 100</p></div><footer>Navigation</footer></main><script>build 123</script>';
  assert.equal(officialBody(article), "Mid-Patch Updates Damage 100");
  assert.throws(() => officialBody("<main>Unavailable</main>"), /not found/);
});

test("공식 JSON의 노트 본문을 고르고 추천 뉴스 변경을 제외한다", () => {
  const article = '<div id="patch-notes-container"><p>Hotfix damage 140</p></div>';
  const data = { props: { body: article, news: "Other article" } };
  const html = `<main>Related news changes</main><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>`;
  assert.equal(officialBody(html), "Hotfix damage 140");
});

test("같은 리비전에서도 템플릿이 펼쳐진 수치 변경을 감지한다", async context => {
  let damage = 100;
  context.mock.method(globalThis, "fetch", async () => Response.json({ parse: {
    wikitext: "{{stats}}", revid: 12, text: `<p>Damage ${damage}</p><h2 id="Patch_History">History</h2>`,
  } }));
  const source = { id: "wiki:Example", title: "Example", url: "https://wiki.leagueoflegends.com/en-us/Example", kind: "wiki" as const };
  const before = await collectSource(source);
  damage = 140;
  const after = await collectSource(source);
  assert.equal(before.snapshot.revision, after.snapshot.revision);
  assert.equal(diffSnapshots([before.snapshot], [after.snapshot])[0].change, "changed");
  assert.equal(diffSnapshots([after.snapshot], [after.snapshot]).length, 0);
  const gameplay = wikiGameplay('<p>Damage 100</p><h2 id="Trivia">old</h2>');
  assert.match(gameplay, /Damage 100/);
  assert.doesNotMatch(gameplay, /Trivia|old/);
});

test("수집 실패는 불완전 보고서를 남기고 기준을 덮어쓰지 않는다", async context => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cooldown-source-check-"));
  const baseline = JSON.stringify({ schemaVersion: 1, patch: "26.19", snapshots: [] });
  await fs.mkdir(path.join(root, "public/data"), { recursive: true });
  await fs.mkdir(path.join(root, "knowledge"));
  await fs.writeFile(path.join(root, "public/data/version.json"), JSON.stringify({ patchVersion: "26.19", sources: { cdragon: "16.19" } }));
  await fs.writeFile(path.join(root, "knowledge/game-source-baseline.json"), baseline);
  await fs.writeFile(path.join(root, "knowledge/game-source-registry.json"), JSON.stringify({ wiki: [{ title: "Example" }], cdragon: [], pinnedOfficialPatches: [], recentOfficialCount: 1 }));
  context.mock.method(globalThis, "fetch", async (url: string) => url === SITEMAP
    ? new Response('<loc>https://www.leagueoflegends.com/en-us/news/game-updates/patch-26-19-notes/</loc>')
    : url === PATCH_INDEX ? new Response('<main>No new patch</main>')
    : new Response("Unavailable", { status: 503 }));
  try {
    const output = path.join(root, "output");
    await assert.rejects(watchSources(output, "check", root), /Incomplete source check/);
    assert.equal(await fs.readFile(path.join(root, "knowledge/game-source-baseline.json"), "utf8"), baseline);
    const report = JSON.parse(await fs.readFile(path.join(output, "report.json"), "utf8"));
    assert.equal(report.complete, false);
    assert.equal(report.errors.length, 2);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("일시적인 상류 서버 오류는 재시도하고 존재하지 않는 주소는 다시 요청하지 않는다", async context => {
  let calls = 0;
  context.mock.method(globalThis, "fetch", async () => ++calls < 3
    ? new Response("Origin timeout", { status: 522 }) : new Response("verified source"));
  assert.equal(await getText("https://example.com/source"), "verified source");
  assert.equal(calls, 3);
  calls = 0;
  context.mock.method(globalThis, "fetch", async () => {
    calls++;
    return new Response("Missing", { status: 404 });
  });
  await assert.rejects(getText("https://example.com/missing"), /HTTP 404/);
  assert.equal(calls, 1);
});

test("노트 승인 해시와 원문 변경은 별도로 감지하며 승인 상태를 수정하지 않는다", async () => {
  const { writeNoteImpacts } = await import("../../scripts/llm/game-knowledge/note-impacts");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cooldown-note-impact-"));
  await fs.mkdir(path.join(root, "knowledge"));
  const source = { id: "wiki:Example", kind: "wiki" as const, url: "https://wiki.leagueoflegends.com/en-us/Example", hash: "current", fetchedAt: "2026-10-07" };
  const notes = JSON.stringify({ notes: [{ id: "reviewed", sources: [source.url], sourceHash: "approved", version: { verifiedThroughPatch: "26.19" } }] });
  await fs.writeFile(path.join(root, "knowledge/mechanics-notes.json"), notes);
  try {
    const report = await writeNoteImpacts(root, [source], [source], root);
    assert.equal(report.affectedNotes[0].reason, "approved-source-mismatch");
    assert.equal(report.affectedNotes[0].verifiedThroughPatch, "26.19");
    assert.equal(await fs.readFile(path.join(root, "knowledge/mechanics-notes.json"), "utf8"), notes);
    const unchanged = await writeNoteImpacts(root, [{ ...source, hash: "approved" }], [{ ...source, hash: "approved" }], root);
    assert.equal(unchanged.affectedNotes.length, 0);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
