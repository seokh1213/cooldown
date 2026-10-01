import assert from "node:assert/strict";
import { test } from "node:test";
import { loadData } from "../../scripts/llm/kev-agent/lib";
import type { Atom, AtomFile } from "../../scripts/llm/build-note-atoms";
import { selectAtomAnswer, type AtomRequest } from "../../scripts/llm/atom-context/select";
import { emptyDialogue, scenarioConditions } from "../../src/lib/advisor/dialogueState";

const data = loadData("ko_KR");
const card = (id: string) => data.cardById.get(id)!;
const request = (enemy = "Fiora"): AtomRequest => ({ question: "피오라 W 어떻게 빼?", mine: card("Jax"), enemy: card(enemy), focus: "skill", memory: emptyDialogue(data.patch), baseline: "" });
function atom(id: string, source: string, text: string): Atom {
  return { id, source: `playbook:${source}`, perspective: "against", kind: "action", topic: "skill", skills: ["W"], effects: [], text: { ko: text } };
}
const file = (champion: string, atoms: Atom[]): [string, AtomFile] => [champion, { champion, patch: "26.18", atoms }];

test("출처의 챔피언 조건을 상속하면 잭스 질문에 아트록스 한정 원자를 싣지 않는다", () => {
  const files = new Map([file("Fiora", [
    atom("specific", "vs-fiora-riposte-aatrox", "아트록스 Q 1·2타로 응수를 빼냅니다."),
    atom("general", "vs-fiora-riposte", "응수를 먼저 빼냅니다."),
  ])]);
  const detached = selectAtomAnswer(data, files, request(), "detached");
  assert.match(detached.text, /아트록스/);
  const linked = selectAtomAnswer(data, files, request(), "linked");
  assert.doesNotMatch(linked.text, /아트록스/);
  assert.ok(linked.sources.every(s => s.eligible));
  assert.match(linked.text, /잭스라면 E 반격/);
});

test("오래된 원자의 본문 대신 현재 출처 노트의 조건과 행동을 함께 복원한다", () => {
  const files = new Map([file("Fiora", [atom("old", "vs-fiora-riposte", "무조건 먼저 돌진합니다.")])]);
  const result = selectAtomAnswer(data, files, request(), "linked");
  assert.doesNotMatch(result.text, /무조건 먼저/);
  assert.match(result.text, /응수가 살아 있는 동안/);
  assert.match(result.text, /옆무빙/);
});

test("같은 출처의 원자 셋을 골라도 원본 노트는 한 번만 표시한다", () => {
  const files = new Map([file("Fiora", [1, 2, 3].map(i => atom(String(i), "vs-fiora-riposte", "응수")))]);
  const result = selectAtomAnswer(data, files, request(), "linked");
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].atoms.length, 3);
  assert.equal(result.text.match(/피오라 상대의 첫 과제/g)?.length, 1);
});

test("원거리 상대용 원자는 상대를 가렌으로 바꾸면 현재 부모 조건으로 제외한다", () => {
  const ranged = { ...atom("ranged", "jax-skill-e-vs-ranged", "원거리 대응"), perspective: "playing" as const, skills: ["E"] };
  const core = { ...atom("core", "jax-skill-e-core", "반격"), perspective: "playing" as const, skills: ["E"] };
  const files = new Map([file("Jax", [ranged, core])]);
  const rangedResult = selectAtomAnswer(data, files, { ...request("Teemo"), question: "내 E 반격 언제 써?" }, "linked");
  assert.ok(rangedResult.sources.some(s => s.key.endsWith("jax-skill-e-vs-ranged")));
  const meleeResult = selectAtomAnswer(data, files, { ...request("Garen"), question: "내 E 반격 언제 써?" }, "linked");
  assert.ok(meleeResult.sources.every(s => !s.key.endsWith("jax-skill-e-vs-ranged")));
});

test("사용자 조건 정정은 원자 선택에서도 사용 가능과 재사용 대기 상태를 구분한다", () => {
  const memory = emptyDialogue(data.patch);
  memory.conditions = scenarioConditions("상대 W는 있고 Q가 빠진 거야", [], 1);
  const result = selectAtomAnswer(data, new Map([file("Fiora", [atom("general", "vs-fiora-riposte", "응수")])]), { ...request(), memory }, "linked");
  assert.match(result.text, /상대 W 사용 가능.*상대 Q 재사용 대기 중/);
  assert.doesNotMatch(result.text, /상대 W 재사용 대기 중/);
});

test("대상에 맞는 출처가 없으면 이번 요청의 기존 답변을 사용한다", () => {
  const memory = emptyDialogue(data.patch);
  const baseline = "이번 요청에 조립한 근거 답변";
  memory.lastReply = { question: "지난 질문", text: "지난 답변" };
  const result = selectAtomAnswer(data, new Map(), { ...request(), memory, baseline }, "linked");
  assert.equal(result.text, baseline);
  assert.equal(result.fallback, "no-eligible-source");
});
