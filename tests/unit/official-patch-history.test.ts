import assert from "node:assert/strict";
import { test } from "node:test";
import { officialChampionIcons, parseOfficialArticle } from "../../scripts/patch-notes/officialParser";
import { validateOfficialArchive, type OfficialPatchArchive } from "../../scripts/patch-notes/official";
import { localizedOfficialArticle, officialNumberFingerprint } from "../../scripts/patch-notes/officialLocalization";
import { applyOfficialPatch, officialIdentitySnapshot } from "../../scripts/patch-notes/officialReport";
import { comparePatchSnapshots } from "../../scripts/patch-notes/diff";
import { decodePatchNotesReport, type PatchSnapshot } from "../../src/data/contracts/patchNotes";

function archive(html = "<h2>Champions</h2><h3>Test</h3><li>Damage: 10 ⇒ 20</li>"): OfficialPatchArchive {
  const article = { ...parseOfficialArticle(html), url: "https://www.leagueoflegends.com/en-us/news/game-updates/test/", sha256: "a".repeat(64) };
  return { schemaVersion: 1, patchVersion: "26.1", fetchedAt: "2026-10-08T00:00:00Z", articles: {
    en_US: structuredClone(article), ko_KR: structuredClone(article), zh_CN: structuredClone(article),
  } };
}

test("모드 내부의 모르는 중간 제목 뒤에도 협곡 영역으로 복귀하지 않는다", () => {
  const result = parseOfficialArticle(`<h2>Champions</h2><h3>Test</h3><li>Damage: 1 ⇒ 2</li>
    <h2>ARAM</h2><h2>Death Screen Effect</h2><h2>Systems</h2><h4>Other</h4><li>Damage: 3 ⇒ 999</li>`);
  assert.equal(result.rowCount, 1);
  assert.equal(result.coverage?.at(-1)?.scope, "mode");
});

test("닫히지 않은 h3가 설명·스킬을 가두어도 대상과 변경을 잃지 않는다", () => {
  const result = parseOfficialArticle(`<h2>Champions</h2><h3><a>Test</a><h3><p>Summary</p>
    <blockquote>Context</blockquote><h4>Q - First</h4><li>Damage: 1 ⇒ 2</li>`);
  assert.deepEqual(result.entities.map(entity => entity.title), ["Test"]);
  assert.equal(result.entities[0].sections[0].title, "Q - First");
  assert.equal(result.rowCount, 1);
});

test("잘못 닫은 강조 태그가 목록을 감싸도 업그레이드별 적용 대상을 유지한다", () => {
  const result = parseOfficialArticle(`<h2>Champions</h2><h3>Test</h3><li>Damage: 1 ⇒ 2</li>
    <h2 id="patch-feats-of-strength">Feats of Strength</h2><p><strong>Boots</strong></p><ul><li>750 gold</li></ul>
    <p><strong>Cassiopeia<strong></p><ul><li>Passive: 4 ⇒ 6</li></ul>`);
  assert.deepEqual(result.entities[1].sections.map(section => section.title), ["Boots", "Cassiopeia"]);
});

test("역할 퀘스트의 진행·보상에 상단·정글 문맥을 붙여 구분한다", () => {
  const result = parseOfficialArticle(`<h2 id="patch-role-quests">Role Quests</h2><h4>Top Lane</h4>
    <h4>Quest Progress:</h4><li>Points: 10 ⇒ 20</li><h4>Quest Rewards:</h4><li>XP: 10 ⇒ 30</li>
    <h4>Jungle</h4><h4>Quest Rewards:</h4><li>XP: 10 ⇒ 40</li><h2>Champions</h2><h3>Test</h3><li>Damage: 1 ⇒ 2</li>`);
  assert.deepEqual(result.entities[0].sections.map(section => section.title), [
    "Top Lane · Quest Progress:", "Top Lane · Quest Rewards:", "Jungle · Quest Rewards:",
  ]);
});

test("공통 스킬 이미지로 ID 없는 번역판 챔피언 소개를 연결한다", () => {
  const champions = { Test: ["Test", "테스트"] };
  const english = '<h2 id="patch-test">Test</h2><h4><img src="https://example.com/hash.png">Q - Skill</h4><li>Damage: 1 ⇒ 2</li>';
  const translated = english.replace('id="patch-test"', "").replace(">Test<", ">新英雄<");
  const championIcons = officialChampionIcons(english, champions);
  assert.equal(parseOfficialArticle(translated, { champions, championIcons }).entities[0].title, "Test");
});

test("콜론이 괄호나 타임스탬프 안에 있으면 문장 조건을 제목으로 잘라내지 않는다", () => {
  const result = parseOfficialArticle('<h2>Champions</h2><h3>Test</h3><li>Gold rises by 10 at level 7 (Maximum: 420g)</li><li>Spawn: 6:00 ⇒ 8:00</li>');
  assert.equal(result.entities[0].sections[0].rows[0].after, "Gold rises by 10 at level 7 (Maximum: 420g)");
  assert.equal(result.entities[0].sections[0].rows[1].before, "6:00");
  assert.equal(officialNumberFingerprint("4.5 minutes"), officialNumberFingerprint("4분 30초"));
  assert.notEqual(officialNumberFingerprint("every 1 second"), officialNumberFingerprint("every 2 seconds"));
  assert.notEqual(officialNumberFingerprint("10/20/30 (+50% AP)"), officialNumberFingerprint("10/30/20 (+50% AP)"));
  assert.equal(officialNumberFingerprint("700/1,050/1,400"), officialNumberFingerprint("700/1050/1400"));
});

test("영어 원문도 보정할 수 있고 검증 기준은 보정한 영어를 따른다", () => {
  const source = archive();
  const original = source.articles.en_US.entities[0].sections[0].rows[0];
  original.after = "1020";
  source.localizationCorrections = [{ locale: "en_US", entityIndex: 0, sectionIndex: 0, rowIndex: 0,
    original: { ...original }, replacement: { ...original, after: "20" }, reason: "Two other official locales retain 20" }];
  validateOfficialArchive(source, "26.1");
  assert.equal(original.after, "1020");
  assert.equal(localizedOfficialArticle(source, "en_US").entities[0].sections[0].rows[0].after, "20");
});

test("통째로 누락된 대상 보완도 원문·이유·위치를 검증하고 원본은 유지한다", () => {
  const source = archive("<h2>Champions</h2><h3>Test</h3><li>Damage: 10 ⇒ 20</li><h2>Items</h2><h3>Removed</h3><li>Removed.</li>");
  const replacement = source.articles.zh_CN.entities.pop()!;
  source.articles.zh_CN.rowCount--;
  source.entityCorrections = [{ locale: "zh_CN", entityIndex: 1, original: null, replacement, reason: "Both other articles list removal" }];
  validateOfficialArchive(source, "26.1");
  assert.equal(source.articles.zh_CN.entities.length, 1);
  source.entityCorrections[0].original = replacement;
  assert.throws(() => validateOfficialArchive(source, "26.1"), /does not match source/);
});

test("표현 차이 승인은 정확한 두 원문에만 적용하고 수치 변화·중복 승인을 거부한다", () => {
  const source = archive();
  const row = source.articles.ko_KR.entities[0].sections[0].rows[0];
  row.after = "대상 1명당 20";
  assert.throws(() => validateOfficialArchive(source, "26.1"), /values differ/);
  source.valueEquivalences = [{ locale: "ko_KR", entityIndex: 0, sectionIndex: 0, rowIndex: 0,
    original: { ...row }, reference: source.articles.en_US.entities[0].sections[0].rows[0], reason: "Per target explicitly states one target" }];
  validateOfficialArchive(source, "26.1");
  source.valueEquivalences.push(source.valueEquivalences[0]);
  assert.throws(() => validateOfficialArchive(source, "26.1"), /duplicated/);
  source.valueEquivalences.pop(); row.after = "대상 1명당 30";
  assert.throws(() => validateOfficialArchive(source, "26.1"), /does not match source/);
});

test("삭제 아이템은 직전 이름을 쓰고 현존 아이템에 직전 동명 ID를 섞지 않는다", () => {
  const source = archive("<h2>Champions</h2><h3>Test</h3><li>Damage: 10 ⇒ 20</li><h2>Items</h2><h3>Item</h3><li>Health: 10 ⇒ 20</li><h3>Removed</h3><li>Removed.</li>");
  const name = (en_US: string) => ({ en_US, ko_KR: en_US, zh_CN: en_US });
  const after: PatchSnapshot = { schemaVersion: 1, patchVersion: "26.1", sources: { ddragon: "16.1.1", cdragon: "16.1" }, entities: [
    { id: "Test", kind: "champion", name: name("Test"), metrics: [] },
    { id: "3095", kind: "item", name: name("Item"), metrics: [] },
    { id: "323095", kind: "item", name: name("Item"), metrics: [] },
  ] };
  const before: PatchSnapshot = { ...after, patchVersion: "25.24", entities: [after.entities[0],
    { ...after.entities[1], id: "3097" }, { ...after.entities[1], id: "4643", name: name("Removed") }] };
  const result = applyOfficialPatch(comparePatchSnapshots(before, after), officialIdentitySnapshot(after, before), source);
  assert.deepEqual(result.entries.map(entry => entry.id), ["Test", "3095", "4643"]);
  result.entries[1].icon = "patch-notes/item-icons/26.1/3095.webp";
  assert.doesNotThrow(() => decodePatchNotesReport(result, "26.1"));
  result.entries[1].icon = "../../external.png";
  assert.throws(() => decodePatchNotesReport(result, "26.1"), /historical item icon/);
});
