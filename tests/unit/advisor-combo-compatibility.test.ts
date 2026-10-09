import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import test from "node:test";
import { comboHash, comboSource, damageSignature, reviewCombos, type ComboBaseline } from "../../scripts/llm/lib/comboReview";
import { compileComboNotes } from "../../scripts/llm/lib/comboNotes";
import type { ChampionCard } from "../../src/lib/knowledge/facts";
import type { ComboGuideFile } from "../../src/lib/knowledge/comboGuide";
import { loadData } from "../../scripts/llm/kev-agent/lib";
import { answerDialogue } from "../../src/lib/advisor/dialogueFlow";
import { composeMatchupEvidence } from "../../src/lib/advisor/matchupReply";
import { translations } from "../../src/i18n/translations";
import { approveComboChampion } from "../../scripts/llm/approve-combo-champion";
import type { NumericChampion } from "../../scripts/patch-notes/sourceTypes";
import { comboBaselineData } from "../fixtures/comboBaselineData";

const guides = JSON.parse(readFileSync("knowledge/combo-guides.json", "utf8")) as ComboGuideFile;
const baseline = JSON.parse(readFileSync("knowledge/combo-baseline.json", "utf8")) as ComboBaseline;
const historical = JSON.parse(readFileSync("research/champion-combos/compatibility/ambessa-26.19.json", "utf8")) as {
  card: ChampionCard; numeric: NumericChampion; comparison: { card: ChampionCard; numeric: NumericChampion; guide: ComboGuideFile["champions"][number] };
};
guides.champions[guides.champions.findIndex(guide => guide.champion === "Ambessa")] = historical.comparison.guide;
const frozenAmbessa = comboSource(historical.comparison.card, historical.comparison.numeric);
baseline.sources.Ambessa = { hash: comboHash(frozenAmbessa), card: frozenAmbessa };
for (const pattern of historical.comparison.guide.patterns) baseline.noteHashes[pattern.id] = comboHash(pattern);
const data = comboBaselineData(loadData("ko_KR"), guides, baseline);
const numericSources = Object.fromEntries(Object.entries(baseline.sources).flatMap(([id, source]) => source.card.numeric ? [[id, source.card.numeric]] : []));
const card = data.cardById.get("Ambessa")!;
const source = (text: string): ChampionCard => {
  const changed = structuredClone(card);
  changed.spells[0].text = text;
  return changed;
};
const review = (cards: ChampionCard[], file = guides, frozen = baseline) => reviewCombos({ guides: file, cards, baseline: frozen, numericSources, patch: "26.21" });

test("승인된 콤보·라인전 스냅샷은 재사용하되 직접 검수 이력은 바꾸지 않는다", () => {
  const rows = review(data.cards);
  assert.equal(rows.length, guides.champions.reduce((n, guide) => n + guide.patterns.length + Number(Boolean(guide.laning)), 0));
  assert.equal(rows.filter(row => row.status === "needs-review").length, 0);
  assert.ok(rows.every(row => row.checkedThroughPatch === "26.21"));
  assert.ok(rows.every(row => row.reviewedPatch === (guides.champions.find(guide => guide.champion === row.champion)!.verifiedPatch ?? guides.patch)));
});

test("틱 검수 주석 추가는 콤보를 격리하지 않으며 실제 지속시간 변경은 계속 보류한다", () => {
  const actual = loadData("ko_KR"), annotated = structuredClone(data.cards);
  for (const champion of annotated) for (const spell of champion.spells) {
    const live = actual.cardById.get(champion.id)!.spells.find(row => row.slot === spell.slot)!;
    spell.ticks = structuredClone(live.ticks);
    for (const form of spell.forms ?? []) form.ticks = structuredClone(live.forms?.find(row => row.key === form.key)?.ticks);
  }
  assert.ok(annotated.some(champion => champion.spells.some(spell => spell.ticks?.status === "known")));
  assert.ok(review(annotated).every(row => row.status === "unchanged"));
  const ambessa = annotated.find(champion => champion.id === "Ambessa")!;
  assert.deepEqual(comboSource(ambessa, numericSources.Ambessa), comboSource(card, numericSources.Ambessa));
  ambessa.spells[0].text = ambessa.spells[0].text.replace("4초", "5초");
  assert.ok(review(annotated).filter(row => row.champion === "Ambessa").every(row => row.status === "needs-review"));
});

test("암베사 피해량만 바뀌면 콤보를 유지하고 직접 검수 패치를 덮어쓰지 않는다", () => {
  const changed = source(card.spells[0].text.replace("5 ~ 25", "5 ~ 30").replace("20% 추가", "25% 추가"));
  changed.spells[0].ratios["추가 공격력"] = 25;
  const rows = review([changed]).filter(row => row.champion === "Ambessa");
  assert.ok(rows.every(row => row.status === "compatible"));
  assert.ok(rows.every(row => row.reviewedPatch === "26.20" && row.checkedThroughPatch === "26.21"));
  assert.ok(rows.every(row => row.changes[0].kind === "damage-numbers"));
  assert.equal(compileComboNotes(guides, [changed], { baseline, numericSources, patch: "26.21" }).get("Ambessa")!.length, 2);
});

test("실제 보관된 26.19→26.20 암베사 원문으로 피해 수치 변경을 재현한다", () => {
  const old = JSON.parse(readFileSync("research/champion-combos/compatibility/ambessa-26.19.json", "utf8")) as { card: ChampionCard; numeric: NumericChampion };
  const frozen = structuredClone(baseline), before = comboSource(old.card, old.numeric);
  frozen.sources.Ambessa = { hash: comboHash(before), card: before };
  const rows = review([card], guides, frozen).filter(row => row.champion === "Ambessa");
  assert.ok(rows.every(row => row.status === "compatible"));
  assert.ok(rows.every(row => row.changes.length === 3 && row.changes.every(change => change.slot === "P" && ["damage-numbers", "numeric-value"].includes(change.kind))));
});

test("중첩·지속시간·모르는 문구·스킬 형태·스탯 변경은 자동 승인하지 않는다", () => {
  const changes = [source(card.spells[0].text.replace("최대: 3", "최대: 4")),
    source(card.spells[0].text.replace("4초", "5초")), source(`${card.spells[0].text} 새 조건이 추가됨`)];
  const form = structuredClone(card); form.spells[1].name += " 새 형태"; changes.push(form);
  const stats = structuredClone(card); stats.stats.attackSpeed.lv1 += 0.1; changes.push(stats);
  for (const changed of changes) {
    const rows = review([changed]).filter(row => row.champion === "Ambessa");
    assert.ok(rows.every(row => row.status === "needs-review"));
    assert.ok(rows.every(row => row.checkedThroughPatch === null));
  }
  assert.notEqual(damageSignature("3회 공격하면 50의 물리 피해"), damageSignature("4회 공격하면 50의 물리 피해"));
  assert.notEqual(damageSignature("체력 30% 이하일 때 50의 물리 피해"), damageSignature("체력 40% 이하일 때 50의 물리 피해"));
});

test("피해량에 의존하는 노트와 바뀐 노트 본문은 별도로 보류한다", () => {
  const file = structuredClone(guides), frozen = structuredClone(baseline);
  const guide = file.champions.find(guide => guide.champion === "Ambessa")!;
  guide.patterns[0].dependencies!.damageNumbers = "review";
  frozen.noteHashes[guide.patterns[0].id] = comboHash(guide.patterns[0]);
  const changed = source(card.spells[0].text.replace("5 ~ 25", "5 ~ 30"));
  const rows = review([changed], file, frozen).filter(row => row.champion === "Ambessa");
  assert.equal(rows[0].status, "needs-review"); assert.equal(rows[1].status, "compatible");
  guide.patterns[1].tip += " 새로운 설명";
  assert.ok(review([card], file, frozen).find(row => row.id === guide.patterns[1].id)!.reasons.includes("note-edited"));
});

test("망가진 원천 지문과 누락된 의존성 기준은 실제 오류로 남긴다", () => {
  assert.throws(() => reviewCombos({ guides, cards: [card], patch: "26.21" }), /baseline is required/);
  const frozen = structuredClone(baseline); frozen.sources.Ambessa.card.spells[0].text += " 변조";
  assert.throws(() => review([card], guides, frozen), /Invalid combo source snapshot/);
});

test("명시적 원문 재검수는 해당 챔피언만 승인하고 다른 챔피언의 승인 이력은 보존한다", () => {
  const changed = source(card.spells[0].text.replace("최대: 3", "최대: 4"));
  const options = { guides, baseline, cards: [changed], champion: "Ambessa", patch: "26.21", reviewedAt: "2026-10-21",
    numericSources,
    reason: "테스트용 원문 검수: 충전 상한 변경을 두 콤보와 대조" };
  const approved = approveComboChampion(options);
  assert.ok(review([changed], approved.guides, approved.baseline).filter(row => row.champion === "Ambessa").every(row => row.status === "unchanged"));
  assert.equal(approved.guides.champions.find(guide => guide.champion === "Ambessa")!.verifiedPatch, "26.21");
  assert.deepEqual(approved.baseline.sources.Ahri, baseline.sources.Ahri);
  assert.deepEqual(approved.guides.champions.find(guide => guide.champion === "Ahri"), guides.champions.find(guide => guide.champion === "Ahri"));
  assert.throws(() => approveComboChampion({ ...options, reason: "" }), /reason/);
});

test("검수 대기 콤보는 실제 대화에서 한국어·영어·중국어로 안내하며 옛 번역을 재사용하지 않는다", async () => {
  const changed = source(card.spells[0].text.replace("최대: 3", "최대: 4"));
  const entries = compileComboNotes(guides, [changed], { baseline, numericSources }).get("Ambessa")!;
  for (const locale of ["ko_KR", "en_US", "zh_CN"] as const) {
    const loaded = loadData(locale);
    const playbooks = new Map(loaded.playbooks);
    playbooks.set("Ambessa", { champion: "Ambessa", playing: entries, against: [],
      comboReview: { patch: data.patch, pendingIds: guides.champions.find(guide => guide.champion === "Ambessa")!.patterns.map(p => p.id) } });
    const context = { data: { ...loaded, playbooks }, lang: locale, copy: translations[locale].advisor, turns: [], championIds: [],
      judge: "none" as const, consented: false, canUseModel: false, retrieval: false };
    const result = await answerDialogue("Ambessa combo", context, {
      judge: async () => { throw new Error("model must not invent held combos"); }, search: async () => [] });
    assert.match(result.reply.text, /검수 중|awaiting review|正在核实/);
    assert.doesNotMatch(result.reply.text, /→|Q1|Q2/);
    const enemy = loaded.cardById.get("Ahri")!;
    const evidence = composeMatchupEvidence(context.data, locale, { question: "Ambessa vs Ahri", mine: loaded.cardById.get("Ambessa")!, enemy },
      { watch: "STALE-COMBO-CACHE", build: "STALE-COMBO-CACHE", fight: "STALE-COMBO-CACHE" });
    assert.doesNotMatch(evidence.answer.kind === "compare" ? evidence.answer.precomputed ?? "" : "", /STALE-COMBO-CACHE/);
  }
});

test("참조하지 않는 스킬은 승인된 의존성 범위에 따라 독립적으로 판정한다", () => {
  const file = structuredClone(guides), frozen = structuredClone(baseline);
  const pattern = file.champions.find(guide => guide.champion === "Ambessa")!.patterns[0];
  pattern.dependencies!.slots = ["P", "Q", "W", "E"];
  frozen.noteHashes[pattern.id] = comboHash(pattern);
  const changed = structuredClone(card); changed.spells.find(spell => spell.slot === "R")!.text += " 바뀐 궁극기";
  assert.equal(review([changed], file, frozen).find(row => row.id === pattern.id)!.status, "compatible");
  assert.equal(comboHash(comboSource(card, numericSources.Ambessa)), baseline.sources.Ambessa.hash);
});

test("실제 생성기가 보류된 원문·옛 콤보·번역을 제외하며 정상 챔피언은 유지한다", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "cooldown-combo-review-"));
  const write = (file: string, value: unknown) => {
    const target = path.join(root, file); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, JSON.stringify(value));
  };
  try {
    const cards = structuredClone(data.cards); cards.find(c => c.id === "Ambessa")!.spells[0].text += " 새 발동 조건";
    for (const champion of cards) for (const spell of champion.spells) {
      spell.ticks = { status: "not_documented", effects: [], sources: [] };
      for (const form of spell.forms ?? []) form.ticks = spell.ticks;
    }
    write("knowledge/combo-guides.json", guides); write("knowledge/combo-baseline.json", baseline);
    write("knowledge/combo-review-ledger.json", { schemaVersion: 1, reviews: [] });
    write("knowledge/note-versions.json", { baselinePatch: "26.19", files: [{ path: "knowledge/combo-guides.json", sourceHash: "before-review" }] });
    write("data/patch-notes/sources/26.20.json", numericSources);
    write("public/data/version.json", { patchVersion: "26.20" });
    write("public/data/26.20/llm/champion-cards-ko_KR.json", { cards });
    write("knowledge/playbooks/Ambessa.json", { champion: "Ambessa", playing: [{ id: "legacy-combo", category: "combo", text: "STALE-COMBO" }], against: [] });
    write("knowledge/atoms/Ambessa.json", { atoms: [{ source: "playbook:legacy-combo", text: { en_US: "STALE-TRANSLATION", zh_CN: "STALE-TRANSLATION" } }] });
    const module = path.resolve("scripts/llm/lib/playbook.ts");
    const script = `import {loadPlaybooks} from ${JSON.stringify(module)};const books=loadPlaybooks();console.log(JSON.stringify(Object.fromEntries(books)));`;
    const books = JSON.parse(execFileSync(process.execPath, ["--import", path.resolve("node_modules/tsx/dist/loader.mjs"), "--input-type=module", "-e", script], { cwd: root, encoding: "utf8" }));
    assert.equal(books.Ambessa.playing.length, 0);
    assert.equal(books.Ambessa.comboReview.pendingIds.length, 2);
    assert.equal(books.Ahri.playing.length, 2);
    execFileSync(process.execPath, ["--import", path.resolve("node_modules/tsx/dist/loader.mjs"), path.resolve("scripts/llm/build-note-translations.ts")], { cwd: root });
    for (const lang of ["en_US", "zh_CN"]) {
      assert.doesNotMatch(readFileSync(path.join(root, `public/data/26.20/llm/note-translations-${lang}.json`), "utf8"), /STALE-TRANSLATION|legacy-combo/);
    }
    execFileSync(process.execPath, ["--import", path.resolve("node_modules/tsx/dist/loader.mjs"), path.resolve("scripts/llm/approve-combo-champion.ts"),
      "--champion", "Ambessa", "--reason", "시험용 전체 연계 원문 대조"], { cwd: root });
    const versions = JSON.parse(readFileSync(path.join(root, "knowledge/note-versions.json"), "utf8"));
    assert.equal(versions.baselinePatch, "26.19");
    assert.equal(versions.files[0].sourceHash, createHash("sha256").update(readFileSync(path.join(root, "knowledge/combo-guides.json"))).digest("hex"));
    const ledger = JSON.parse(readFileSync(path.join(root, "knowledge/combo-review-ledger.json"), "utf8"));
    assert.equal(ledger.reviews[0].noteIds.length, 2);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("툴팁이 같아도 미분류 CDragon 변경은 보류하고 원본이 없으면 오류로 중단한다", () => {
  const numeric = structuredClone(numericSources);
  numeric.Ambessa.spells[numeric.Ambessa.passive!].values.UnknownStackLimit = [4];
  const rows = reviewCombos({ guides, cards: [card], baseline, numericSources: numeric, patch: "26.21" }).filter(row => row.champion === "Ambessa");
  assert.ok(rows.every(row => row.status === "needs-review" && row.reasons.some(reason => reason.includes("UnknownStackLimit"))));
  assert.throws(() => reviewCombos({ guides, cards: [card], baseline, patch: "26.21" }), /Missing combo numeric source/);
});
