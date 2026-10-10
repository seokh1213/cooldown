import assert from "node:assert/strict";
import { test } from "node:test";
import { loadData } from "../../../scripts/advisor/kev-agent/lib";
import { buildSpellAnswer, buildCompareAnswer } from "../../../../src/features/advisor/answers/answer";
import { championReferenceOf } from "../../../../src/features/advisor/answers/references/championReference";
import { dehydrateAnswer, reviveAnswer } from "../../../../src/features/advisor/storage/history";
import { answerProse } from "../../../../src/features/advisor/answers/presentation/prose";

const data = loadData("ko_KR");
const card = data.cardById.get("MonkeyKing")!;

test("Q 질문은 Q만 답하고 전체 스킬 자료를 저장 복원 후에도 유지한다", () => {
  const answer = buildSpellAnswer(card, card.spells.find(spell => spell.slot === "Q")!, "오공 Q 정보");
  assert.equal(answer.kind, "spell");
  const text = answerProse(answer, "ko_KR");
  assert.doesNotMatch(text, /분신 전사|회전격/);
  assert.equal(championReferenceOf(answer)?.card.spells.length, 5);
  const stored = dehydrateAnswer(answer);
  assert.equal("card" in stored, false);
  const revived = reviveAnswer(JSON.parse(JSON.stringify(stored)), data)!;
  assert.equal(revived.kind, "spell");
  assert.equal(championReferenceOf(revived)?.card.spells.length, 5);
});

test("한 챔피언의 여러 스탯은 기본 카드로 보여주고 실제 두 챔피언 비교는 표를 유지한다", () => {
  const single = buildCompareAnswer([card], "오공 체력 체젠 비교");
  assert.equal(championReferenceOf(single)?.card.id, "MonkeyKing");
  assert.equal(championReferenceOf(single)?.statQuery?.fields?.length, 2);
  const pair = buildCompareAnswer([card, data.cardById.get("DrMundo")!], "체력 체젠 비교");
  assert.equal(championReferenceOf(pair), undefined);
});
