import assert from "node:assert/strict";
import test from "node:test";
import { SCHEMA_VERSION, SLOTS, emptyEffect, type Draft, type Job } from "../../scripts/advisor/champion-mechanics/contract";
import { sourceNumbers, numericValue } from "../../scripts/advisor/champion-mechanics/numbers";
import { parseDraft } from "../../scripts/advisor/champion-mechanics/schema";
import { validateDraft, validatedRecord } from "../../scripts/advisor/champion-mechanics/validate";
import { buildInventory, digest } from "../../scripts/advisor/champion-mechanics/sources";
import { acceptedReview } from "../../scripts/advisor/champion-mechanics/export";
import { authorInput, kitSchema } from "../../scripts/advisor/champion-mechanics/author";
import { completeNumberEvidence } from "../../scripts/advisor/champion-mechanics/evidence";
import { partitionJobs } from "../../scripts/advisor/champion-mechanics/assign";
import { recoverableDrafts } from "../../scripts/advisor/champion-mechanics/recover";
import { mergeScreens, normalizeFinding, validateFindings, type ScreenReport } from "../../scripts/advisor/champion-mechanics/screen";
import { currentFindings } from "../../scripts/advisor/champion-mechanics/repair-screen";
import { buildReviewView } from "../../scripts/advisor/champion-mechanics/review-view";
import { ROOT } from "../../scripts/advisor/champion-mechanics/prepare";

function fixture(): { job: Job; draft: Draft } {
  const sources: Job["sources"] = [{ id: "en:body", text: "An attack grants 10 armor. After a kill gain 20 armor.", locale: "en_US", tier: "tooltip", variant: null }];
  const job: Job = { id: "Example.P", champion: "Example", slot: "P", patch: "test", sourceHash: "source", promptHash: "prompt",
    slotRole: "ability", facts: {}, sources, numbers: sourceNumbers(sources), variants: [{ id: "base", label: "base", sourceIds: ["en:body"] }] };
  const effect = { ...emptyEffect("stat_modifier", "공격 시 방어력이 증가합니다."), statTo: "armor" as const,
    parameters: [{ role: "amount" as const, numberRefs: ["en:body:n0"], stat: "armor" as const, statSubject: "caster" as const, shape: "scalar" as const }] };
  const draft: Draft = { summary: "공격 시 방어력이 증가합니다.", rules: [{ variant: "base", trigger: { event: "attack", subject: "caster" },
    conditions: [], effects: [effect], evidence: [{ sourceId: "en:body", quote: "An attack grants 10 armor." }] }], gaps: [] };
  return { job, draft };
}
test("strict schema refuses invented metadata and aliases rather than dropping them", () => {
  const { draft } = fixture();
  assert.throws(() => parseDraft({ ...draft, status: "approved" }));
  assert.throws(() => parseDraft({ ...draft, rules: [{ ...draft.rules[0], trigger: { event: "auto_attack", subject: "caster" } }] }));
});
test("provider schema omits unsupported uniqueness keyword but local validation enforces it", () => {
  const { job, draft } = fixture();
  assert.equal(JSON.stringify(kitSchema([job])).includes("uniqueItems"), false);
  draft.rules[0].effects[0].flags = ["decays", "decays"];
  assert.throws(() => parseDraft(draft));
});
test("model input uses canonical English numeric IDs while retaining Korean conflict evidence", () => {
  const { job } = fixture();
  job.sources.push({ id: "ko:body", locale: "ko_KR", tier: "tooltip", variant: null, text: "방어력 10", });
  job.numbers = sourceNumbers(job.sources);
  const view = authorInput(job);
  assert.ok(view.sources.some(source => source.id === "ko:body"));
  assert.ok(view.numbers.every(number => !number.id.startsWith("ko:")));
});
test("a failed champion kit can recover valid slots without treating its invalid slot as usable", () => {
  const { job, draft } = fixture();
  const broken = { ...draft, summary: "invalid", invented: true };
  const jobs = [job, { ...job, id: "Example.Q", slot: "Q" as const }];
  const recovered = recoverableDrafts(jobs, { drafts: { P: draft, Q: broken }, failures: [] });
  assert.deepEqual(recovered.map(item => item.job.id), ["Example.P"]);
});
test("independent screen findings must cite an assigned input and exact source text", () => {
  const { job } = fixture();
  const finding = { id: job.id, path: "rules.0.effects.0", severity: "high" as const, sourceId: "en:body", quote: "An attack grants 10 armor.", issue: "범위", correction: "조건 분리" };
  assert.equal(validateFindings([job], [finding]), true);
  assert.equal(validateFindings([job], [{ ...finding, id: "Foreign.P" }]), false);
  assert.equal(validateFindings([job], [{ ...finding, quote: "not a source quote" }]), false);
  assert.deepEqual(normalizeFinding([job], { ...finding, id: "Example.P.owner", path: "Example.P.rules[0].effects[0]" }), finding);
});
test("screening newly completed slots preserves prior slot reviews and replaces changed snapshots", () => {
  const prior: ScreenReport = { model: "gpt-6-luna", effort: "medium", status: "screened", findings: [], notes: [],
    snapshots: [{ id: "Example.P", candidateHash: "old", sourceHash: "src" }, { id: "Example.Q", candidateHash: "q", sourceHash: "srcq" }] };
  const next = { ...prior, snapshots: [{ id: "Example.P", candidateHash: "new", sourceHash: "src" }] };
  assert.deepEqual(mergeScreens(prior, next).snapshots.map(item => [item.id, item.candidateHash]), [["Example.Q", "q"], ["Example.P", "new"]]);
});
test("semantic repairs refuse feedback about changed candidates or sources", () => {
  const { job, draft } = fixture();
  const report: ScreenReport = { model: "gpt-6-luna", effort: "medium", status: "screened", notes: [],
    snapshots: [{ id: job.id, sourceHash: job.sourceHash, candidateHash: digest(draft) }],
    findings: [{ id: job.id, path: "rules.0", severity: "high", sourceId: "en:body", quote: job.sources[0].text, issue: "범위", correction: "조건 수정" }] };
  assert.equal(currentFindings(job, draft, report).length, 1);
  assert.equal(currentFindings(job, { ...draft, summary: "changed" }, report).length, 0);
  assert.equal(currentFindings({ ...job, sourceHash: "changed" }, draft, report).length, 0);
});
test("review view resolves the same frozen draft's numeric references without dropping stat owner", () => {
  const { job, draft } = fixture();
  const parameter = buildReviewView(job, draft).rules[0].effects[0].parameters[0];
  assert.equal(parameter.statSubject, "caster");
  assert.deepEqual(parameter.numbers, [job.numbers[0]]);
});
test("a reference to a different sentence's number fails even if the same source contains it", () => {
  const { job, draft } = fixture();
  draft.rules[0].effects[0].parameters[0].numberRefs = ["en:body:n1"];
  assert.equal(validateDraft(job, draft).valid, false);
});
test("evidence compiler copies actual numeric sentences without modifying facts or forging foreign citations", () => {
  const { job, draft } = fixture();
  draft.rules[0].effects[0].parameters[0].numberRefs = ["en:body:n1"];
  const compiled = completeNumberEvidence(job, draft);
  assert.equal(compiled.additions, 1);
  assert.deepEqual(compiled.draft.rules[0].effects, draft.rules[0].effects);
  assert.equal(compiled.draft.rules[0].evidence.at(-1)?.quote, "After a kill gain 20 armor.");
  job.sources.push({ id: "ko", locale: "ko_KR", tier: "tooltip", variant: null, text: "방어력 20" });
  job.numbers = sourceNumbers(job.sources);
  draft.rules[0].effects[0].parameters[0].numberRefs = ["ko:n0"];
  assert.equal(completeNumberEvidence(job, draft).additions, 0);
});
test("translated evidence and fabricated number references fail", () => {
  const { job, draft } = fixture();
  draft.rules[0].evidence[0].quote = "공격하면 방어력이 증가합니다.";
  assert.equal(validateDraft(job, draft).valid, false);
  draft.rules[0].evidence[0].quote = job.sources[0].text;
  draft.rules[0].effects[0].parameters[0].numberRefs = ["en:body:n999"];
  assert.equal(validateDraft(job, draft).valid, false);
});
test("weapon or form rules must cite the corresponding variant document", () => {
  const { job, draft } = fixture();
  job.variants.push({ id: "form:B", label: "Cannon", sourceIds: ["form:B:en"] });
  draft.rules[0].variant = "form:B";
  assert.equal(validateDraft(job, draft).valid, false);
});
test("Aphelios' interface slot cannot receive combat rules", () => {
  const { job, draft } = fixture();
  job.slotRole = "interface_only";
  assert.equal(validateDraft(job, draft).valid, false);
  draft.rules[0].effects = [emptyEffect("ui_information", "다음 무기를 표시합니다.")];
  assert.equal(validateDraft(job, draft).valid, true);
});
test("stat conversion needs input/output stats and both source ratios", () => {
  const { job, draft } = fixture();
  draft.rules[0].effects = [emptyEffect("stat_conversion", "체력을 공격력으로 전환합니다.")];
  assert.equal(validateDraft(job, draft).valid, false);
});
test("CC labels cannot be smuggled onto unrelated effects", () => {
  const { job, draft } = fixture();
  draft.rules[0].effects[0].crowdControl = "root";
  assert.equal(validateDraft(job, draft).valid, false);
});
test("a stat reference cannot omit who owns that stat", () => {
  const { job, draft } = fixture();
  draft.rules[0].effects[0].parameters[0].statSubject = null;
  assert.equal(validateDraft(job, draft).valid, false);
});
test("seconds cannot become a distance predicate and percentages cannot become hit counts", () => {
  const { job, draft } = fixture();
  job.sources[0].text = "Leave within 1.5 seconds. Deal 25% more damage.";
  job.numbers = sourceNumbers(job.sources);
  draft.rules[0].effects = [emptyEffect("movement", "벗어납니다.")];
  draft.rules[0].evidence[0].quote = job.sources[0].text;
  draft.rules[0].conditions = [{ subject: "target", field: "distance", operator: "lte", value: { kind: "number_ref", ref: "en:body:n0" } }];
  assert.equal(validateDraft(job, draft).valid, false);
  draft.rules[0].conditions[0] = { subject: "target", field: "hit_count", operator: "lt", value: { kind: "number_ref", ref: "en:body:n1" } };
  assert.equal(validateDraft(job, draft).valid, false);
});
test("a stat-scaled attack count formula may contain a percentage coefficient", () => {
  const { job, draft } = fixture();
  job.sources[0].text = "Fire (6 + 200% bonus Attack Speed) shots.";
  job.numbers = sourceNumbers(job.sources);
  draft.rules[0].evidence[0].quote = job.sources[0].text;
  draft.rules[0].effects[0].parameters = [{ role: "count", numberRefs: ["en:body:n0", "en:body:n1"], stat: "bonusAttackSpeed", statSubject: "caster", shape: "formula_components" }];
  assert.equal(validateDraft(job, draft).valid, true);
});
test("a first-hit restriction cannot be invented for an area attack", () => {
  const { job, draft } = fixture();
  draft.rules[0].conditions = [{ subject: "target", field: "hit_order", operator: "eq", value: { kind: "enum", value: "first" } }];
  assert.equal(validateDraft(job, draft).valid, false);
});
test("can cast while winding up another ability does not make winding up required", () => {
  const { job, draft } = fixture();
  job.sources[0].text = "He dashes. He can use this Ability while winding up his other Abilities.";
  draft.rules[0] = { variant: "base", trigger: { event: "cast", subject: "caster" },
    conditions: [{ subject: "caster", field: "other", operator: "present", value: { kind: "text", value: "winding up" } }],
    effects: [emptyEffect("movement", "돌진합니다.")], evidence: [{ sourceId: "en:body", quote: job.sources[0].text }] };
  assert.equal(validateDraft(job, draft).valid, false);
});
test("empty extraction must document why there are no rules", () => {
  const { job } = fixture();
  assert.equal(validateDraft(job, { summary: "불완전한 출처", rules: [], gaps: [] }).valid, false);
  assert.equal(validateDraft(job, { summary: "불완전한 출처", rules: [], gaps: [{ reason: "missing_source", detail: "원문 부족", evidence: [] }] }).valid, true);
});
test("validation alone never produces a human approved record", () => {
  const { job, draft } = fixture();
  const result = validatedRecord(job, draft);
  assert.equal(result.status, "validated");
  assert.equal(result.sourceHash, job.sourceHash);
  assert.equal(result.rules[0].id.length, 20);
});
test("changing the candidate or source invalidates a previous semantic approval", () => {
  const { job, draft } = fixture();
  const decision = { id: job.id, sourceHash: job.sourceHash, candidateHash: digest(draft), verdict: "accepted" as const, checks: ["conditions"], notes: [] };
  assert.equal(acceptedReview(job, draft, decision), true);
  assert.equal(acceptedReview({ ...job, sourceHash: "changed" }, draft, decision), false);
  assert.equal(acceptedReview(job, { ...draft, summary: "changed" }, decision), false);
});
test("percentage normalization handles every value in a ranked sequence", () => {
  const numbers = sourceNumbers([{ id: "en", text: "35/40/45% slow, 800% bonus AD, 1,200 damage and -10 armor. three attacks", locale: "en_US", tier: "tooltip", variant: null }]);
  assert.deepEqual(numbers.map(numericValue), [.35, .4, .45, 8, 1200, -10, 3]);
});
test("partitioning never splits a champion or duplicates/misses an ability", () => {
  const { job } = fixture();
  const jobs = Array.from({ length: 30 }, (_, index) => ({ ...job, id: `C${Math.floor(index / 5)}.${index % 5}`, champion: `C${Math.floor(index / 5)}` }));
  const batches = partitionJobs(jobs, 6, new Set(["C0.0"]));
  const assigned = batches.flatMap(batch => batch.ids);
  assert.equal(new Set(assigned).size, 29);
  assert.equal(assigned.includes("C0.0"), false);
  for (let champion = 0; champion < 6; champion++) assert.equal(batches.filter(batch => batch.ids.some(id => id.startsWith(`C${champion}.`))).length, 1);
});
test("current full inventory has exactly common + P/Q/W/E/R for each champion", async () => {
  const { jobs, overview } = await buildInventory(ROOT);
  assert.equal(SCHEMA_VERSION, 2);
  assert.equal(overview.length, 173);
  assert.equal(jobs.length, 173 * SLOTS.length);
  assert.equal(new Set(jobs.map(job => job.id)).size, jobs.length);
  assert.equal(jobs.find(job => job.id === "Aphelios.E")?.slotRole, "interface_only");
  assert.deepEqual(jobs.find(job => job.id === "Hwei.E")?.variants.map(variant => variant.id), ["base", "EQ", "EW", "EE"]);
  assert.deepEqual(jobs.find(job => job.id === "Jayce.Q")?.variants.map(variant => variant.id), ["base", "form:A", "form:B"]);
});
