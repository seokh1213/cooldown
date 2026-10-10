import assert from "node:assert/strict";
import test from "node:test";
import type { AdvisorData } from "../../../../src/features/advisor/retrieval/context";
import type { StoredAnswer } from "../../../../src/features/advisor/storage/history";
import { readConversations, reviveAnswer, reviveTurn, reviveTurns } from "../../../../src/features/advisor/storage/history";

const data = {
  patch: "26.19",
  cardById: new Map([
    ["Garen", { id: "Garen", name: "가렌", spells: [{ slot: "Q", name: "결정타" }] }],
    ["Ahri", { id: "Ahri", name: "아리", spells: [] }],
  ]),
  ruleIndex: new Map([["rule", { name: "rule" }]]),
} as unknown as AdvisorData;

const question = { id: 0, role: "user", content: "질문" };
const reply = { id: 1, role: "assistant", content: "답" };
const compare = { kind: "compare", cardIds: ["Garen", "Ahri"], rows: [{ label: "방어력", values: ["38", "21"] }] };

function readSaved(turns: unknown[]) {
  const original = JSON.stringify([{ id: "saved", title: "질문", turns }]);
  let writes = 0;
  const conversations = readConversations({
    getItem: () => original,
    setItem: () => { writes += 1; },
  });
  assert.equal(writes, 0);
  return conversations;
}

test("null과 잘못된 발화 필드는 저장 기록과 직접 복원에서 제외한다", () => {
  const invalid = [null, {}, { ...question, id: "0" }, { ...question, id: -1 }, { ...question, id: 1.5 },
    { ...question, role: "system" }, { ...question, content: null }, { id: 2, role: "user" }];
  for (const turn of invalid) {
    assert.equal(reviveTurn(turn, data), undefined);
    assert.deepEqual(readSaved([turn])[0].turns, []);
    assert.deepEqual(reviveTurns([turn], data), []);
  }
  assert.deepEqual(reviveTurns(null, data), []);
});

test("깨진 비교 ID와 표 행은 렌더러에 넘기지 않는다", () => {
  const invalid = [
    { ...compare, cardIds: null }, { ...compare, cardIds: [] }, { ...compare, cardIds: ["Garen", 2] },
    { ...compare, rows: null }, { ...compare, rows: [null] },
    { ...compare, rows: [{ label: "방어력", values: null }] },
    { ...compare, rows: [{ label: "방어력", values: ["38", 21] }] },
    { ...compare, rows: [{ label: "방어력", values: ["38"] }] },
    { ...compare, rows: [{ label: "방어력", values: ["38", "21", "10"] }] },
    { ...compare, rows: [{ label: "방어력", values: ["38", "21"], winner: 2 }] },
    { ...compare, cardIds: ["Garen"], rows: [], matchup: true },
  ];
  for (const answer of invalid) {
    assert.equal(reviveAnswer(answer, data), undefined);
    assert.equal(reviveTurn({ ...reply, answer }, data), undefined);
    assert.deepEqual(readSaved([question, { ...reply, answer }])[0].turns, []);
  }
});

test("모르는 답 종류와 깨진 전문 답 필드를 제외한다", () => {
  const invalid = [
    { kind: "unknown" }, { kind: "text", text: {} },
    { kind: "spell", championId: "Garen", slot: "Q", facts: [null], highlighted: [] },
    { kind: "champion", cardId: "Garen", notes: { playing: [], against: null } },
    { kind: "rule", ruleName: "rule", highlighted: [3], rest: [] },
    { kind: "suggestion", original: "가렌", candidateIds: null },
    { kind: "item", itemId: "1", itemName: "아이템", stats: [], effects: [{ name: "효과", active: true }], verdicts: [] },
  ];
  for (const answer of invalid) assert.equal(reviveAnswer(answer, data), undefined);
  assert.equal(reviveTurn({ ...reply, answers: [compare, { kind: "unknown" }] }, data), undefined);
});

test("잘못된 질문이나 답의 짝만 제거하고 나머지 대화와 저장 원문을 보존한다", () => {
  const validQuestion = { ...question, id: 4, content: "살아 있는 질문" };
  const validReply = { ...reply, id: 5, answer: { kind: "text", text: "살아 있는 답" } };
  const turns = [question, { ...reply, answer: { kind: "unknown" } },
    { ...question, id: 2, content: null }, { ...reply, id: 3 }, null, validQuestion, validReply];
  const original = JSON.stringify([
    null, { id: "bad", turns },
    { id: "saved", title: "제목", turns },
    { id: "other", title: "다른 대화", turns: [question, reply] },
  ]);
  let writes = 0;
  const conversations = readConversations({ getItem: () => original, setItem: () => { writes += 1; } });
  assert.deepEqual(conversations.map(entry => entry.id), ["saved", "other"]);
  assert.deepEqual(conversations[0].turns, [validQuestion, validReply]);
  assert.deepEqual(conversations[1].turns, [question, reply]);
  assert.deepEqual(reviveTurns(turns, data).map(turn => turn.id), [4, 5]);
  assert.equal(writes, 0);
});

test("읽기 실패와 JSON 형식 오류는 빈 기록으로 처리한다", () => {
  for (const value of ["{", "null", "{}", "42"]) {
    assert.deepEqual(readConversations({ getItem: () => value, setItem: () => {} }), []);
  }
  assert.deepEqual(readConversations({ getItem: () => { throw new Error("blocked"); }, setItem: () => {} }), []);
});

test("잘못된 날짜 메타데이터만 제외하고 날짜 없는 기존 대화는 보존한다", () => {
  const legacy = { id: "legacy", title: "질문", turns: [question, reply] };
  const getItem = () => JSON.stringify([
    { ...legacy, id: "bad-created", createdAt: {} },
    { ...legacy, id: "bad-updated", updatedAt: null },
    legacy,
    { ...legacy, id: "dated", createdAt: "2026-10-06", updatedAt: "2026-10-06" },
  ]);
  assert.deepEqual(readConversations({ getItem, setItem: () => {} }).map(entry => entry.id), ["legacy", "dated"]);
});

test("수치·기억·추적 메타데이터도 복원 전에 검사한다", () => {
  const invalid = [
    { ...reply, stats: { tokens: 1, seconds: "1" } },
    { ...reply, stats: { tokens: 1, seconds: 1, ttft: "1" } },
    { ...reply, sources: [null] },
    { ...reply, memory: { patch: data.patch, conditions: [null] } },
    { ...reply, memory: { patch: data.patch, compared: 1 } },
    { ...reply, memory: { patch: data.patch, stat: { kind: "championStat", champions: null } } },
    { ...reply, trace: { judge: "none", parts: [null] } },
  ];
  for (const turn of invalid) assert.equal(reviveTurn(turn, data), undefined);
});

test("당시 원본이 없는 기존 카드도 저장 원문과 대화는 남기고 현재 카드로 대체하지 않는다", () => {
  const answers: StoredAnswer[] = [
    { kind: "spell", championId: "Garen", slot: "Q", focus: "cooldown", facts: [], highlighted: [] },
    { kind: "champion", cardId: "Garen", notes: { playing: ["노트"], against: [] } },
    { kind: "rule", ruleName: "rule", highlighted: ["규칙"], rest: [] },
    { kind: "suggestion", original: "가랜", candidateIds: ["Garen"] },
    compare as StoredAnswer,
    { kind: "item", itemId: "1", itemName: "아이템", price: 100, stats: [], effects: [], verdicts: [] },
    { kind: "text", text: "답" },
  ];
  for (const answer of answers) {
    const revived = reviveAnswer(answer, data);
    assert.equal(revived?.kind, answer.kind === "item" || answer.kind === "text" ? answer.kind : undefined);
    const turn = reviveTurn({ ...reply, answer }, data);
    assert.ok(turn);
    assert.equal(Boolean(turn.referenceUnavailable), !revived);
    assert.deepEqual(readSaved([question, { ...reply, answer }])[0].turns, [question, { ...reply, answer }]);
  }

});

test("새 검증은 유효한 옛 패치 값과 메타데이터를 바꾸지 않는다", () => {
  const stored = { ...reply, byCode: true, answer: compare,
    memory: { patch: "26.18", conditions: [], active: "compare", compared: ["Garen", "Ahri"] },
    stats: { tokens: 10, seconds: 1, ttft: 0.2, promptTokens: 20 },
    trace: { judge: "offline", parts: [{ question: "질문", request: { operation: "lookup", targets: ["Garen", "Ahri"] }, plan: "card" }] } };
  assert.deepEqual(readSaved([question, stored])[0].turns, [question, stored]);
  const revived = reviveTurn(stored, data);
  assert.ok(revived);
  assert.equal(revived.content, reply.content);
  assert.deepEqual(revived.stats, stored.stats);
  assert.equal(revived.answer, undefined);
  assert.equal(revived.referenceUnavailable, true);
  assert.deepEqual(revived.historical?.answer, compare);
  assert.equal(revived.memory, undefined);
});
