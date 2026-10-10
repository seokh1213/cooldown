import assert from "node:assert/strict";
import { test } from "node:test";
import { loadData } from "../../scripts/advisor/kev-agent/lib";
import { checkMatchupFacts, checkedMatchupPair } from "../../../src/features/advisor/answers/matchupFactCheck";
import { matchupNotes } from "../../../src/features/advisor/retrieval/playbookNotes";
import { buildCompareAnswer } from "../../../src/features/advisor/answers/answer";
import { answerProse } from "../../../src/features/advisor/answers/prose";
import { deriveItemClaims, renderItemClaims } from "../../../src/domain/knowledge/claims";

const data = loadData("ko_KR");
const cards = ["Garen", "Darius"].map(id => data.cardById.get(id)!);
test("명명된 스킬의 주인과 피해 유형이 바뀌면 반증한다", () => {
  assert.equal(checkMatchupFacts("가렌 E 포획의 사거리 밖에 머뭅니다.", cards)[0].reason, "spell-owner");
  assert.equal(checkMatchupFacts("다리우스 R 녹서스의 단두대는 마법 피해입니다.", cards)[0].reason, "damage-type");
  assert.deepEqual(checkMatchupFacts("다리우스 R 녹서스의 단두대는 고정 피해입니다.", cards), []);
});
test("저항 전체를 무용하다고 하는 문장만 제거한다", () => {
  const pair = checkedMatchupPair({ build: "방어력은 한 푼도 값을 하지 않습니다. 마법 저항력을 챙깁니다.", watch: "다리우스 E 포획이 빠졌다면 접근합니다." }, cards);
  assert.equal(pair.build, "마법 저항력을 챙깁니다.");
  assert.equal(pair.watch, "다리우스 E 포획이 빠졌다면 접근합니다.");
  assert.deepEqual(checkMatchupFacts("마법 피해는 방어력으로 줄일 수 없습니다.", cards), []);
});
test("피해를 줄이는 효과를 피해 유형 주장으로 읽지 않는다", () => {
  const amumu = data.cardById.get("Amumu")!;
  assert.deepEqual(checkMatchupFacts("아무무 E 짜증내기는 물리 피해를 줄입니다.", [amumu]), []);
  assert.equal(checkMatchupFacts("아무무 E 짜증내기는 물리 피해를 줄이므로 방어구 관통을 먼저 챙깁니다.", [amumu])[0].reason, "flat-reduction-penetration");
  assert.deepEqual(checkMatchupFacts("아무무 E 짜증내기의 물리 피해 감소는 방어구 관통으로 없앨 수 없습니다.", [amumu]), []);
});
test("서로 다른 이름의 앞부분이 같아도 스킬 주인 오류로 보지 않는다", () => {
  const pair = [data.cardById.get("Yone")!, data.cardById.get("TwistedFate")!];
  assert.deepEqual(checkMatchupFacts("트위스티드 페이트 R 운명의 이동이 보이면 요네 R 운명봉인으로 끊습니다.", pair), []);
});
test("은행이 없는 오공 대 럼블도 도출 문장이 방어력을 무용하다고 단정하지 않는다", () => {
  const mine = data.cardById.get("MonkeyKing")!, enemy = data.cardById.get("Rumble")!;
  const derived = renderItemClaims(enemy, deriveItemClaims(enemy));
  assert.match(derived, /기본 공격과 다른 적/);
  assert.doesNotMatch(derived, /한 푼|저항력만 실효/);
  const notes = matchupNotes(data, mine, enemy, "ko_KR");
  const answer = buildCompareAnswer([mine, enemy], "아이템 뭐 가?", undefined, { matchup: true, notes, lang: "ko_KR" });
  const text = answerProse(answer, "ko_KR");
  assert.doesNotMatch(text, /한 푼|저항력만 실효/);
});
