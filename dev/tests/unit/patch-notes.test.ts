import assert from "node:assert/strict";
import { test } from "node:test";
import { comparePatchSnapshots, sameNumbers } from "../../scripts/patch-notes/diff";
import { extendPatchNotesIndex } from "../../scripts/patch-notes/archive";
import { buildMetric, flattenNumbers } from "../../scripts/patch-notes/collect";
import { decodePatchNotesIndex, decodePatchNotesReport, type PatchMetric, type PatchSnapshot } from "../../../src/domain/game/contracts/patchNotes";
import { filterPatchEntries, formatPatchValues } from "../../../src/features/patch-notes/model";
import { findUnmappedChanges } from "../../scripts/patch-notes/review";
import { patchReleases, planCurrentComparison, planCurrentComparisons, planPatchComparisons } from "../../scripts/patch-notes/plan";

const name = { ko_KR: "테스트", en_US: "Test", zh_CN: "测试" };
const sources = { ddragon: "16.19.1", cdragon: "16.19" };

function metric(id: string, values: number[], favorable: PatchMetric["favorable"] = "higher"): PatchMetric {
  return { id, values, favorable, label: name, section: "W", unit: "number", sourceKey: id };
}

function snapshot(patch: string, metrics: PatchMetric[]): PatchSnapshot {
  return { schemaVersion: 1, patchVersion: patch, sources, entities: [{ id: "Test", kind: "champion", name, metrics }] };
}

test("쿨타임 감소는 상향이고 소모량 증가는 하향이다", () => {
  const before = snapshot("26.18", [metric("cooldown", [20, 18, 16], "lower"), metric("cost", [35, 45], "lower")]);
  const after = snapshot("26.19", [metric("cooldown", [18, 16.5, 15], "lower"), metric("cost", [40, 50], "lower")]);
  const report = comparePatchSnapshots(before, after);
  assert.equal(report.entries[0].changes[0].impact, "buff");
  assert.equal(report.entries[0].changes[1].impact, "nerf");
  assert.equal(report.entries[0].impact, "adjustment");
});

test("표현 변경·부동소수점 오차를 게임 변경으로 보고하지 않는다", () => {
  assert.equal(sameNumbers([0.3], [0.30000001192092896]), true);
  assert.equal(sameNumbers([3], [3.9]), false);
  const before = snapshot("26.18", [metric("damage", [100])]);
  const after = snapshot("26.19", [{ ...metric("damage", [100]), label: { ...name, ko_KR: "번역 변경" } }]);
  assert.equal(comparePatchSnapshots(before, after).entries.length, 0);
});

test("의미를 판정할 수 없거나 랭크별 방향이 섞이면 조정이다", () => {
  const report = comparePatchSnapshots(snapshot("26.18", [metric("duration", [2], "unknown"), metric("damage", [20, 40])]),
    snapshot("26.19", [metric("duration", [3], "unknown"), metric("damage", [30, 35])]));
  assert.deepEqual(report.entries[0].changes.map(change => change.impact), ["adjustment", "adjustment"]);
});

test("과거 보고서를 유지하고 스냅샷만 있는 버전은 화면 색인에서 제외한다", () => {
  const first = extendPatchNotesIndex(undefined, "26.19", "26.18");
  assert.equal(first.patches.some(patch => patch.patchVersion === "26.18"), false);
  const next = extendPatchNotesIndex(first, "26.20", "26.19");
  assert.equal(next.patches.find(patch => patch.patchVersion === "26.19")?.previousPatchVersion, "26.18");
  const backfill = extendPatchNotesIndex(next, "26.18", "26.17");
  assert.equal(backfill.latest, "26.20");
  assert.equal(backfill.patches.length, 3);
});

test("연간 소급 수집은 연도 경계와 두 자릿수 패치를 순서대로 비교한다", () => {
  const releases = patchReleases(["16.19.1", "16.10.1", "16.2.2", "16.2.1", "16.1.1", "15.24.1"]);
  assert.equal(releases.get("26.2"), "16.2.2");
  assert.deepEqual(planPatchComparisons(releases, "26"), [
    { previous: "25.24", current: "26.1" }, { previous: "26.1", current: "26.2" },
    { previous: "26.2", current: "26.10" }, { previous: "26.10", current: "26.19" },
  ]);
  assert.deepEqual(planCurrentComparison(releases, "26.2"), { previous: "26.1", current: "26.2" });
  assert.throws(() => planCurrentComparison(releases, "26.20"));
  assert.throws(() => planPatchComparisons(releases, "../26"));
  assert.deepEqual(planPatchComparisons(patchReleases(["15.1.1", "14.24.1"]), "25"), [
    { previous: "14.24", current: "25.1" },
  ]);
});

test("상향 필터는 혼합 변경 중 상향 수치만 남기고 다른 언어의 이름도 검색한다", () => {
  const report = comparePatchSnapshots(snapshot("26.18", [metric("damage", [20]), metric("cooldown", [20], "lower")]),
    snapshot("26.19", [metric("damage", [10]), metric("cooldown", [15], "lower")]));
  const filtered = filterPatchEntries(report.entries, { query: "Test", kind: "champion", impact: "buff" });
  assert.deepEqual(filtered[0].changes.map(change => change.id), ["cooldown"]);
  assert.equal(filterPatchEntries(report.entries, { query: "없음", kind: "all", impact: "all" }).length, 0);
});

test("CI는 누락된 과거 보고서를 순서대로 채우고 수집한 현재 판본을 넘지 않는다", () => {
  const releases = patchReleases(["17.1.1", "16.24.1", "16.23.1", "16.22.1", "16.21.1"]);
  assert.deepEqual(planCurrentComparisons(releases, "26.24", ["26.22"]), [
    { previous: "26.22", current: "26.23" }, { previous: "26.23", current: "26.24" },
  ]);
  assert.deepEqual(planCurrentComparisons(releases, "27.1", ["26.22", "26.24"]), [
    { previous: "26.22", current: "26.23" }, { previous: "26.24", current: "27.1" },
  ]);
  assert.deepEqual(planCurrentComparisons(releases, "26.24", ["26.22", "26.23", "26.24"]), [
    { previous: "26.23", current: "26.24" },
  ]);
  assert.deepEqual(planCurrentComparisons(releases, "26.24", []), [{ previous: "26.23", current: "26.24" }]);
});

test("고정된 단위·랭크 배열·레벨 범위를 표시한다", () => {
  const report = comparePatchSnapshots(snapshot("26.18", [metric("cooldown", [20, 18])]), snapshot("26.19", [metric("cooldown", [18, 16.5])]));
  const numeric = report.entries[0].changes[0];
  assert.notEqual(numeric.valueType, "text");
  if (numeric.valueType === "text") assert.fail("Expected a numeric snapshot change");
  const change = { ...numeric, unit: "seconds" as const };
  assert.equal(formatPatchValues(change, "after", "초"), "18 / 16.5초");
  assert.equal(formatPatchValues({ ...change, unit: "percent", format: "range" }, "before", "초"), "20–18%");
});

test("게임 숫자를 추출하고 퍼센트 변환에서 오차를 제거한다", () => {
  assert.deepEqual(flattenNumbers({ damage: { __type: "GameCalculation", values: [12, 22], ratio: 0.1 } }),
    { "/damage/values": [12, 22], "/damage/ratio": [0.1] });
  assert.deepEqual(buildMetric("ratio", [0.3000000119, 0.3000000119], { label: name, factor: 100, unit: "percent" }, "P").values, [30]);
});

test("다른 패치와 손상된 수치 파일을 거부한다", () => {
  const report = comparePatchSnapshots(snapshot("26.18", [metric("damage", [10])]), snapshot("26.19", [metric("damage", [20])]));
  assert.equal(decodePatchNotesReport(report, "26.19").entries.length, 1);
  assert.throws(() => decodePatchNotesReport(report, "26.18"));
  assert.throws(() => decodePatchNotesReport({ ...report, entries: [{ ...report.entries[0], changes: [{ ...report.entries[0].changes[0], after: ["20"] }] }] }, "26.19"));
  assert.throws(() => decodePatchNotesIndex({ schemaVersion: 1, latest: "26.19", patches: [{ patchVersion: "../secret", previousPatchVersion: null }] }));
});

test("미매핑 수치는 자연어로 해석하지 않고 원본 키와 수치로 검토 목록에 남긴다", () => {
  const source = (values: number[]) => ({ Test: { name: "Test", stats: {}, spells: {
    "Characters/Test/Spells/TestQ": { values: { UnknownField: values }, calculations: {} },
  } } });
  const review = findUnmappedChanges(source([10]), source([15]));
  assert.equal(review.length, 1);
  assert.deepEqual(review[0].before, [10]);
  assert.deepEqual(review[0].after, [15]);
  assert.equal(review[0].sourceKey, "Characters/Test/Spells/TestQ/values/UnknownField");
});

test("해시로 된 원본 스킬도 고정 용어에 매핑되었으면 검토 목록에 중복되지 않는다", () => {
  const source = (value: number) => ({ Aphelios: { name: "Aphelios", stats: {}, spells: {
    "{b3ce4169}": { values: {}, calculations: { "/{dec81e53}/mFormulaParts/0/mNumber": [value] } },
  } } });
  assert.deepEqual(findUnmappedChanges(source(0.1), source(0.15)), []);
});
