import assert from "node:assert/strict";
import test from "node:test";
import { answerDialogue } from "../../../src/features/advisor/conversation/dialogueFlow";
import { qualityContext, restoreReply, localFetch } from "../../scripts/advisor/quality/dialogue";
import { MAX_CONTEXT_FRAMES, CONTEXT_LIMITS } from "../../../src/features/advisor/conversation/contextFrameTypes";
import { recordFrame, usableFrames } from "../../../src/features/advisor/conversation/contextFrames";
import { emptyDialogue } from "../../../src/features/advisor/conversation/dialogueState";
import { isStoredTurn } from "../../../src/features/advisor/storage/historyValidation";
import { dehydrateTurn, TURN_LIMIT } from "../../../src/features/advisor/storage/history";
import { contextProbability, CONTEXT_FEATURE_COUNT, learnedContextRanker } from "../../../src/features/advisor/conversation/contextRanker";
import type { PlanContext } from "../../../src/features/advisor/contracts/planTypes";
import { checkApprovedContexts } from "../../scripts/advisor/context-frames/approval";

const deps = { judge: async () => { throw new Error("unexpected model call"); }, search: async () => [] };
const PATCH = qualityContext("ko_KR", "none").data!.patch;
async function ask(ctx: PlanContext, question: string) {
  const output = await answerDialogue(question, ctx, deps);
  restoreReply(ctx, question, output.reply);
  return output;
}

test("typed contexts resume a stat level after an item without replacing the active item followup", async () => {
  const ctx = qualityContext("ko_KR", "none"); ctx.contextPolicy = "typed";
  await ask(ctx, "가렌 11레벨 체력은?");
  await ask(ctx, "도란의 검 가격은?");
  assert.equal((await ask(ctx, "그 아이템 효과는?")).reply.answer?.kind, "item");
  const result = await ask(ctx, "18레벨이면?");
  assert.equal(result.reply.memory.stat?.level, 18);
  assert.deepEqual(result.reply.memory.stat?.champions, ["Garen"]);
  assert.equal(result.contextDecision?.action, "resume");
});

test("guarded contexts clarify two earlier spell owners and resolve the named confirmation", async () => {
  const ctx = qualityContext("ko_KR", "none"); ctx.contextPolicy = "guarded";
  await ask(ctx, "가렌 Q 쿨타임은?");
  await ask(ctx, "아리 Q 쿨타임은?");
  await ask(ctx, "장화 가격은?");
  const ambiguous = await ask(ctx, "그 스킬 쿨타임은?");
  assert.equal(ambiguous.contextDecision?.action, "clarify");
  const confirmed = await ask(ctx, "가렌 말한 거야");
  assert.equal(confirmed.reply.answer?.kind, "spell");
  assert.equal(confirmed.reply.memory.spell?.champion, "Garen");
  assert.equal(confirmed.reply.memory.spell?.slot, "Q");
});

test("context frames retain references and user parameters without response or knowledge text", () => {
  const memory = emptyDialogue(PATCH);
  memory.active = "rule"; memory.rule = { title: "rule", id: "mech:rule", text: "knowledge body" };
  memory.lastReply = { question: "question", text: "answer body" };
  recordFrame(memory, [], 1);
  assert.doesNotMatch(JSON.stringify(memory.contextFrames), /knowledge body|answer body|lastReply/);
  assert.equal(memory.contextFrames?.[0].state.rule?.id, "mech:rule");
});

test("context lists enforce the selected capacity and reject frames from another patch", () => {
  const memory = emptyDialogue(PATCH);
  for (let i = 0; i < 9; i++) {
    memory.active = "champion"; memory.champion = `champion-${i}`;
    recordFrame(memory, memory.contextFrames ?? [], i, 6);
  }
  assert.equal(memory.contextFrames?.length, 6);
  assert.equal(memory.contextFrames?.[0].key, "champion:champion-3");
  const ctx = qualityContext("ko_KR", "none");
  const valid = emptyDialogue(PATCH); valid.active = "champion"; valid.champion = "Garen";
  recordFrame(valid, [], 1);
  ctx.turns = [{ role: "user", content: "question" }, { role: "assistant", memory: valid }];
  assert.equal(usableFrames(valid, ctx).length, 1);
  valid.contextFrames![0].patch = "old";
  assert.deepEqual(usableFrames(valid, ctx), []);
  assert.throws(() => recordFrame(valid, [], 1, MAX_CONTEXT_FRAMES + 1), /Invalid/);
});

test("stored context frames reject nested frames and embedded answer payloads", () => {
  const memory = emptyDialogue(PATCH);
  memory.active = "champion"; memory.champion = "Garen";
  recordFrame(memory, [], 1);
  const stored = dehydrateTurn({ id: 1, role: "assistant", content: "reply", memory });
  assert.equal(isStoredTurn(stored), true);
  const nested = JSON.parse(JSON.stringify(stored)); nested.memory.contextFrames[0].state.contextFrames = [];
  assert.equal(isStoredTurn(nested), false);
  const body = JSON.parse(JSON.stringify(stored)); body.memory.contextFrames[0].state.answer = "body";
  assert.equal(isStoredTurn(body), false);
});

test("learned context mode never silently falls back when the model is missing", async () => {
  const ctx = qualityContext("ko_KR", "none"); ctx.contextPolicy = "learned";
  await assert.rejects(ask(ctx, "가렌 Q 쿨타임은?"), /requires its ranker/);
});

test("context scoring uses sparse weighted features and rejects malformed model thresholds", () => {
  const model = { featureVersion: 1 as const, weights: Array(CONTEXT_FEATURE_COUNT).fill(0), intercept: 0, confidence: .5, margin: .1 };
  model.weights[5] = 2;
  assert.equal(contextProbability(model, [[5, .5]]), 1 / (1 + Math.exp(-1)));
  assert.throws(() => learnedContextRanker({ ...model, confidence: Number.NaN }), /Invalid/);
});

for (const limit of CONTEXT_LIMITS) test(`capacity ${limit} evicts the oldest distinct task and deduplicates repeat tasks`, () => {
  const memory = emptyDialogue(PATCH); memory.active = "champion";
  for (let index = 0; index <= limit; index++) {
    memory.champion = `champion-${index}`;
    recordFrame(memory, memory.contextFrames ?? [], index, limit);
  }
  assert.equal(memory.contextFrames!.length, limit);
  assert.equal(memory.contextFrames![0].key, "champion:champion-1");
  recordFrame(memory, memory.contextFrames!, limit + 1, limit);
  assert.equal(memory.contextFrames!.length, limit);
});

test("restoring a trimmed conversation locates the frame in retained history", async () => {
  const ctx = qualityContext("ko_KR", "none"); ctx.contextPolicy = "typed";
  await ask(ctx, "아리 소개해줘");
  await ask(ctx, "가렌 Q 쿨타임은?");
  await ask(ctx, "장화 가격은?");
  ctx.turns = ctx.turns.slice(2);
  const result = await ask(ctx, "그 스킬 쿨타임은?");
  assert.equal(result.contextDecision?.selected, "spell:Garen:Q");
  assert.equal(result.reply.memory.spell?.champion, "Garen");
});

test("the adopted default retains contexts and resumes an explicit spell reference", async () => {
  const ctx = qualityContext("ko_KR", "none");
  await ask(ctx, "가렌 Q 쿨타임은?");
  await ask(ctx, "장화 가격은?");
  const result = await ask(ctx, "그 스킬 쿨타임은?");
  assert.equal(result.contextDecision?.policy, "guarded");
  assert.equal(result.contextDecision?.selected, "spell:Garen:Q");
});

test("a new champion remains the owner of an implicit stat question", async () => {
  const ctx = qualityContext("ko_KR", "none");
  await ask(ctx, "오공 문도 박사 18레벨 체력 비교");
  await ask(ctx, "럭스 스킬 설명해줘");
  const result = await ask(ctx, "기본 방어력은?");
  assert.deepEqual(result.reply.memory.stat?.champions, ["Lux"]);
  assert.equal(result.reply.memory.stat?.level, 1);
});

test("an amount alone after an item never reactivates an earlier conversion", async () => {
  const restore = localFetch();
  try {
    const ctx = qualityContext("ko_KR", "none");
    await ask(ctx, "파이크 체력 70이면 추가 공격력 몇?");
    await ask(ctx, "도란 방패 가격 알려줘");
    const result = await ask(ctx, "그럼 210짜리는?");
    assert.equal(result.contextDecision?.action, "keep");
    assert.doesNotMatch(result.reply.text, /추가 공격력 15/);
  } finally { restore(); }
});

test("a confirmed conversion uses the pending amount with the selected owner's source", async () => {
  const restore = localFetch();
  try {
    const ctx = qualityContext("ko_KR", "none");
    await ask(ctx, "파이크 패시브 추가 체력 70이면?");
    await ask(ctx, "블라디미르 패시브 체력 300이면?");
    await ask(ctx, "장화 가격은?");
    assert.equal((await ask(ctx, "아까 패시브에서 체력 140이면?")).contextDecision?.action, "clarify");
    const result = await ask(ctx, "파이크 말한 거야");
    assert.equal(result.reply.memory.mechanic?.abilityId, "Pyke.P");
    assert.equal(result.reply.memory.mechanic?.amount?.value, 140);
    assert.match(result.reply.text, /추가 공격력 10/);
  } finally { restore(); }
});

test("the adoption gate protects new successes even when legacy could not answer them", () => {
  const approval = { caseHash: "cases", scorerHash: "scorer", passedIds: ["old-win", "new-win"] };
  const report = { caseHash: "cases", scorerHash: "scorer", rows: [{ id: "old-win", pass: true }, { id: "new-win", pass: false }] };
  assert.throws(() => checkApprovedContexts(report, approval), /lost an adopted/);
  report.rows[1].pass = true;
  assert.doesNotThrow(() => checkApprovedContexts(report, approval));
  assert.throws(() => checkApprovedContexts({ ...report, caseHash: "other" }, approval), /cases changed/);
});

test("an evicted spell owner prevents an ambiguous reference from selecting only the remaining owner", async () => {
  const ctx = qualityContext("ko_KR", "none"); ctx.contextLimit = 2;
  await ask(ctx, "가렌 Q 쿨타임은?");
  await ask(ctx, "아리 6레벨 체력은?");
  await ask(ctx, "이즈리얼 Q 쿨타임은?");
  await ask(ctx, "장화 가격은?");
  const result = await ask(ctx, "그 스킬 쿨타임은?");
  assert.equal(result.contextDecision?.action, "clarify");
  assert.equal(result.contextDecision?.reason, "evicted");
  assert.equal(result.reply.answer, undefined);
  const confirmed = await ask(ctx, "이즈리얼 말한 거야");
  assert.equal(confirmed.reply.memory.spell?.champion, "Ezreal");
});

test("an evicted conversion asks for its owner instead of reusing the latest champion's passive", async () => {
  const ctx = qualityContext("ko_KR", "none"); ctx.contextLimit = 2;
  await ask(ctx, "파이크 패시브 추가 체력 70이면?");
  await ask(ctx, "아리 11레벨 체력은?");
  await ask(ctx, "럭스 11레벨 체력은?");
  const result = await ask(ctx, "아까 패시브에서 추가 체력 140이면?");
  assert.equal(result.contextDecision?.reason, "evicted");
  assert.equal(result.reply.answer, undefined);
});

test("omission markers stay bounded, carry no entity IDs and survive history restoration", () => {
  const memory = emptyDialogue(PATCH);
  for (let i = 0; i < 100; i++) {
    memory.active = "spell"; memory.spell = { champion: `champion-${i}`, slot: "Q" };
    recordFrame(memory, memory.contextFrames ?? [], i, 2);
  }
  assert.deepEqual(memory.contextOmissions, ["spell:Q"]);
  const stored = dehydrateTurn({ id: 1, role: "assistant", content: "reply", memory });
  assert.equal(isStoredTurn(stored), true);
  const invalid = JSON.parse(JSON.stringify(stored)); invalid.memory.contextOmissions = ["spell:secret"];
  assert.equal(isStoredTurn(invalid), false);
});

test("omission markers still require clarification when no usable frame remains", async () => {
  const ctx = qualityContext("ko_KR", "none");
  const memory = emptyDialogue(PATCH);
  memory.active = "champion"; memory.champion = "Lux";
  memory.contextFrames = []; memory.contextOmissions = ["spell:Q"];
  ctx.turns = [{ role: "assistant", memory }];
  const result = await ask(ctx, "아까 그 스킬 쿨타임은?");
  assert.equal(result.contextDecision?.reason, "evicted");
  assert.equal(result.reply.answer, undefined);
});

test("trimming 80-message history marks forgotten owners below the context capacity", async () => {
  const ctx = qualityContext("ko_KR", "none"); ctx.contextLimit = 32;
  await ask(ctx, "가렌 Q 쿨타임은?");
  for (let turn = 0; turn < TURN_LIMIT / 2; turn++) {
    await ask(ctx, "아리 11레벨 마법 저항력은?");
    ctx.turns = ctx.turns.slice(-TURN_LIMIT);
  }
  assert.equal(ctx.turns.length, TURN_LIMIT);
  assert.equal(ctx.turns.at(-1)?.memory?.contextFrames?.length, 2);
  await ask(ctx, "이즈리얼 Q 쿨타임은?");
  await ask(ctx, "장화 가격은?");
  const result = await ask(ctx, "아까 그 스킬 쿨타임은?");
  assert.equal(result.contextDecision?.reason, "evicted");
  assert.equal(result.reply.answer, undefined);
});

test("the stress gate rejects a guessed answer after its owner was forgotten", () => {
  const approval = { caseHash: "cases", scorerHash: "scorer", passedIds: [], clarificationIds: ["forgotten"] };
  const row: { id: string; pass: boolean; decision: { action: string }; observed?: unknown } = {
    id: "forgotten", pass: false, decision: { action: "clarify" },
  };
  const report = { caseHash: "cases", scorerHash: "scorer", rows: [row] };
  assert.doesNotThrow(() => checkApprovedContexts(report, approval));
  row.decision.action = "keep";
  assert.throws(() => checkApprovedContexts(report, approval), /forgotten context/);
  row.decision.action = "clarify"; row.observed = { kind: "spell" };
  assert.throws(() => checkApprovedContexts(report, approval), /forgotten context/);
});

test("the stress gate protects calculation results beyond the spell owner's identity", () => {
  const approval = { caseHash: "cases", scorerHash: "scorer", passedIds: ["conversion"],
    textRequirements: [{ id: "conversion", contains: ["추가 공격력 20입니다"] }] };
  const row = { id: "conversion", pass: true, text: "추가 체력 280이면 추가 공격력 20입니다." };
  const report = { caseHash: "cases", scorerHash: "scorer", rows: [row] };
  assert.doesNotThrow(() => checkApprovedContexts(report, approval));
  row.text = "추가 공격력 62입니다.";
  assert.throws(() => checkApprovedContexts(report, approval), /numeric answer/);
});
