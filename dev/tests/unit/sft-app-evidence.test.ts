import assert from "node:assert/strict";
import { test } from "node:test";
import { answerEvidence as evidenceOf } from "../../../src/features/advisor/answers/answerEvidence";

const documents = [{ id: "meta:baron", title: "바론", kind: "meta" as const, text: "20분에 나옵니다." }];

test("a returned knowledge reference identifies app evidence", () => {
  const result = evidenceOf({ type: "code", answer: "20분에 나옵니다.", knowledge: { id: "meta:baron", title: "바론" } }, documents);
  assert.equal(result.documentId, "meta:baron");
});

test("suggestions are not treated as a retrieved answer", () => {
  const result = evidenceOf({ type: "code", answer: "**바론**\n", related: [{ id: "meta:baron", title: "바론" }] }, documents);
  assert.equal(result.documentId, undefined);
});

test("a lexical fallback identifies a single document without gold access", () => {
  assert.equal(evidenceOf({ type: "code", answer: "**바론**\n20분에 나옵니다." }, documents).documentId, "meta:baron");
  const ambiguous = [...documents, { ...documents[0], id: "rule:baron" }];
  assert.equal(evidenceOf({ type: "code", answer: "20분에 나옵니다." }, ambiguous).documentId, undefined);
});
