import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import fixtures from "../../../research/video-notes/mangdasu-20261006/questions.json";
import coverage from "../../../research/video-notes/mangdasu-20261006/coverage-questions.json";
import source from "../../../research/video-notes/mangdasu-20261006/extracted.json";
import collection from "../../../data/knowledge/video-tips.json";
import { loadMechanicsNotes } from "../../../scripts/advisor/lib/mechanicsNotes";
import { loadData, type Lang } from "../../../scripts/advisor/kev-agent/lib";
import { answerDialogue } from "../../../../src/features/advisor/conversation/dialogueFlow";
import { dehydrateTurn, reviveTurn } from "../../../../src/features/advisor/storage/history";
import type { PlanContext } from "../../../../src/features/advisor/contracts/planTypes";
import { translations } from "../../../../src/shared/i18n/translations";
import { AdvisorMarkdown } from "../../../../src/features/advisor/answers/cards/AdvisorMarkdown";

const deps = { judge: async () => { throw new Error("Unexpected model call"); }, search: async () => [] };
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => typeof input === "string" && input.startsWith("/data/")
  ? new Response(fs.readFileSync(`public${input}`)) : originalFetch(input, init);

function context(lang: Lang, baseline = false): PlanContext {
  const data = loadData(lang);
  return { data: baseline ? { ...data, mechanics: data.mechanics.filter(section => !section.evidence) } : data,
    lang, copy: translations[lang].advisor, turns: [], championIds: [], judge: "none",
    consented: false, canUseModel: false, retrieval: false };
}

function check(text: string, fixture: { expected: string[]; forbidden?: string[] }) {
  for (const expected of fixture.expected) assert.ok(text.includes(expected), `Missing ${expected}: ${text}`);
  for (const forbidden of fixture.forbidden ?? []) assert.ok(!text.includes(forbidden), `Unexpected ${forbidden}: ${text}`);
  const html = renderToStaticMarkup(createElement(AdvisorMarkdown, { text }));
  assert.doesNotMatch(html, /https?:|youtube|mangdasu|wiki\.league|참고 자료|출처/);
}

test("영상 팁 실제 대화의 원본·검수 질문을 모두 확인한다", async () => {
  for (const fixture of [...fixtures.cases, ...coverage.cases]) {
    await assert.doesNotReject(async () => {
      const { reply } = await answerDialogue(fixture.question, context(fixture.lang as Lang), deps);
      check(reply.text, fixture);
    }, `${fixture.lang}: ${fixture.question}`);
  }
});

test("영상 팁의 모든 후속 대화를 저장하고 복원한다", async () => {
  for (const session of [...fixtures.sessions, ...coverage.sessions]) {
    const ctx = context(session.lang as Lang);
    for (const turn of session.turns) {
      await assert.doesNotReject(async () => {
        const { reply } = await answerDialogue(turn.question, ctx, deps);
        check(reply.text, turn);
        const added = [{ id: ctx.turns.length, role: "user" as const, content: turn.question },
          { id: ctx.turns.length + 1, role: "assistant" as const, content: reply.text, answer: reply.answer, memory: reply.memory }];
        ctx.turns = [...ctx.turns, ...added.flatMap(turn => {
          const revived = reviveTurn(JSON.parse(JSON.stringify(dehydrateTurn(turn))), ctx.data!);
          return revived ? [revived] : [];
        })];
      }, `${session.id}: ${turn.question}`);
    }
  }
});

test("영상별 주장과 분리 검수한 판정의 포함·보류 상태와 태그를 보존한다", () => {
  const claims = source.videos.map(video => video.claims).flat();
  assert.equal(collection.videos.length, 11);
  assert.equal(collection.claimReviews.length, claims.length);
  assert.equal(new Set(collection.claimReviews.map(review => review.claimId)).size, claims.length);
  for (const note of collection.notes) {
    assert.ok(note.tags.includes("tip") && note.tags.includes("interaction"));
    assert.ok(!/https?:/.test(note.text));
    for (const id of note.evidence.claimIds) {
      const claim = claims.find(claim => claim.id === id)!;
      assert.ok(claim);
      assert.ok(!["conflict", "bug_report_unreproduced", "needs_review"].includes(claim.reviewStatus));
    }
  }
  assert.ok(loadMechanicsNotes("26.19").some(note => note.evidence));
  assert.ok(loadMechanicsNotes("26.20").some(note => note.evidence));
  assert.ok(!loadMechanicsNotes("future").some(note => note.evidence));
  const covered = new Set(coverage.cases.flatMap(fixture => fixture.claimIds));
  for (const review of collection.claimReviews.filter(review => review.status === "included")) {
    assert.ok(covered.has(review.claimId), `Untested adopted claim: ${review.claimId}`);
  }
});

test("동일 대화 코드에서 노트 추가 효과를 측정한다", async () => {
  const rows = [];
  for (const fixture of fixtures.cases) {
    const before = await answerDialogue(fixture.question, context(fixture.lang as Lang, true), deps);
    const after = await answerDialogue(fixture.question, context(fixture.lang as Lang), deps);
    const passes = (text: string) => fixture.expected.every(value => text.includes(value))
      && (fixture.forbidden ?? []).every(value => !text.includes(value));
    rows.push({ ...fixture, before: before.reply.text, after: after.reply.text,
      beforePass: passes(before.reply.text), afterPass: passes(after.reply.text) });
  }
  assert.equal(rows.filter(row => !row.afterPass).length, 0);
  assert.ok(rows.some(row => !row.beforePass && row.afterPass));
  if (process.env.WRITE_VIDEO_TIP_EVAL === "1") {
    fs.writeFileSync("dev/research/video-notes/mangdasu-20261006/evaluation.json", JSON.stringify({
      comparison: "Same current code, new notes excluded vs included; not a deployed-version comparison.",
      total: rows.length, beforePass: rows.filter(row => row.beforePass).length,
      afterPass: rows.filter(row => row.afterPass).length, rows,
    }, null, 2) + "\n");
  }
});
