import assert from "node:assert/strict";
import { test } from "node:test";
import { officialArticleHtml, parseOfficialArticle } from "../../scripts/patch-notes/officialParser";
import { officialImpact, applyOfficialPatch } from "../../scripts/patch-notes/officialReport";
import { validateOfficialArchive, type OfficialPatchArchive } from "../../scripts/patch-notes/official";
import { decodePatchNotesReport, type PatchSnapshot, type TextPatchChange } from "../../../src/domain/game/contracts/patchNotes";
import { comparePatchSnapshots } from "../../scripts/patch-notes/diff";
import { filterPatchEntries, formatPatchValues } from "../../../src/features/patch-notes/model";
import { itemStatMetrics } from "../../scripts/patch-notes/collect";
import { localizedOfficialArticle, officialNumberFingerprint } from "../../scripts/patch-notes/officialLocalization";

const html = `<div id="patch-notes-container"><h2 id="patch-champions">Champions</h2>
<h3 id="patch-duplicate">Test</h3><h4>Q - Test ability</h4>
<ul><li>Targeting: Enabled ⇒ Removed</li><li>Damage: 10 (+20% AP) ⇒ <strong>20 (+20% AP)</strong></li></ul>
<h2 id="patch-classic">Classic</h2><h3>Test</h3><h4>Q - Test ability</h4><ul><li>Damage: 20 ⇒ 9999</li></ul></div>`;
const name = { ko_KR: "테스트", en_US: "Test", zh_CN: "测试" };
const sources = { ddragon: "16.20.1", cdragon: "16.20" };
const snapshot: PatchSnapshot = { schemaVersion: 1, patchVersion: "26.20", sources, entities: [{
  id: "Test", kind: "champion", name, metrics: [{ id: "cooldown", label: name, section: "Q",
    values: [10], unit: "seconds", favorable: "lower", sourceKey: "cooldown", sectionName: { ...name, en_US: "Test ability" } }],
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

test("목록 안의 모드 제목을 놓치거나 부모 목록을 변경 행으로 수집하지 않는다", () => {
  const article = parseOfficialArticle(`<h2>Champions</h2><h3>Test</h3><h4>Q - Test ability</h4>
    <ul><li><div><ul><li>Damage: 1 ⇒ 2</li></ul></div></li>
    <li><header><h2>Classic</h2></header></li><li>Damage: 2 ⇒ 9999</li></ul>`);
  assert.equal(article.rowCount, 1);
  assert.equal(article.entities[0].sections[0].rows[0].after, "2");
  const systems = parseOfficialArticle(html.replace('<h2 id="patch-classic">Classic</h2>',
    '<h2>Systems</h2><h4>Pets</h4><ul><li><h4>Support</h4><ul><li>Penalty: 25 ⇒ 33</li></ul></li></ul><h2>Classic</h2>'));
  assert.equal(systems.entities.find(entity => entity.title === "Support")?.sections[0].rows[0].after, "33");
});

test("한 목록에 합쳐진 두 수치 행을 분리하고 룬도 협곡 체계로 보존한다", () => {
  const article = parseOfficialArticle(html.replace('<h2 id="patch-classic">Classic</h2>',
    '<h2>Runes</h2><h3>Test rune</h3><li><strong>Healing</strong>: 6 ⇒ <strong>4</strong> <strong>Health</strong>: 400 ⇒ <strong>450</strong></li><h2>Classic</h2>'));
  const rune = article.entities.find(entity => entity.title === "Test rune")!;
  assert.equal(rune.kind, "system");
  assert.deepEqual(rune.sections[0].rows.map(row => [row.label, row.after]), [["Healing", "4"], ["Health", "450"]]);
  assert.throws(() => parseOfficialArticle(html.replace("Targeting: Enabled ⇒ Removed", "Damage: 1 ⇒ 2; Health: 3 ⇒ 4")));
});

test("서술형 변경의 제목과 조건, 천 단위 쉼표·문자로 쓴 숫자를 보존한다", () => {
  const article = parseOfficialArticle(html.replace("Targeting: Enabled ⇒ Removed", "New targeting: Small monsters are no longer valid targets"));
  assert.deepEqual(article.entities[0].sections[0].rows[0], {
    label: "New targeting", before: "", after: "Small monsters are no longer valid targets",
  });
  for (const [left, right] of [["3,200g", "3200골드"], ["every other attack", "기본 공격 2회마다"],
    ["twice", "2회"], ["Halved for Magic Damage", "마법 피해는 50% 효과"], ["up to double", "最高可達雙倍"]]) {
    assert.equal(officialNumberFingerprint(left), officialNumberFingerprint(right));
  }
  assert.notEqual(officialNumberFingerprint("25"), officialNumberFingerprint("5"));
});

test("번역 보정은 원문을 유지하고 지정한 누락 행만 추가하며 근거 불일치를 거부한다", () => {
  const corrected = archive();
  corrected.articles.zh_CN.entities[0].sections[0].rows.pop();
  corrected.articles.zh_CN.rowCount--;
  const missingRow = corrected.articles.en_US.entities[0].sections[0].rows[1];
  corrected.localizationCorrections = [{ locale: "zh_CN", entityIndex: 0, sectionIndex: 0, rowIndex: 1,
    original: null, replacement: missingRow, reason: "English and Korean both include this row" }];
  validateOfficialArchive(corrected, "26.20");
  assert.equal(localizedOfficialArticle(corrected, "zh_CN").rowCount, 2);
  assert.equal(corrected.articles.zh_CN.rowCount, 1);
  const result = applyOfficialPatch(comparePatchSnapshots({ ...snapshot, patchVersion: "26.19" }, snapshot), snapshot, corrected);
  assert.ok(result.officialSource?.note?.ko_KR.includes("보완"));
  corrected.localizationCorrections[0].original = missingRow;
  assert.throws(() => validateOfficialArchive(corrected, "26.20"));
});

test("같은 이름의 클래식 챔피언 대신 정식 게임 ID와 일치하는 챔피언만 연결한다", () => {
  const after = { ...snapshot, entities: [...snapshot.entities, { ...snapshot.entities[0], id: "Jade_Test" }] };
  const result = applyOfficialPatch(comparePatchSnapshots({ ...after, patchVersion: "26.19" }, after), after, archive());
  assert.deepEqual(result.entries.map(entity => entity.id), ["Test"]);
});

test("가격·재시전 간격·시전 후 잠금 증가를 상향으로 뒤집지 않는다", () => {
  for (const label of ["Cost", "Recipe", "Time Between Casts", "Post-Cast Lockout", "Attack Cast Time", "Gold Penalty"]) {
    assert.equal(officialImpact({ label, before: "1", after: "2" }), "nerf", label);
  }
});

test("R 재사용 스킬과 모방 스킬을 원래 R의 이름으로 합치지 않는다", () => {
  const original = archive();
  const article = parseOfficialArticle(`<h2>Champions</h2><h3>Test</h3>
    <h4>R - Base R</h4><li>Damage: 1 ⇒ 2</li>
    <h4>RW - Mimic: Distortion</h4><li>Damage: 3 ⇒ 4</li>`);
  for (const locale of ["en_US", "ko_KR", "zh_CN"] as const) original.articles[locale] = { ...original.articles[locale], ...article };
  const after = { ...snapshot, entities: [{ ...snapshot.entities[0], metrics: [] }] };
  const catalog = { Test: { passive: { name: "Passive" }, spells: ["Q", "W", "E", "Base R"].map(name => ({ name })) } };
  const result = applyOfficialPatch(comparePatchSnapshots({ ...after, patchVersion: "26.19" }, after), after, original,
    { en_US: catalog, ko_KR: catalog, zh_CN: catalog });
  assert.deepEqual(result.entries[0].changes.map(change => [change.section, change.sectionName?.en_US]),
    [["R", "Base R"], ["R", "Mimic: Distortion"]]);
});

test("이름이 바뀐 아이템은 근거 있는 ID 연결만 허용한다", () => {
  const original = archive();
  for (const locale of ["en_US", "ko_KR", "zh_CN"] as const) {
    original.articles[locale].entities.push({ kind: "item", title: "Old item name", sections: [{ title: "", rows: [
      { label: "Cost", before: "600", after: "700" },
    ] }] });
    original.articles[locale].rowCount++;
  }
  const after: PatchSnapshot = { ...snapshot, entities: [...snapshot.entities, { id: "3068", kind: "item", name, metrics: [] }] };
  const report = comparePatchSnapshots({ ...after, patchVersion: "26.19" }, after);
  assert.throws(() => applyOfficialPatch(report, after, original));
  original.entityMappings = [{ entityIndex: 1, ids: ["3068"], reason: "Same item with a legacy name" }];
  assert.equal(applyOfficialPatch(report, after, original).entries[1].id, "3068");
  original.entityMappings[0].ids = ["missing"];
  assert.throws(() => applyOfficialPatch(report, after, original));
});

test("아이템 효과의 숫자가 기본 체력과 같아도 체력 아이콘으로 연결하지 않는다", () => {
  const original = archive();
  for (const locale of ["en_US", "ko_KR", "zh_CN"] as const) {
    original.articles[locale].entities.push({ kind: "item", title: "Item", sections: [{ title: "", rows: [
      { label: "Duration", before: "3", after: "4" }, { label: "Health", before: "3", after: "4" },
    ] }] });
    original.articles[locale].rowCount += 2;
  }
  const after: PatchSnapshot = { ...snapshot, entities: [...snapshot.entities, {
    id: "Item", kind: "item", name: { ...name, en_US: "Item" }, metrics: [{
      ...snapshot.entities[0].metrics[0], id: "Items/Item/mFlatHPPoolMod", section: "stats", sectionName: undefined,
      label: { ...name, en_US: "Health" }, sourceKey: "Items/Item/mFlatHPPoolMod", values: [4],
    }],
  }] };
  const result = applyOfficialPatch(comparePatchSnapshots({ ...after, patchVersion: "26.19" }, after), after, original);
  const changes = result.entries[1].changes as TextPatchChange[];
  assert.equal(changes[0].gameDataKey, undefined);
  assert.equal(changes[1].gameDataKey, "Items/Item/mFlatHPPoolMod");
});

test("슬롯 접두사가 없는 무기 제목도 기존의 독립된 Q 스킬에 연결한다", () => {
  const original = archive();
  for (const locale of ["en_US", "ko_KR", "zh_CN"] as const) original.articles[locale] = {
    ...original.articles[locale], ...parseOfficialArticle(html.replace("Q - Test ability", "Calibrum")),
  };
  const after = { ...snapshot, entities: [{ ...snapshot.entities[0], metrics: [{
    ...snapshot.entities[0].metrics[0], sectionName: { ...name, en_US: "Calibrum · Moonshot" }, values: [20],
  }] }] };
  const before = { ...after, patchVersion: "26.19", entities: [{ ...after.entities[0], metrics: [{
    ...after.entities[0].metrics[0], values: [10],
  }] }] };
  const result = applyOfficialPatch(comparePatchSnapshots(before, after), after, original);
  assert.equal(result.entries[0].changes[0].section, "Q");
  assert.equal(result.entries[0].changes[0].sectionName?.en_US, "Calibrum · Moonshot");
});

test("다른 모드의 같은 제목·ID가 협곡으로 다시 들어오지 않는다", () => {
  const result = parseOfficialArticle(`<h2 id="patch-champions">Champions</h2><h3>Test</h3><h4>Q - Test ability</h4>
    <li>Damage: 10 ⇒ 20</li><h2>Arena</h2><h2 id="patch-champions">Champions (Arena)</h2>
    <h3>Test</h3><li>Damage: 30 ⇒ 40</li><h2 id="patch-items">Items</h2><h3>Other</h3><li>Health: 50 ⇒ 60</li>`);
  assert.equal(result.rowCount, 1);
  assert.equal(result.entities.length, 1);
  assert.equal(result.coverage?.at(-1)?.scope, "mode");
});

test("시즌 시작의 별도 체계·신규 아이템·챔피언 소개 제목도 수집한다", () => {
  const result = parseOfficialArticle(`<h2 id="patch-role-quests">Role Quests</h2><li>Experience: 100 ⇒ 120</li>
    <h2 id="patch-new-items">New Items</h2><h4>First</h4><li>Health: 100</li><h4>Second</h4><li>Damage: 20</li>
    <h2 id="patch-test-update">Test Update</h2><h4>Q - Test ability</h4><li>Damage: 10 ⇒ 20</li>`, { champions: { Test: ["Test"] } });
  assert.deepEqual(result.entities.map(entry => [entry.kind, entry.title]), [["system", "Role Quests"], ["item", "First"], ["item", "Second"], ["champion", "Test"]]);
});

test("콜론이 없는 강조 제목과 문장·괄호 안의 추가 비교를 그대로 보존한다", () => {
  const result = parseOfficialArticle(html.replace("Damage: 10 (+20% AP) ⇒ <strong>20 (+20% AP)</strong>", "<strong>Damage</strong> 10 ⇒ 20 (5 ⇒ 10)")
    .replace("Targeting: Enabled ⇒ Removed", "Landing time reduced from 2s ⇒ 1.5s"));
  const rows = result.entities[0].sections[0].rows;
  assert.deepEqual(rows[1], { label: "Damage", before: "10", after: "20 (5 ⇒ 10)" });
  assert.deepEqual(rows[0], { label: "", before: "Landing time reduced from 2s", after: "1.5s" });
});

test("새로운 목록 영역이 분류되지 않으면 공식 보관·배포 검증에서 거부한다", () => {
  const original = archive();
  original.articles.en_US.coverage = [{ title: "New objective", scope: "unknown", rows: 1 }];
  assert.throws(() => validateOfficialArchive(original, "26.20"), /sections unclassified/);
});
