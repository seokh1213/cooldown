import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { decodePatchNotesIndex, decodePatchNotesReport, type PatchSnapshot } from "../../../../src/domain/game/contracts/patchNotes";
import { DATA_LOCALES } from "../../../../src/domain/game/contracts/staticData";
import { decodePatchSkillArchive, patchSkillKey } from "../../../../src/domain/game/contracts/patchSkills";
import { groupPatchChanges } from "../../../../src/features/patch-notes/data/model";

const reports = path.resolve("public/patch-notes");
const archives = path.resolve("dev/data/patch-notes");
const read = (file: string): unknown => JSON.parse(fs.readFileSync(file, "utf8"));
const index = decodePatchNotesIndex(read(path.join(reports, "index.json")));

test("현재 패치에 변경 보고서가 있고 원본 보관 파일을 서비스하지 않는다", () => {
  const manifest = read(path.resolve("public/data/version.json")) as { patchVersion: string };
  assert.equal(index.latest, manifest.patchVersion);
  assert.equal(index.patches[0].patchVersion, index.latest);
  assert.equal(fs.existsSync(path.join(reports, "sources")), false);
  assert.equal(fs.existsSync(path.join(reports, "snapshots")), false);
  assert.equal(fs.existsSync(path.join(reports, "icon-catalogs")), false);
  assert.equal(index.patches.some(patch => patch.previousPatchVersion === null), false);
  assert.equal(new Set(index.patches.map(patch => patch.patchVersion)).size, index.patches.length);
});

test("모든 패치 보고서의 양쪽 수치를 실제 보관 스냅샷에서 확인한다", () => {
  for (const patch of index.patches) {
    const report = decodePatchNotesReport(read(path.join(reports, `${patch.patchVersion}.json`)), patch.patchVersion);
    assert.equal(report.previousPatchVersion, patch.previousPatchVersion, patch.patchVersion);
    const before = read(path.join(archives, "snapshots", `${report.previousPatchVersion}.json`)) as PatchSnapshot;
    const after = read(path.join(archives, "snapshots", `${report.patchVersion}.json`)) as PatchSnapshot;
    assert.deepEqual(report.previousSources, before.sources, patch.patchVersion);
    assert.deepEqual(report.sources, after.sources, patch.patchVersion);
    const oldEntities = new Map(before.entities.map(entity => [entity.id, entity]));
    const newEntities = new Map(after.entities.map(entity => [entity.id, entity]));
    for (const entry of report.entries) {
      for (const change of entry.changes) {
        if (change.valueType === "text") continue;
        const where = `${patch.patchVersion} ${entry.id} ${change.id}`;
        assert.deepEqual(change.before, oldEntities.get(entry.id)?.metrics.find(metric => metric.id === change.id)?.values, where);
        assert.deepEqual(change.after, newEntities.get(entry.id)?.metrics.find(metric => metric.id === change.id)?.values, where);
      }
    }
    const review = read(path.join(archives, "reviews", `${report.patchVersion}.json`)) as { changes: unknown[] };
    assert.equal(report.reviewCount, review.changes.length, patch.patchVersion);
    assert.ok(fs.existsSync(path.join(archives, "sources", `${report.previousPatchVersion}.json`)));
    assert.ok(fs.existsSync(path.join(archives, "sources", `${report.patchVersion}.json`)));
  }
});

function validateSkillArchive(patch: (typeof index.patches)[number]): void {
  const report = decodePatchNotesReport(read(path.join(reports, `${patch.patchVersion}.json`)), patch.patchVersion);
  for (const locale of DATA_LOCALES) {
    const skills = decodePatchSkillArchive(read(path.join(reports, "skills", `${patch.patchVersion}.${locale}.json`)), {
      patchVersion: report.patchVersion, sources: report.sources, locale,
    });
    for (const entry of report.entries.filter(entry => entry.kind === "champion")) {
      for (const group of groupPatchChanges(entry.changes, locale).filter(group => group.section !== "stats")) {
        const info = skills.champions[entry.id]?.[patchSkillKey(group.section, group.title)];
        const where = `${patch.patchVersion}.${locale} ${entry.id} ${group.section}`;
        assert.equal(info?.slot, group.section, where);
        assert.equal(info?.passive?.name ?? info?.skill?.name, group.title, where);
        for (const icon of info?.icons ?? []) assert.ok(fs.existsSync(path.resolve("public", icon.file)), icon.file);
      }
    }
  }
}

test("모든 패치와 언어에서 변경된 스킬의 당시 상세 정보를 제공한다", () => {
  for (const patch of index.patches) validateSkillArchive(patch);
});
