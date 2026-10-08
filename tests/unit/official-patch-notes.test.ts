import assert from "node:assert/strict";
import { test } from "node:test";
import { officialArticleHtml, parseOfficialArticle } from "../../scripts/patch-notes/officialParser";
import { officialImpact, applyOfficialPatch } from "../../scripts/patch-notes/officialReport";
import { validateOfficialArchive, type OfficialPatchArchive } from "../../scripts/patch-notes/official";
import { decodePatchNotesReport, type PatchSnapshot, type TextPatchChange } from "../../src/data/contracts/patchNotes";
import { comparePatchSnapshots } from "../../scripts/patch-notes/diff";
import { filterPatchEntries, formatPatchValues } from "../../src/pages/PatchNotesPage/model";
import { itemStatMetrics } from "../../scripts/patch-notes/collect";

const html = `<div id="patch-notes-container"><h2 id="patch-champions">Champions</h2>
<h3 id="patch-duplicate">Test</h3><h4>Q - Test ability</h4>
<ul><li>Targeting: Enabled ⇒ Removed</li><li>Damage: 10 (+20% AP) ⇒ <strong>20 (+20% AP)</strong></li></ul>
<h2 id="patch-classic">Classic</h2><h3>Test</h3><h4>Q - Test ability</h4><ul><li>Damage: 20 ⇒ 9999</li></ul></div>`;
const name = { ko_KR: "테스트", en_US: "Test", zh_CN: "测试" };
const sources = { ddragon: "16.20.1", cdragon: "16.20" };
const snapshot: PatchSnapshot = { schemaVersion: 1, patchVersion: "26.20", sources, entities: [{
  id: "Test", kind: "champion", name, metrics: [{ id: "cooldown", label: name, section: "Q", sectionName: name,
    values: [10], unit: "seconds", favorable: "lower", sourceKey: "cooldown" }],
}] };

test("아이템 스킬 가속은 실제 CDragon 키를 읽어 20→10을 잃지 않는다", () => {
  const before = itemStatMetrics("3152", { mAbilityHasteMod: 20 });
  const after = itemStatMetrics("3152", { mAbilityHasteMod: 10 });
  assert.deepEqual(before.find(metric => metric.id === "Items/3152/mAbilityHasteMod")?.values, [20]);
  assert.deepEqual(after.find(metric => metric.id === "Items/3152/mAbilityHasteMod")?.values, [10]);
});

function archive(): OfficialPatchArchive {
  const article = { ...parseOfficialArticle(html), url: "https://www.leagueoflegends.com/en-us/news/game-updates/test/", sha256: "a".repeat(64) };
  return { schemaVersion: 1, patchVersion: "26.20", fetchedAt: "2026-10-08T00:00:00Z",
    articles: { ko_KR: structuredClone(article), en_US: structuredClone(article), zh_CN: structuredClone(article) } };
}

test("공식 협곡 변경에서 동작·계수 문장을 보존하고 다른 모드를 섞지 않는다", () => {
  const article = parseOfficialArticle(html);
  assert.equal(article.rowCount, 2);
  assert.equal(article.entities.length, 1);
  assert.deepEqual(article.entities[0].sections[0].rows[0], { label: "Targeting", before: "Enabled", after: "Removed" });
  assert.equal(article.entities[0].sections[0].rows[1].after, "20 (+20% AP)");
});

test("공식 HTML의 중복 heading id로 다른 챔피언을 합치지 않는다", () => {
  const article = parseOfficialArticle(html.replace('<h2 id="patch-classic">Classic</h2>', "")
    .replace('<h3>Test</h3>', '<h3 id="patch-duplicate">Other</h3>'));
  assert.deepEqual(article.entities.map(entity => entity.title), ["Test", "Other"]);
  assert.equal(article.rowCount, 3);
});

test("Next 데이터와 wrapper 없는 번역 원문도 찾고 사이트 본문 소실을 거부한다", () => {
  assert.equal(officialArticleHtml(`<script id="__NEXT_DATA__">${JSON.stringify({ article: html })}</script>`), html);
  const translated = '<h2>英雄</h2><h3>英雄一</h3><h4>技能</h4><li>傷害：1 ⇒ 2</li>';
  assert.equal(officialArticleHtml(`<script id="__NEXT_DATA__">${JSON.stringify({ article: translated })}</script>`), translated);
  assert.throws(() => officialArticleHtml("<main>Not an article</main>"));
  assert.throws(() => parseOfficialArticle('<h2 id="patch-champions">Champions</h2><li>Damage: 1 ⇒ 2</li>'));
});

test("공식 원문의 언어별 누락·모드 불일치·판본 혼합을 거부한다", () => {
  const original = archive();
  validateOfficialArchive(original, "26.20");
  assert.throws(() => validateOfficialArchive(original, "26.19"));
  const missing = archive(); missing.articles.ko_KR.entities[0].sections[0].rows.pop();
  assert.throws(() => validateOfficialArchive(missing, "26.20"));
  const kind = archive(); kind.articles.zh_CN.entities[0].kind = "item";
  assert.throws(() => validateOfficialArchive(kind, "26.20"));
  const swapped = archive(); swapped.articles.ko_KR.entities[0].sections[0].rows.reverse();
  assert.throws(() => validateOfficialArchive(swapped, "26.20"));
});

test("새 문장·공식 수치를 표시하고 숫자 비교 자료는 유지한다", () => {
  const report = comparePatchSnapshots({ ...snapshot, patchVersion: "26.19" }, snapshot);
  const result = applyOfficialPatch(report, snapshot, archive());
  assert.equal(report.entries.length, 0);
  assert.equal(result.entries[0].changes.length, 2);
  assert.equal(result.officialSource?.rowCount, 2);
  assert.equal(decodePatchNotesReport(result, "26.20"), result);
  const change = result.entries[0].changes[0] as TextPatchChange;
  assert.equal(formatPatchValues(change, "after", "초", "en_US"), "Removed");
  assert.equal(change.sourceKey, "official/0/0/0");
  assert.equal(filterPatchEntries(result.entries, { query: "테스트", kind: "champion", impact: "all" }).length, 1);
});

test("스칼라·랭크 배열 변경은 방향을 비교하고 동작 변경은 추측하지 않는다", () => {
  assert.equal(officialImpact({ label: "Duration", before: "2.5s", after: "2.5 / 2.75 / 3s" }), "buff");
  assert.equal(officialImpact({ label: "Mana Cost", before: "46 / 42 / 38 / 34 / 30", after: "30" }), "buff");
  assert.equal(officialImpact({ label: "Cooldown", before: "20", after: "10" }), "buff");
  assert.equal(officialImpact({ label: "Damage", before: "5 - 30 (+25% bonus AD)", after: "5 - 25 (+20% bonus AD)" }), "nerf");
  assert.equal(officialImpact({ label: "Targeting", before: "Enabled", after: "Removed" }), "adjustment");
});

test("번역의 빈 제목을 건너뛰고 점수판 숫자 숨김을 협곡 밸런스에 섞지 않는다", () => {
  const content = html.replace('<h4>Q - Test ability</h4>', '<h4></h4><h4>Q - Test ability</h4>')
    .replace('<h2 id="patch-classic">', '<h4>Scoreboard Cleanup</h4><li>Death\'s Dance</li><h2 id="patch-classic">');
  const article = parseOfficialArticle(content);
  assert.equal(article.entities[0].sections.length, 1);
  assert.deepEqual(article.excluded, ["Death's Dance"]);
});
