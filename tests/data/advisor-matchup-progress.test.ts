import assert from "node:assert/strict";
import { test } from "node:test";
import { loadData } from "../../scripts/llm/kev-agent/lib";
import { translations } from "../../src/i18n/translations";
import { selectPrecomputed } from "../../src/lib/advisor/precomputed";
import { selectMatchupReply, focusOfMatchupTopic } from "../../src/lib/advisor/matchupReply";
import { planDialogue } from "../../src/lib/advisor/dialoguePlanner";
import { emptyDialogue, rememberAnswer, dialogueMemoryOf } from "../../src/lib/advisor/dialogueState";
import { dehydrateTurn, reviveTurn } from "../../src/lib/advisor/history";
import type { AdvisorAnswer } from "../../src/lib/advisor/answer";

const data = loadData("ko_KR");
const cards = [data.cardById.get("Jax")!, data.cardById.get("Fiora")!];
const pair = { watch: "응수를 조심합니다.", build: "방어력을 삽니다.", fight: "짧게 교환합니다.", laning: "막타를 챙깁니다.", combo: "반격을 준비합니다.", escape: "응수가 빠진 뒤 들어갑니다.", teamfight: "아군을 보호합니다.", phase: "후반을 준비합니다." };
const memory = { ...emptyDialogue(data.patch), active: "matchup" as const, matchup: { mine: "Jax", enemy: "Fiora", focus: "laning", shownTopics: ["laning"] } };

test("연속 조언 요청은 실제로 보여준 칸을 제외하고 소진하면 빈 선택을 반환한다", () => {
  const shown = [...memory.matchup.shownTopics];
  for (let turn = 0; turn < 3; turn++) {
    const selected = selectPrecomputed(pair, { mode: "advance", shownTopics: shown }, cards);
    assert.ok(selected.topics.length > 0);
    assert.ok(selected.topics.every(topic => !shown.includes(topic)));
    shown.push(...selected.topics);
  }
  const exhausted = selectPrecomputed(pair, { mode: "advance", shownTopics: shown }, cards);
  assert.equal(exhausted.text, undefined);
  assert.deepEqual(exhausted.topics, []);
});

test("이유 질문은 이미 본 주제라도 같은 조건의 주의 문단을 설명한다", () => {
  const selected = selectPrecomputed(pair, { focus: "escape-window", mode: "explain", shownTopics: Object.keys(pair) }, cards);
  assert.deepEqual(selected.topics, ["escape", "watch"]);
  assert.doesNotMatch(selected.text!, /방어력|막타/);
});

test("일반 팁 뒤의 이유 질문은 실제로 보여준 첫 주제에 연결할 수 있다", () => {
  const selected = selectPrecomputed(pair, { mode: "advance", shownTopics: ["laning"] }, cards);
  assert.equal(focusOfMatchupTopic(selected.topics[0]), "combo");
  assert.equal(focusOfMatchupTopic("escape"), "escape-window");
});

test("은행 자료가 소진되면 첫 답이나 노트로 되돌아가지 않는다", () => {
  const answer: AdvisorAnswer = { kind: "compare", cards, rows: [], matchup: true };
  const selected = selectMatchupReply(answer, pair, { question: "팁 좀", mine: cards[0], enemy: cards[1], continuation: "advance", shownTopics: Object.keys(pair) }, "ko_KR");
  if (selected.answer.kind !== "text") assert.fail("소진 안내여야 한다");
  assert.match(selected.answer.text, /모두 보여드렸/);
});

test("은행이 없는 쌍도 노트가 없으면 소진 안내로 답한다", () => {
  const selected = selectMatchupReply({ kind: "compare", cards, rows: [], matchup: true }, undefined, { question: "팁 좀", mine: cards[0], enemy: cards[1], continuation: "advance" }, "ko_KR");
  assert.equal(selected.answer.kind, "text");
});

test("은행 없이 노트를 조립할 때도 표시한 칸을 제외하고 소진을 알린다", () => {
  const answer: AdvisorAnswer = { kind: "compare", cards, rows: [], matchup: true, notes: {
    mine: [], enemy: [], plan: { focus: "laning", mine: [{ category: "laning", text: "짧게 교환합니다." }], enemy: [],
      claims: [{ kind: "pinned", text: "응수를 조심합니다." }, { kind: "defense", text: "방어력을 먼저 올립니다." }] },
  } };
  const request = { question: "라인전", mine: cards[0], enemy: cards[1], focus: "laning", scope: "topic" as const };
  const first = selectMatchupReply(answer, undefined, request, "ko_KR");
  assert.deepEqual(first.topics, ["fight"]);
  const next = selectMatchupReply(answer, undefined, { ...request, continuation: "advance", shownTopics: first.topics }, "ko_KR");
  assert.deepEqual(next.topics, ["watch", "build"]);
  if (next.answer.kind !== "compare") assert.fail("남은 노트를 보여줘야 한다");
  assert.doesNotMatch(next.answer.precomputed!, /짧게 교환/);
  const exhausted = selectMatchupReply(answer, undefined, { ...request, continuation: "advance", shownTopics: [...first.topics, ...next.topics] }, "ko_KR");
  assert.equal(exhausted.answer.kind, "text");
});

test("은행 없이 일반 상대법을 조립해도 첫 위협의 대처 문장을 보존한다", () => {
  const answer: AdvisorAnswer = { kind: "compare", cards, rows: [], matchup: true, notes: {
    mine: [], enemy: [], plan: { focus: "general", question: "피오라 상대법", claims: [], mine: [],
      enemy: [{ category: "skill", text: "피오라 W 응수는 기절을 막습니다. 응수가 살아 있으면 E 재발동을 늦춥니다." }] },
  } };
  const selected = selectMatchupReply(answer, undefined, { question: "피오라 상대법", mine: cards[0], enemy: cards[1], focus: "general", scope: "topic" }, "ko_KR");
  if (selected.answer.kind !== "compare") assert.fail("노트로 답해야 한다");
  assert.match(selected.answer.precomputed!, /응수가 살아 있으면.*재발동을 늦/);
  assert.deepEqual(selected.topics, ["watch"]);
});

test("조언 진행 상태는 저장 후 복원되고 패치가 바뀌면 초기화된다", () => {
  const stored = dehydrateTurn({ id: 1, role: "assistant", content: "조언", memory });
  const restored = reviveTurn(JSON.parse(JSON.stringify(stored)), data)!;
  assert.deepEqual(dialogueMemoryOf([restored], data).matchup?.shownTopics, ["laning"]);
  assert.equal(dialogueMemoryOf([{ ...restored, memory: { ...memory, patch: "old" } }], data).matchup, undefined);
});

test("같은 상성의 답변은 진행 상태를 유지하고 상대가 바뀌면 비운다", () => {
  const same = rememberAnswer(memory, { kind: "compare", cards, rows: [], matchup: true });
  assert.deepEqual(same.matchup?.shownTopics, ["laning"]);
  const changed = rememberAnswer(same, { kind: "compare", cards: [cards[0], data.cardById.get("Renekton")!], rows: [], matchup: true });
  assert.deepEqual(changed.matchup?.shownTopics, []);
});

test("한국어·영어·중국어 일반 조언과 이유 질문을 같은 대화 흐름에서 구분한다", async () => {
  const ctx = { data, lang: "ko_KR" as const, copy: translations.ko_KR.advisor, turns: [{ role: "assistant" as const, memory }], championIds: [], consented: false, canUseModel: false, retrieval: false, judge: "none" as const };
  const deps = { judge: async () => { throw new Error("일반 조언에 판정은 필요 없다"); }, search: async () => [] };
  for (const question of ["팁 좀 줘", "tips", "有建议吗", "왜?", "why?"]) {
    const plan = (await planDialogue(question, ctx, deps)).parts[0].plan;
    if (plan.type !== "matchup") assert.fail(`${question}: 같은 상성의 이어 묻기여야 한다`);
    assert.equal(plan.continuation, /왜|why/.test(question) ? "explain" : "advance");
  }
});

test("다른 규칙을 조회하고 저장 복원한 뒤 이전 상성의 일반 팁은 남은 칸을 이어간다", async () => {
  const prior = { ...memory, active: "rule" as const, rule: { title: "스킬 가속", text: "가속 계산" }, matchup: { ...memory.matchup, shownTopics: Object.keys(pair) } };
  const stored = dehydrateTurn({ id: 1, role: "assistant", content: "가속 계산", memory: prior });
  const restored = reviveTurn(JSON.parse(JSON.stringify(stored)), data)!;
  const ctx = { data, lang: "ko_KR" as const, copy: translations.ko_KR.advisor, turns: [restored], championIds: [], consented: false, canUseModel: false, retrieval: false, judge: "none" as const };
  const deps = { judge: async () => { throw new Error("일반 조언에 판정은 필요 없다"); }, search: async () => [] };
  for (const question of ["아까 상성에서 팁 좀 줘", "back to that matchup, any tips?", "回到之前的对局，有建议吗"]) {
    const dialogue = await planDialogue(question, ctx, deps);
    const plan = dialogue.parts[0].plan;
    if (plan.type !== "matchup") assert.fail(`${question}: 이전 상성으로 돌아가야 한다`);
    assert.equal(plan.continuation, "advance", question);
    const selected = selectMatchupReply({ kind: "compare", cards, rows: [], matchup: true }, pair, { ...plan, question, shownTopics: dialogue.memory.matchup?.shownTopics }, "ko_KR");
    assert.equal(selected.answer.kind, "text", question);
    if (selected.answer.kind === "text") assert.match(selected.answer.text, /모두 보여드렸/);
  }
});

test("이전 상성에서 특정 주제를 다시 요청하면 진행 소진과 관계없이 그 주제를 보여준다", async () => {
  const prior = { ...memory, active: "rule" as const, matchup: { ...memory.matchup, shownTopics: Object.keys(pair) } };
  const ctx = { data, lang: "ko_KR" as const, copy: translations.ko_KR.advisor, turns: [{ role: "assistant" as const, memory: prior }], championIds: [], consented: false, canUseModel: false, retrieval: false, judge: "none" as const };
  const deps = { judge: async () => { throw new Error("주제 요청에 판정은 필요 없다"); }, search: async () => [] };
  const dialogue = await planDialogue("아까 상성에서 아이템 팁 좀 줘", ctx, deps);
  const plan = dialogue.parts[0].plan;
  if (plan.type !== "matchup") assert.fail("이전 상성의 아이템을 보여줘야 한다");
  assert.equal(plan.continuation, undefined);
  const selected = selectMatchupReply({ kind: "compare", cards, rows: [], matchup: true }, pair, { ...plan, question: "아이템 팁", shownTopics: dialogue.memory.matchup?.shownTopics, scope: "topic" }, "ko_KR");
  assert.deepEqual(selected.topics, ["build"]);
});
