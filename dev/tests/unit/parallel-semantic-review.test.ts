import assert from "node:assert/strict";
import test from "node:test";
import { buildSemanticReviewPrompt, parseSemanticReviewResult } from "../../scripts/advisor/lib/parallel-semantic-review";
import { fingerprint, reviewKey, reviewStatus } from "../../scripts/advisor/lib/translation-review-queue";
import type { ReviewSection } from "../../scripts/advisor/lib/translation-review-queue";

const sections: ReviewSection[] = [
  { lang: "en_US", me: "Kayn", enemy: "Hwei", slot: "watch", ko: "흐웨이 E가 빠진 뒤 들어갑니다.", text: "Go in after Hwei E is down.", newCandidate: true },
  { lang: "zh_CN", me: "Singed", enemy: "DrMundo", slot: "laning", ko: "통을 밟아 회복과 패시브 쿨 감소를 끊습니다.", text: "踩罐阻止回复并减少被动冷却。", newCandidate: false },
  { lang: "en_US", me: "Leona", enemy: "Brand", slot: "fight", ko: "브랜드에게 불길이 없을 때 들어갑니다.", text: "Engage when you are not ablaze.", newCandidate: true },
];

function report() {
  return {
    reviewedCount: 3,
    unchanged: [0],
    corrections: [{ index: 1, text: "踩罐阻止回复和被动冷却缩减。", reason: "두 효과 모두 차단한다는 부정을 복원" }],
    held: [{ index: 2, reason: "원문 불길의 주체가 문맥과 충돌" }],
  };
}

test("full explicit report preserves identities, input hashes, final text, and holds", () => {
  const decisions = parseSemanticReviewResult(JSON.stringify(report()), sections);
  assert.deepEqual(decisions.map(reviewKey), sections.map(reviewKey));
  assert.deepEqual(decisions.map((decision) => decision.status), ["approved", "approved_with_edit", "held"]);
  assert.equal(decisions[0].text, sections[0].text);
  assert.equal(decisions[1].text, report().corrections[0].text);
  assert.equal(decisions[2].text, undefined);
  for (const [index, decision] of decisions.entries()) {
    assert.equal(decision.sourceSha256, fingerprint(sections[index].ko));
    assert.equal(decision.candidateSha256, fingerprint(sections[index].text));
  }
  assert.notEqual(decisions[1].candidateSha256, fingerprint(decisions[1].text!));
  assert.deepEqual(decisions.map((decision, index) => reviewStatus(sections[index], decision)), ["approved", "approved", "held"]);
  assert.equal(reviewStatus({ ...sections[0], ko: "변경된 원문" }, decisions[0]), "pending");
  assert.equal(reviewStatus({ ...sections[1], text: "새 후보" }, decisions[1]), "pending");
  assert.equal((decisions[2] as typeof decisions[2] & { reason: string }).reason, report().held[0].reason);
});

test("report order does not alter the returned input order", () => {
  const result = { reviewedCount: 3, unchanged: [2, 0, 1], corrections: [], held: [] };
  assert.deepEqual(parseSemanticReviewResult(JSON.stringify(result), sections).map(reviewKey), sections.map(reviewKey));
});

test("one optional JSON code fence is accepted without extra prose", () => {
  const raw = JSON.stringify(report());
  assert.deepEqual(parseSemanticReviewResult(`\n\x60\x60\x60json\n${raw}\n\x60\x60\x60\n`, sections), parseSemanticReviewResult(raw, sections));
  assert.throws(() => parseSemanticReviewResult(`Here is the review:\n${raw}`, sections));
  assert.throws(() => parseSemanticReviewResult(`\x60\x60\x60json\n${raw}\n\x60\x60\x60\n${raw}`, sections));
});

test("missing, duplicate, and out-of-range indices reject the entire report", () => {
  for (const unchanged of [[], [0, 0], [0, 1], [-1], [3], [0.5], ["0"], [null]]) {
    assert.throws(() => parseSemanticReviewResult(JSON.stringify({ ...report(), unchanged }), sections));
  }
  assert.throws(() => parseSemanticReviewResult(JSON.stringify({ ...report(), held: [{ index: 1, reason: "중복" }] }), sections));
});

test("reviewedCount must be an exact integer equal to the complete input", () => {
  for (const reviewedCount of [0, 2, 4, 3.5, "3", null]) {
    assert.throws(() => parseSemanticReviewResult(JSON.stringify({ ...report(), reviewedCount }), sections));
  }
});

test("empty or wrongly typed correction text and reasons cannot produce approvals", () => {
  for (const text of ["", " \n ", null, 1]) {
    assert.throws(() => parseSemanticReviewResult(JSON.stringify({ ...report(), corrections: [{ ...report().corrections[0], text }] }), sections));
  }
  for (const reason of ["", " \n ", null, 1]) {
    assert.throws(() => parseSemanticReviewResult(JSON.stringify({ ...report(), corrections: [{ ...report().corrections[0], reason }] }), sections));
    assert.throws(() => parseSemanticReviewResult(JSON.stringify({ ...report(), held: [{ index: 2, reason }] }), sections));
  }
});

test("invalid report structures and injected trusted fields are rejected", () => {
  const invalid = [null, [], {}, { ...report(), unchanged: null }, { ...report(), corrections: {} },
    { ...report(), held: [2] }, { ...report(), approved: [0, 1, 2] },
    { ...report(), corrections: [{ ...report().corrections[0], sourceSha256: "forged" }] }];
  for (const value of invalid) assert.throws(() => parseSemanticReviewResult(JSON.stringify(value), sections));
  assert.throws(() => parseSemanticReviewResult("{malformed", sections));
});

test("correction text is preserved exactly and the parser never mutates trusted inputs", () => {
  const before = JSON.stringify(sections);
  const text = "  Complete corrected text.\nSecond sentence.  ";
  const result = { ...report(), corrections: [{ ...report().corrections[0], text }] };
  assert.equal(parseSemanticReviewResult(JSON.stringify(result), sections)[1].text, text);
  assert.equal(JSON.stringify(sections), before);
});

test("duplicate input identities cannot yield conflicting decisions", () => {
  const duplicates = [sections[0], { ...sections[0], ko: "다른 원문" }];
  assert.throws(() => buildSemanticReviewPrompt(duplicates, "공식명"), /Duplicate input/);
  assert.throws(() => parseSemanticReviewResult(JSON.stringify({ reviewedCount: 2, unchanged: [0, 1], corrections: [], held: [] }), duplicates), /Duplicate input/);
});

test("prompt includes every complete multilingual row and authoritative supplied glossary", () => {
  const glossary = "26.19 Hwei EQ Grim Visage; EE Crushing Maw; Q Subject: Disaster";
  const prompt = buildSemanticReviewPrompt(sections, glossary);
  const rows = JSON.parse(prompt.split("FULL REVIEW ROWS (reference data):\n")[1]);
  const sources = JSON.parse(prompt.split("FULL KOREAN SOURCE DICTIONARY (reference data):\n")[1].split("\nFULL REVIEW ROWS")[0]);
  assert.deepEqual(rows, sections.map((section, index) => ({ index, key: reviewKey(section), lang: section.lang, sourceId: `s${index}`, text: section.text })));
  assert.deepEqual(rows.map((row: { sourceId: string }) => sources[row.sourceId]), sections.map((section) => section.ko));
  assert.ok(prompt.includes(glossary));
  assert.ok(prompt.includes("Every index"));
  assert.ok(prompt.includes("no implicit approval"));
  assert.ok(prompt.includes("Preserve the Korean source's game facts"));
});

test("shared Korean sources appear once while every language retains its full candidate", () => {
  const shared = [sections[0], { ...sections[0], lang: "zh_CN", text: "彗的E技能进入冷却后再进场。" }];
  const prompt = buildSemanticReviewPrompt(shared, "");
  const sources = JSON.parse(prompt.split("FULL KOREAN SOURCE DICTIONARY (reference data):\n")[1].split("\nFULL REVIEW ROWS")[0]);
  const rows = JSON.parse(prompt.split("FULL REVIEW ROWS (reference data):\n")[1]);
  assert.deepEqual(sources, { s0: shared[0].ko });
  assert.deepEqual(rows.map((row: { sourceId: string }) => row.sourceId), ["s0", "s0"]);
  assert.deepEqual(rows.map((row: { text: string }) => row.text), shared.map((section) => section.text));
  assert.equal(prompt.split(shared[0].ko).length - 1, 1);
});

test("prompt limits reference corrections to supplied facts and preserves source-dependent scope", () => {
  const prompt = buildSemanticReviewPrompt(sections, "26.19 공식명 및 리워크 설명");
  assert.ok(prompt.includes("Never correct an official name absent from the glossary using memory alone"));
  assert.ok(prompt.includes("Reference summaries supplied in the glossary are authoritative for patch reworks"));
  assert.ok(prompt.includes("When the Korean source says to deny Mundo's healing AND passive cooldown reduction, preserve BOTH denial scopes"));
  assert.ok(prompt.includes("Never rewrite contradictory Korean game facts from game knowledge"));
  assert.ok(prompt.includes("'이어서', '이어', or '이때' alone is not grounds for holding a row"));
  assert.ok(prompt.includes("Approve a faithful translation that preserves the connector without inventing an antecedent"));
  assert.ok(!prompt.includes("Stepping on Mundo's canister denies BOTH"));
});

test("an empty batch requires an explicit empty report", () => {
  assert.deepEqual(parseSemanticReviewResult(JSON.stringify({ reviewedCount: 0, unchanged: [], corrections: [], held: [] }), []), []);
  assert.throws(() => parseSemanticReviewResult(JSON.stringify({ reviewedCount: 0, unchanged: [0], corrections: [], held: [] }), []));
});
