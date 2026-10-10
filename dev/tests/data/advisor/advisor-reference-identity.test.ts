import assert from "node:assert/strict";
import { test } from "node:test";
import { loadData } from "../../../scripts/advisor/kev-agent/lib";
import { buildSpellAnswer, answerKey, type AdvisorAnswer } from "../../../../src/features/advisor/answers/answer";
import { referenceKey, referenceTabsOf } from "../../../../src/features/advisor/answers/references/referenceIdentity";
import { spellFacts } from "../../../../src/features/advisor/answers/builders/spellAnswer";

const data = loadData("ko_KR");
const card = data.cardById.get("MonkeyKing")!;
const q = buildSpellAnswer(card, card.spells[1], "Q 정보");
const r = buildSpellAnswer(card, card.spells[4], "R 쿨타임");

test("Q와 R은 각각의 대화 답을 보관하고 하나의 스킬 자료를 재사용한다", () => {
  assert.notEqual(answerKey(q), answerKey(r));
  assert.equal(referenceKey(q), referenceKey(r));
  const kit: AdvisorAnswer = { kind: "champion", card, view: "skills" };
  const cooldowns: AdvisorAnswer = { kind: "champion", card, focus: "cooldown" };
  assert.equal(referenceKey(q), referenceKey(kit));
  assert.equal(referenceKey(q), referenceKey(cooldowns));
  assert.notEqual(referenceKey(q), referenceKey({ kind: "champion", card, view: "overview" }));
});

test("스킬 탭은 처음 위치를 유지하고 최신 포커스를 보관하며 다른 챔피언은 분리한다", () => {
  const other = data.cardById.get("Ahri")!;
  const turns = [{ id: 1, answer: q }, { id: 2, answer: buildSpellAnswer(other, other.spells[1], "Q 정보") }, { id: 3, answer: r }];
  assert.deepEqual(referenceTabsOf(turns).map(turn => turn.id), [3, 2]);
  assert.equal(turns[0].answer, q);
  assert.equal(referenceKey(turns[0].answer), referenceKey(referenceTabsOf(turns)[0].answer));
});

test("선택하지 않은 스킬도 전체 수치·CC·본문을 확인할 수 있다", () => {
  for (const spell of card.spells) {
    assert.ok(spellFacts(spell).length > 0, spell.slot);
    assert.ok(spell.text.length > 0, spell.slot);
  }
  assert.ok(spellFacts(card.spells[4]).some(fact => fact.label === "재사용 대기시간"));
  const ahri = data.cardById.get("Ahri")!;
  const charm = buildSpellAnswer(ahri, ahri.spells[3], "아리 E CC");
  assert.equal(charm.kind === "spell" && charm.facts.length, 0);
  assert.ok(spellFacts(ahri.spells[3]).some(fact => fact.label === "군중 제어" && fact.value.includes("매혹")));
});
