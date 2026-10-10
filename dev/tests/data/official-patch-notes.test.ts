import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { decodePatchNotesReport, type TextPatchChange } from "../../../src/domain/game/contracts/patchNotes";
import { DATA_LOCALES } from "../../../src/domain/game/contracts/staticData";
import { validateOfficialArchive, type OfficialPatchArchive } from "../../scripts/patch-notes/official";
import { localizedOfficialArticle } from "../../scripts/patch-notes/officialLocalization";
import { applyOfficialPatch, officialIdentitySnapshot } from "../../scripts/patch-notes/officialReport";
import { comparePatchSnapshots } from "../../scripts/patch-notes/diff";
import { applyCachedItemIcons } from "../../scripts/patch-notes/itemIcons";
import { IMAGE_VERSION } from "../../../src/infrastructure/generated/assetVersion";

const read = (file: string) => JSON.parse(fs.readFileSync(file, "utf8"));

function verifyLocalizedRow(change: TextPatchChange, itemId: string, archive: OfficialPatchArchive): void {
  const match = /^official\/(\d+)\/(\d+)\/(\d+)$/.exec(change.sourceKey);
  assert.ok(match, change.sourceKey);
  const [, entityIndex, sectionIndex, rowIndex] = match.map(Number);
  for (const locale of DATA_LOCALES) {
    const row = localizedOfficialArticle(archive, locale).entities[entityIndex].sections[sectionIndex].rows[rowIndex];
    assert.equal(change.label[locale], row.label || { ko_KR: "변경 사항", en_US: "Change", zh_CN: "改动" }[locale]);
    if (archive.articles.en_US.entities[entityIndex].title === "World Atlas and Runic Compass") {
      const itemIndex = itemId === "3865" ? 0 : 1;
      assert.ok(["3865", "3866"].includes(itemId));
      assert.equal(change.before[locale], row.before.match(/\d+(?:\.\d+)?%?/g)?.[itemIndex]);
      assert.equal(change.after[locale], row.after.match(/\d+(?:\.\d+)?%?/g)?.[itemIndex]);
    } else {
      assert.equal(change.before[locale], row.before);
      assert.equal(change.after[locale], row.after);
    }
  }
}

test("공식 출처가 있는 모든 보고서는 원문의 모든 행과 3개 언어를 보존한다", () => {
  const index = read("public/patch-notes/index.json") as { latest: string; patches: Array<{ patchVersion: string }> };
  assert.ok(decodePatchNotesReport(read(`public/patch-notes/${index.latest}.json`), index.latest).officialSource,
    "The current patch must include official balance changes");
  for (const { patchVersion } of index.patches) {
    const report = decodePatchNotesReport(read(`public/patch-notes/${patchVersion}.json`), patchVersion);
    assert.ok(report.officialSource, `${patchVersion}: official archive required`);
    const archive = read(`dev/data/patch-notes/official/${patchVersion}.json`) as OfficialPatchArchive;
    validateOfficialArchive(archive, patchVersion);
    for (const locale of DATA_LOCALES) {
      assert.equal(report.officialSource.urls[locale], archive.articles[locale].url);
      assert.equal(report.officialSource.hashes[locale], archive.articles[locale].sha256);
    }
    const rows = new Set<string>();
    for (const entry of report.entries) {
      if (entry.kind === "item") assert.ok(fs.existsSync(entry.icon ? `public/${entry.icon}` :
        `public/img/${IMAGE_VERSION}/item/${entry.id}.webp`), `${patchVersion}: item icon ${entry.id}`);
      for (const change of entry.changes) {
        assert.equal(change.valueType, "text");
        const text = change as TextPatchChange;
        rows.add(change.sourceKey);
        verifyLocalizedRow(text, entry.id, archive);
      }
    }
    assert.equal(rows.size, localizedOfficialArticle(archive, "en_US").rowCount, patchVersion);
    for (const [entityIndex, entity] of localizedOfficialArticle(archive, "en_US").entities.entries()) {
      for (const [sectionIndex, section] of entity.sections.entries()) {
        for (const rowIndex of section.rows.keys()) assert.ok(rows.has(`official/${entityIndex}/${sectionIndex}/${rowIndex}`));
      }
    }
  }
  assert.equal(fs.existsSync("public/patch-notes/official"), false);
});

test("26.15~26.18은 공식 챔피언·아이템·룬·게임 체계를 빠짐없이 보존한다", () => {
  const counts = [
    ["26.15", 11, 3, 1, 69], ["26.16", 7, 10, 5, 49],
    ["26.17", 14, 2, 0, 32], ["26.18", 11, 1, 0, 30],
  ] as const;
  for (const [patch, champions, items, systems, rows] of counts) {
    const report = decodePatchNotesReport(read(`public/patch-notes/${patch}.json`), patch);
    assert.equal(report.officialSource?.rowCount, rows, patch);
    assert.equal(report.entries.filter(entry => entry.kind === "champion").length, champions, patch);
    assert.equal(report.entries.filter(entry => entry.kind === "item").length, items, patch);
    assert.equal(report.entries.filter(entry => entry.kind === "system").length, systems, patch);
    assert.equal(report.entries.reduce((sum, entry) => sum + entry.changes.length, 0), rows, patch);
    assert.equal(report.entries.some(entry => entry.id.startsWith("Jade_")), false, patch);
  }
});

test("중국어 원문의 누락·오타와 합쳐진 행을 숨기지 않고 올바른 변경으로 표시한다", () => {
  const original = read("dev/data/patch-notes/official/26.18.json") as OfficialPatchArchive;
  const correction = original.localizationCorrections![0];
  assert.ok(correction.original!.before.startsWith("5 / 50"));
  const report = decodePatchNotesReport(read("public/patch-notes/26.18.json"), "26.18");
  const zaahen = report.entries.find(entry => entry.id === "Zaahen")!.changes as TextPatchChange[];
  assert.ok(zaahen.some(change => change.before.zh_CN.startsWith("25 / 50")));
  assert.ok(report.officialSource?.note);
  const belveth = decodePatchNotesReport(read("public/patch-notes/26.15.json"), "26.15")
    .entries.find(entry => entry.id === "Belveth")!.changes as TextPatchChange[];
  assert.ok(belveth.some(change => change.label.en_US === "Out of Combat Move Speed" && change.after.zh_CN === "移除"));
  const sky = decodePatchNotesReport(read("public/patch-notes/26.16.json"), "26.16")
    .entries.find(entry => entry.id === "6610")!.changes as TextPatchChange[];
  assert.equal(sky.length, 3);
  assert.ok(sky.some(change => change.label.zh_CN === "生命" && change.after.zh_CN === "450"));
});

test("색인의 모든 패치를 오프라인 재생성해도 공개 보고서와 스킬 연결이 같다", async () => {
  for (const { patchVersion: patch } of read("public/patch-notes/index.json").patches) {
    const published = decodePatchNotesReport(read(`public/patch-notes/${patch}.json`), patch);
    const before = read(`dev/data/patch-notes/snapshots/${published.previousPatchVersion}.json`);
    const after = read(`dev/data/patch-notes/snapshots/${patch}.json`);
    const numeric = comparePatchSnapshots(before, after);
    numeric.reviewCount = published.reviewCount;
    const catalogs = {
      ko_KR: read(`dev/data/patch-notes/skill-catalogs/${patch}.ko_KR.json`),
      en_US: read(`dev/data/patch-notes/skill-catalogs/${patch}.en_US.json`),
      zh_CN: read(`dev/data/patch-notes/skill-catalogs/${patch}.zh_CN.json`),
    };
    const rebuilt = applyOfficialPatch(numeric, officialIdentitySnapshot(after, before), read(`dev/data/patch-notes/official/${patch}.json`), catalogs);
    await applyCachedItemIcons(rebuilt);
    assert.deepEqual(JSON.parse(JSON.stringify(rebuilt)), published, patch);
  }
});

test("26.20의 누락된 챔피언 7종·아이템 3종·동작 변경을 복원했다", () => {
  const report = decodePatchNotesReport(read("public/patch-notes/26.20.json"), "26.20");
  assert.equal(report.entries.filter(entry => entry.kind === "champion").length, 16);
  assert.equal(report.entries.filter(entry => entry.kind === "item").length, 3);
  assert.equal(report.officialSource?.rowCount, 34);
  for (const id of ["Ambessa", "Diana", "Kennen", "Neeko", "Smolder", "TahmKench", "Yunara", "3073", "3152", "3085"]) {
    assert.ok(report.entries.some(entry => entry.id === id), id);
  }
  const changes = (id: string) => report.entries.find(entry => entry.id === id)!.changes as TextPatchChange[];
  assert.ok(changes("Kindred").some(change => change.after.ko_KR === "삭제"));
  assert.ok(changes("Yunara").some(change => change.after.ko_KR.includes("중첩되지")));
  assert.ok(changes("TahmKench").some(change => change.before.ko_KR === "10/13.75/17.5/21.25/25" && change.after.ko_KR === "10/20/30/40/50"));
  assert.ok(changes("3152").some(change => change.before.ko_KR === "20" && change.after.ko_KR === "10"));
});

test("26.19는 마스터 이·순간이동과 공식 랭크별 수치·조건을 보존한다", () => {
  const report = decodePatchNotesReport(read("public/patch-notes/26.19.json"), "26.19");
  assert.equal(report.entries.filter(entry => entry.kind === "champion").length, 17);
  assert.equal(report.entries.filter(entry => entry.kind === "item").length, 2);
  assert.equal(report.entries.filter(entry => entry.kind === "system").length, 1);
  assert.equal(report.officialSource?.rowCount, 41);
  assert.ok(report.entries.some(entry => entry.id === "MasterYi"));
  const aurora = report.entries.find(entry => entry.id === "Aurora")!.changes as TextPatchChange[];
  assert.equal(aurora.find(change => change.section === "R")!.before.ko_KR, "1.75/2.5/3.25초");
  assert.equal(aurora.find(change => change.section === "R")!.after.ko_KR, "2.25/2.75/3.25초");
  const aphelios = report.entries.find(entry => entry.id === "Aphelios")!.changes as TextPatchChange[];
  assert.ok(aphelios.some(change => change.before.ko_KR.includes("9/8.25/7.5/6.75/6초") && change.after.ko_KR.includes("8/7.25/6.5/5.75/5초")));
});
