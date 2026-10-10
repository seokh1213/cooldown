import assert from "node:assert/strict";
import test from "node:test";
import { acceptedFollowup, terminalBelongsToReview } from "../../scripts/advisor/lib/primary-review-monitor";

test("monitor delivery requires the connected writable primary terminal", () => {
  const terminal = { title: "⠙ Cooldown 번역 직접 검수·모니터링 | cooldown", connected: true, writable: true };
  assert.equal(terminalBelongsToReview({ ok: true, result: { terminal } }), true);
  assert.equal(terminalBelongsToReview({ ok: true, result: { terminal: { ...terminal, title: "Other task" } } }), false);
  assert.equal(terminalBelongsToReview({ ok: true, result: { terminal: { ...terminal, connected: false } } }), false);
  assert.equal(terminalBelongsToReview({ ok: true, result: { terminal: { ...terminal, writable: false } } }), false);
});

test("only an explicit send acceptance counts as delivery", () => {
  assert.equal(acceptedFollowup({ ok: true, result: { send: { accepted: true } } }), true);
  assert.equal(acceptedFollowup({ ok: true, result: { send: { accepted: false } } }), false);
  assert.equal(acceptedFollowup({ ok: false }), false);
});
