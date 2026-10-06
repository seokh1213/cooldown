import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { collectSource, diffSnapshots, officialBody, officialPatches, SITEMAP, wikiGameplay } from "../../scripts/llm/game-knowledge/sources";
import { watchSources } from "../../scripts/llm/game-knowledge/watch";

test("매시 상류 확인만 끝난 경우는 건너뛰고 실제 생성 뒤에 검사한다", async () => {
  const { shouldWatch } = await import(new URL("../../scripts/ci/game-knowledge-trigger.mjs", import.meta.url).href);
  assert.equal(shouldWatch("workflow_run", [{ name: "update-data", conclusion: "skipped" }]), false);
  assert.equal(shouldWatch("workflow_run", [{ name: "update-data", conclusion: "success" }]), true);
  assert.equal(shouldWatch("schedule"), true);
  assert.equal(shouldWatch("workflow_dispatch"), true);
});

test("공식 주소 형식이 바뀌어도 실제 PC 패치 URL을 발견한다", () => {
  const xml = '<loc>https://www.leagueoflegends.com/en-us/news/game-updates/patch-14-1-notes/</loc><loc>https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-19-notes/</loc><loc>https://example.com/patch-26-19-notes/</loc>';
  assert.deepEqual(officialPatches(xml).map(patch => patch.patch), ["14.1", "26.19"]);
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
