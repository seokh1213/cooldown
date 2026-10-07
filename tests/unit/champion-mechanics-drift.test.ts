import assert from "node:assert/strict";
import test from "node:test";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { compareInventory, loadBaseline, semanticFingerprint, type Baseline } from "../../scripts/llm/champion-mechanics/drift";
import { buildInventory, digest } from "../../scripts/llm/champion-mechanics/sources";
import { sourceNumbers } from "../../scripts/llm/champion-mechanics/numbers";
import { SLOTS, emptyEffect, type Draft, type Job } from "../../scripts/llm/champion-mechanics/contract";
import { prepare } from "../../scripts/llm/champion-mechanics/prepare";
import { stageUpdate } from "../../scripts/llm/champion-mechanics/refresh";
import { exportRecords } from "../../scripts/llm/champion-mechanics/export";
import { reviewedAbilities } from "../../scripts/llm/champion-mechanics/retrieval";

function fixture(): Baseline {
  const sources: Job["sources"] = [{ id: "en:body", text: "Gain 10 armor.", locale: "en_US", tier: "tooltip", variant: null }];
  const job: Job = { id: "Example.P", champion: "Example", slot: "P", patch: "26.19", sourceHash: "old-source", promptHash: "contract",
    slotRole: "ability", sources, numbers: sourceNumbers(sources), variants: [{ id: "base", label: "공통", sourceIds: ["en:body"] }],
    facts: { cooldownSeconds: [10], provenance: { detail: "26.19/Example.json" }, diagnostics: [] } };
  const draft: Draft = { summary: "방어력 증가", rules: [{ variant: "base", trigger: { event: "passive", subject: "caster" },
    conditions: [], effects: [emptyEffect("stat_modifier", "방어력 증가")], evidence: [{ sourceId: "en:body", quote: "Gain 10 armor." }] }], gaps: [] };
  return { manifest: { schemaVersion: 2, patch: "26.19", promptHash: "contract", inventoryHash: "inventory", requestedAuthor: { model: "gpt-6-luna", effort: "medium" },
    counts: { champions: 1, common: 1, abilities: 1, total: 2 }, jobs: [{ ...job, state: "reviewed", pilot: false }] },
    jobs: [job], drafts: new Map([[job.id, draft]]), decisions: [{ id: job.id, sourceHash: job.sourceHash, candidateHash: digest(draft), verdict: "accepted", checks: [], notes: [] }] };
}
test("패치와 수집 경로·진단만 변경되면 의미와 검수를 재사용한다", () => {
  const baseline = fixture(), old = baseline.jobs[0];
  const next = { ...old, patch: "26.20", sourceHash: "new-source", facts: { ...old.facts, provenance: { detail: "26.20/Example.json" }, diagnostics: ["refetched"] } };
  assert.equal(semanticFingerprint(old), semanticFingerprint(next));
  const report = compareInventory(baseline, { patch: "26.20", jobs: [next] });
  assert.equal(report.hasChanges, true);
  assert.deepEqual(report.counts, { total: 1, reuse: 1, regenerate: 0, removed: 0, metadata: 1, retainedReview: 1 });
});
test("변신 아이콘 버전만 바뀌면 재사용하고 형태·수치 변경은 승인을 제거한다", () => {
  const baseline = fixture(), old = baseline.jobs[0];
  old.facts.forms = [{ id: "human", iconVersion: "16.19", cooldownSeconds: [6] }];
  const next = structuredClone(old);
  next.facts.forms = [{ id: "human", iconVersion: "16.20", cooldownSeconds: [6] }];
  assert.equal(compareInventory(baseline, { patch: "26.20", jobs: [next] }).counts.retainedReview, 1);
  for (const form of [{ id: "spider", iconVersion: "16.20", cooldownSeconds: [6] },
    { id: "human", iconVersion: "16.20", cooldownSeconds: [5] }]) {
    next.facts.forms = [form];
    assert.equal(compareInventory(baseline, { patch: "26.20", jobs: [next] }).counts.retainedReview, 0);
  }
});

test("문구와 코드가 복사한 수치 변경은 해당 슬롯만 재작성하고 승인을 제거한다", () => {
  const baseline = fixture(), old = baseline.jobs[0];
  for (const next of [{ ...old, sources: [{ ...old.sources[0], text: "Gain 20 armor." }] },
    { ...old, facts: { ...old.facts, cooldownSeconds: [9] } }, { ...old, variants: [...old.variants, { id: "form:A", label: "Form", sourceIds: [] }] }]) {
    const report = compareInventory(baseline, { patch: old.patch, jobs: [next] });
    assert.equal(report.counts.regenerate, 1);
    assert.equal(report.counts.retainedReview, 0);
    assert.ok(report.slots[0].reasons.includes("source_content"));
  }
});
test("가이드·스키마 변경, 신규 슬롯, 누락 후보, 삭제를 각각 감지한다", () => {
  const baseline = fixture(), old = baseline.jobs[0];
  assert.deepEqual(compareInventory(baseline, { patch: old.patch, jobs: [{ ...old, promptHash: "changed" }] }).slots[0].reasons, ["schema_or_guide"]);
  assert.equal(compareInventory(baseline, { patch: old.patch, jobs: [{ ...old, id: "New.P", champion: "New" }] }).counts.removed, 1);
  baseline.drafts.clear();
  assert.deepEqual(compareInventory(baseline, { patch: old.patch, jobs: [old] }).slots[0].reasons, ["missing_candidate"]);
});
test("승인 뒤 후보를 바꾸면 승인 기록이 있더라도 이어받지 않는다", () => {
  const baseline = fixture();
  baseline.drafts.get("Example.P")!.summary = "다른 내용";
  assert.equal(compareInventory(baseline, { patch: "26.19", jobs: baseline.jobs }).counts.retainedReview, 0);
});
test("변경이 없으면 주기적 실행에서 새 변경으로 알리지 않는다", () => {
  const baseline = fixture(), report = compareInventory(baseline, { patch: "26.19", jobs: baseline.jobs });
  assert.equal(report.hasChanges, false);
  assert.equal(report.counts.regenerate, 0);
});
test("스킬이 그대로여도 같은 패치의 공통 스탯 변경을 감지해 코드 갱신을 준비한다", () => {
  const baseline = fixture();
  baseline.overview = new Map([["Example.common", { sourceHash: "old-stats" }]]);
  const report = compareInventory(baseline, { patch: "26.19", jobs: baseline.jobs, overview: [{ id: "Example.common", sourceHash: "new-stats" }] });
  assert.equal(report.hasChanges, true);
  assert.equal(report.counts.regenerate, 0);
  assert.deepEqual(report.commonUpdates, ["Example.common"]);
});

async function sourceFixture(root: string, patch: string, changed = false) {
  const data = path.join(root, "public/data"), base = path.join(data, patch);
  await mkdir(path.join(base, "llm"), { recursive: true });
  await mkdir(path.join(base, "champions/en_US"), { recursive: true });
  const json = (file: string, value: unknown) => writeFile(file, JSON.stringify(value));
  const spells = SLOTS.map(slot => ({ slot, name: slot, summary: "Gain armor.", text: slot === "Q" && changed ? "Gain 20 armor." : "Gain 10 armor." }));
  const cards = [{ id: "Example", name: "Example", title: "Fixture", roleTags: [], rangeType: "Melee", attackRange: 125, stats: {}, spells }];
  await json(path.join(data, "version.json"), { patchVersion: patch });
  for (const lang of ["en_US", "ko_KR"]) await json(path.join(base, "llm", `champion-cards-${lang}.json`), { patch, cards });
  await json(path.join(base, "champions/en_US/Example.json"), { patchVersion: patch, champion: { baseStats: {},
    abilities: Object.fromEntries(SLOTS.map(slot => [slot, { cooldownSeconds: [10], range: 125, rankValues: [], scalings: [], diagnostics: [], source: "fixture" }])) } });
}
test("새 패치에서 변경된 Q만 비워 두고 승인 P와 나머지 초안을 재사용하며 원본은 보존한다", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mechanics-drift-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await sourceFixture(root, "26.19");
  const previous = path.join(root, "previous"), next = path.join(root, "next");
  await prepare(previous, root);
  const inventory = await buildInventory(root);
  for (const job of inventory.jobs) {
    const draft = fixture().drafts.get("Example.P")!;
    await writeFile(path.join(previous, "candidates", `${job.id}.json`), JSON.stringify(draft));
  }
  const draft = fixture().drafts.get("Example.P")!;
  await writeFile(path.join(previous, "review-ledger.json"), JSON.stringify({ decisions: [{ id: "Example.P", sourceHash: inventory.jobs[0].sourceHash,
    candidateHash: digest(draft), verdict: "accepted", checks: ["source_agreement"], notes: ["fixture"] }] }));
  await mkdir(path.join(previous, "reports/screens"), { recursive: true });
  await writeFile(path.join(previous, "reports/screens/Example.json"), JSON.stringify({ model: "gpt-6-luna", effort: "medium", status: "screened", findings: [], notes: [],
    snapshots: inventory.jobs.filter(job => ["P", "Q"].includes(job.slot)).map(job => ({ id: job.id, sourceHash: job.sourceHash, candidateHash: digest(draft) })) }));
  const original = await readFile(path.join(previous, "inputs/Example.P.json"), "utf8");
  await sourceFixture(root, "26.20", true);
  const result = await stageUpdate({ root, baseline: previous, output: next });
  assert.equal(result.reuse, 4);
  assert.equal(result.pending, 1);
  assert.equal(result.retainedReview, 1);
  assert.equal(await access(path.join(next, "candidates/Example.Q.json")).then(() => true, () => false), false);
  const ledger = JSON.parse(await readFile(path.join(next, "review-ledger.json"), "utf8"));
  assert.equal(ledger.decisions.length, 1);
  assert.notEqual(ledger.decisions[0].sourceHash, inventory.jobs[0].sourceHash);
  const screen = JSON.parse(await readFile(path.join(next, "reports/screens/Example.json"), "utf8"));
  assert.deepEqual(screen.snapshots.map((row: { id: string }) => row.id), ["Example.P"]);
  assert.equal(screen.snapshots[0].sourceHash, ledger.decisions[0].sourceHash);
  assert.equal(screen.previousSnapshots[0].sourceHash, inventory.jobs[0].sourceHash);
  assert.equal(await readFile(path.join(previous, "inputs/Example.P.json"), "utf8"), original);
  await assert.rejects(stageUpdate({ root, baseline: previous, output: previous }), /new output directory/);
  await assert.rejects(stageUpdate({ root, baseline: previous, output: next }), /new output directory/);
  // 변경 슬롯이 빠진 업데이트는 완성된 자료로 내보내지 못한다.
  await assert.rejects(exportRecords(next, root), /partial\/invalid/);
  const changed = structuredClone(draft);
  changed.rules[0].evidence[0].quote = "Gain 20 armor.";
  await writeFile(path.join(next, "candidates/Example.Q.json"), JSON.stringify(changed));
  const exported = await exportRecords(next, root);
  assert.equal(exported.reviewed, 1);
  assert.equal(exported.pendingSemanticReview, 4);
});

test("이전 스키마의 정상 후보를 손상으로 오인하지 않고 새 계약으로 전부 재작성한다", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mechanics-schema-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await sourceFixture(root, "26.19");
  const directory = path.join(root, "research/champion-mechanics/previous");
  await prepare(directory, root);
  await writeFile(path.join(root, "research/champion-mechanics/current.json"), JSON.stringify({ directory: "previous" }));
  const current = await buildInventory(root);
  for (const job of current.jobs) await writeFile(path.join(directory, "candidates", `${job.id}.json`), JSON.stringify(fixture().drafts.get("Example.P")));
  const accepted = { id: current.jobs[0].id, sourceHash: current.jobs[0].sourceHash,
    candidateHash: digest(fixture().drafts.get("Example.P")), verdict: "accepted", checks: [], notes: [] };
  await writeFile(path.join(directory, "review-ledger.json"), JSON.stringify({ decisions: [accepted] }));
  assert.equal((await reviewedAbilities(root)).size, 1);
  const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
  manifest.promptHash = "previous-contract";
  for (const row of manifest.jobs) {
    row.promptHash = "previous-contract";
    const input = path.join(directory, "inputs", `${row.id}.json`);
    const job = JSON.parse(await readFile(input, "utf8"));
    job.promptHash = "previous-contract";
    await writeFile(input, JSON.stringify(job));
    const candidate = { ...fixture().drafts.get("Example.P"), legacyField: true };
    await writeFile(path.join(directory, "candidates", `${row.id}.json`), JSON.stringify(candidate));
    if (row.id === accepted.id) accepted.candidateHash = digest(candidate);
  }
  await writeFile(path.join(directory, "manifest.json"), JSON.stringify(manifest));
  const schema = JSON.parse(await readFile(path.join(directory, "draft.schema.json"), "utf8"));
  schema.properties.legacyField = { type: "boolean" };
  await writeFile(path.join(directory, "draft.schema.json"), JSON.stringify(schema));
  await writeFile(path.join(directory, "review-ledger.json"), JSON.stringify({ decisions: [accepted] }));
  const baseline = await loadBaseline(directory);
  const result = compareInventory(baseline, current);
  assert.equal(result.counts.regenerate, 5);
  assert.equal(result.counts.reuse, 0);
  assert.equal(result.counts.retainedReview, 0);
  assert.equal((await reviewedAbilities(root)).size, 0);
});
