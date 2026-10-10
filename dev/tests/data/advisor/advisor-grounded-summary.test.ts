import assert from "node:assert/strict";
import { test } from "node:test";
import { loadData } from "../../../scripts/advisor/kev-agent/lib";
import { emptyDialogue } from "../../../../src/features/advisor/conversation/memory/dialogueState";
import { acceptedSummary, summarizeGroundedReply } from "../../../../src/features/advisor/answers/evidence/groundedSummary";
import type { DialoguePlan } from "../../../../src/features/advisor/conversation/planning/dialoguePlanner";

const source = ["다리우스 E 포획이 빠졌다면 짧게 교환합니다.", "가렌 P 인내심으로 체력을 회복합니다."];
test("요약은 숫자·대상·조건·부정·추가 지시 변경을 받아들이지 않는다", () => {
  for (const text of ["가렌 E 포획이 빠졌다면 짧게 교환합니다.", "다리우스 E 포획이 있다면 짧게 교환합니다.", "다리우스 E 포획이 빠졌다면 20초 뒤에 교환합니다.", "다리우스 E 포획이 빠졌다면 교환하지 않습니다.", `${source[0]} 점멸로 추격합니다.`, source[1], "다리우스 E 포획이 빠졌다면"]) assert.equal(acceptedSummary(text, source), undefined);
  assert.equal(acceptedSummary(source[0].replace(".", "。"), source), source[0]);
});
const data = loadData("ko_KR");
const dialogue: DialoguePlan = { parts: [{ question: "라인전은?", plan: { type: "matchup", mine: data.cardById.get("Garen")!, enemy: data.cardById.get("Darius")!, focus: "laning" } }], memory: emptyDialogue(data.patch) };
const reply = { text: source.join(" "), memory: { ...dialogue.memory, lastReply: { question: "라인전은?", text: source.join(" ") } } };
test("실패한 생성은 기존 답변과 기억을 그대로 반환한다", async () => {
  const result = await summarizeGroundedReply(dialogue, reply, { mode: "paraphrase", generate: async () => ({ text: "가렌 E 포획이 있다면 들어갑니다.", seconds: 1 }) });
  assert.equal(result.attempt.accepted, false);
  assert.equal(result.reply, reply);
});
test("통과한 후보도 전체 근거와 기억을 지우지 않는다", async () => {
  const result = await summarizeGroundedReply(dialogue, reply, { mode: "extractive", generate: async () => ({ text: source[0], seconds: 1 }) });
  assert.equal(result.reply.summary, source[0]);
  assert.equal(result.reply.text, reply.text);
  assert.equal(result.reply.memory, reply.memory);
});
test("생성 오류·반복·조건 대화에서는 기존 근거 답변을 보존한다", async () => {
  const failed = await summarizeGroundedReply(dialogue, reply, { mode: "paraphrase", generate: async () => { throw new Error("GPU"); } });
  assert.equal(failed.attempt.reason, "generation-error");
  const looped = await summarizeGroundedReply(dialogue, reply, { mode: "extractive", generate: async () => ({ text: source[0], seconds: 1, looped: true }) });
  assert.equal(looped.reply, reply);
  const conditional = { ...reply, memory: { ...reply.memory, conditions: [{ owner: "enemy" as const, slot: "W", status: "down" as const, turn: 1, hypothetical: false }] } };
  const skipped = await summarizeGroundedReply(dialogue, conditional, { mode: "extractive", generate: async () => { assert.fail("생략해야 한다"); } });
  assert.equal(skipped.attempt.reason, "ineligible");
});
