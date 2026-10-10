import assert from "node:assert/strict";
import { test } from "node:test";
import { loadData } from "../../scripts/advisor/kev-agent/lib";
import { buildSpellAnswer, type AdvisorAnswer } from "../../../src/features/advisor/answers/answer";
import { groupReferenceAnswers, isReferenceAnswer } from "../../../src/features/advisor/answers/referenceGroups";
import { referenceKey } from "../../../src/features/advisor/answers/referenceIdentity";
import { dehydrateTurn, reviveTurn } from "../../../src/features/advisor/storage/history";

const data = loadData("ko_KR");
const corki = data.cardById.get("Corki")!;
const w = buildSpellAnswer(corki, corki.spells.find(spell => spell.slot === "W")!, "W 지속 시간");
const e = buildSpellAnswer(corki, corki.spells.find(spell => spell.slot === "E")!, "E 지속 시간");

test("같은 챔피언의 W·E는 카드 하나에서 두 답을 모두 보존한다", () => {
  const answers = Object.freeze([w, e]);
  const groups = groupReferenceAnswers(answers);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].answers, [w, e]);
  assert.equal(groups[0].answer, w);
  assert.deepEqual(answers, [w, e]);
});

test("다른 챔피언과 규칙 답은 스킬 카드에 합치지 않는다", () => {
  const ahri = data.cardById.get("Ahri")!;
  const q = buildSpellAnswer(ahri, ahri.spells[1], "Q 정보");
  const text: AdvisorAnswer = { kind: "text", text: "별도 안내" };
  const groups = groupReferenceAnswers([w, text, q, e]);
  assert.deepEqual(groups.map(group => group.answers), [[w, e], [text], [q]]);
  assert.deepEqual(groups.map(group => isReferenceAnswer(group.answer)), [true, false, true]);
});

test("같은 종류의 글 답도 서로 다른 본문은 각각 남긴다", () => {
  const first: AdvisorAnswer = { kind: "text", text: "첫 안내" };
  const second: AdvisorAnswer = { kind: "text", text: "둘째 안내" };
  assert.deepEqual(groupReferenceAnswers([first, second]).map(group => group.answer), [first, second]);
});

test("전체 카드가 없는 과거 스킬 답은 각각 유지해 다른 스킬을 숨기지 않는다", () => {
  assert.equal(w.kind, "spell");
  assert.equal(e.kind, "spell");
  const oldW = { ...w, card: undefined };
  const oldE = { ...e, card: undefined };
  assert.equal(groupReferenceAnswers([oldW, oldE]).length, 2);
  assert.notEqual(referenceKey(oldW), referenceKey(oldE));
});

test("새로고침으로 복원한 복수 답도 원본을 바꾸지 않고 카드 하나로 묶는다", () => {
  const stored = dehydrateTurn({ id: 2, role: "assistant", content: "W·E 답", answers: [w, e] });
  const restored = reviveTurn(JSON.parse(JSON.stringify(stored)), data)!;
  assert.equal(restored.answers?.length, 2);
  const groups = groupReferenceAnswers(restored.answers!);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].answers.map(answer => answer.kind === "spell" && answer.spell.slot), ["W", "E"]);
});
