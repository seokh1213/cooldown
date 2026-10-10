import assert from "node:assert/strict";
import test from "node:test";
import { batchReady, finalAuditReady, fingerprint, prioritizeSections, reviewStatus } from "../../scripts/advisor/lib/translation-review-queue";
import type { ReviewDecision, ReviewSection } from "../../scripts/advisor/lib/translation-review-queue";

const section: ReviewSection = { lang: "en_US", me: "Nasus", enemy: "Akali", slot: "watch", ko: "원문", text: "Original translation", newCandidate: true };
const decision: ReviewDecision = {
  lang: section.lang,
  me: section.me,
  enemy: section.enemy,
  slot: section.slot,
  sourceSha256: fingerprint(section.ko),
  candidateSha256: fingerprint(section.text),
  status: "approved_with_edit",
  text: "Corrected translation",
};

test("reviewed corrections are not queued again from the unchanged staging text or approved text", () => {
  assert.equal(reviewStatus(section, decision), "approved");
  assert.equal(reviewStatus({ ...section, text: decision.text! }, decision), "approved");
});

test("source changes and regenerated candidates invalidate earlier meaning review", () => {
  assert.equal(reviewStatus({ ...section, ko: "변경된 원문" }, decision), "pending");
  assert.equal(reviewStatus({ ...section, text: "A different translation" }, decision), "pending");
  assert.equal(reviewStatus(section), "pending");
  assert.equal(reviewStatus(section, { ...decision, needsPrimaryReview: true }), "pending");
});

test("ambiguous passages stay held until their source or candidate changes", () => {
  const held: ReviewDecision = { ...decision, status: "held", text: undefined };
  assert.equal(reviewStatus(section, held), "held");
  assert.equal(reviewStatus({ ...section, ko: "명확해진 원문" }, held), "pending");
  assert.equal(reviewStatus({ ...section, text: "Revised translation" }, held), "pending");
});

test("newly generated candidates are reviewed before existing seed translations", () => {
  const old = { ...section, me: "Aatrox", newCandidate: false };
  assert.deepEqual(prioritizeSections([old, section]), [section, old]);
});

test("the monitor waits for a batch during generation and drains a final partial batch", () => {
  assert.equal(batchReady(63, 64, true), false);
  assert.equal(batchReady(64, 64, true), true);
  assert.equal(batchReady(3, 64, false), true);
  assert.equal(batchReady(0, 64, false), false);
});

test("the final audit runs once after generation and available reviews have finished", () => {
  assert.equal(finalAuditReady({ pending: 0, generatorRunning: true, auditExists: false }), false);
  assert.equal(finalAuditReady({ pending: 1, generatorRunning: false, auditExists: false }), false);
  assert.equal(finalAuditReady({ pending: 0, generatorRunning: false, auditExists: false }), true);
  assert.equal(finalAuditReady({ pending: 0, generatorRunning: false, auditExists: true }), false);
});
