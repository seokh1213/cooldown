import assert from "node:assert/strict";
import { test } from "node:test";
import notes from "../../knowledge/monster-notes.json";
import { MONSTER_NOTES, monsterValue } from "../../src/lib/knowledge/monsterNotes";
import { gameMetaAnswer, gameMetaById, gameMetaDocs } from "../../src/lib/advisor/gameMeta";
import { monsterCandidate } from "../../scripts/llm/game-knowledge/monster-candidates";

test("성장은 몬스터 최소 레벨에서 시작하는 선형 덧셈이 아니다", () => {
  assert.equal(monsterValue({ kind: "champion-growth", base: 175, growth: 20 }, 11), 350.5);
  assert.equal(monsterValue({ kind: "champion-growth", base: 16300, growth: 170 }, 11), 17791.75);
  assert.equal(monsterValue({ kind: "champion-growth", base: 4200, growth: 430 }, 6), 5898.5);
});

test("모든 항목은 출처와 검수 상태를 가지며 충돌 항목에는 검수 완료 패치를 찍지 않는다", () => {
  const sourceIds = new Set(Object.keys(notes.sources));
  for (const note of MONSTER_NOTES) for (const fact of [...Object.values(note.stats), ...note.abilities, ...(note.buffs ?? [])]) {
    assert.ok(fact!.sources.length > 0, note.id);
    assert.ok(fact!.sources.every(id => sourceIds.has(id)), note.id);
    assert.equal(fact!.version.verifiedThroughPatch, fact!.reviewStatus === "approved" ? "26.19" : null);
  }
});

test("같은 몬스터의 수치도 질문의 개체 레벨·첫 생성 조건을 적용한다", () => {
  assert.match(gameMetaAnswer("바론 18레벨 공격력", "ko_KR")!, /공격력: 515/);
  assert.match(gameMetaAnswer("바론 7레벨 공격력", "ko_KR")!, /검수 범위에 없습니다/);
  assert.match(gameMetaAnswer("첫 바위게 1레벨 체력", "ko_KR")!, /1,007\.5/);
  assert.match(gameMetaAnswer("블루 2레벨 체력", "ko_KR")!, /검수 범위에 없습니다/);
});

test("원소별 드래곤과 원천 충돌을 구분하고 바위게의 미사용 공격력을 답하지 않는다", () => {
  assert.match(gameMetaAnswer("대지 용 6레벨 체력", "ko_KR")!, /5,898\.5/);
  assert.match(gameMetaAnswer("화염 드래곤 공격력", "ko_KR")!, /공격력: 70/);
  assert.match(gameMetaAnswer("화학공학 드래곤 공격력", "ko_KR")!, /위키 50.*47.*확정하지/);
  assert.match(gameMetaAnswer("바위게 공격력", "ko_KR")!, /공격하지 않고/);
});

test("상세 스킬은 공식의 마지막 변경을 적용하고 미확인 오라는 확정하지 않는다", () => {
  assert.match(gameMetaAnswer("바론 영역형 끌어당기기 피해", "ko_KR")!, /100%/);
  assert.match(gameMetaAnswer("바론 천리안형 균열 피해", "ko_KR")!, /140%/);
  assert.match(gameMetaAnswer("바론 오라 스킬", "ko_KR")!, /현재 적용 여부는 확정하지/);
  assert.match(gameMetaAnswer("바론 버프 공격력", "ko_KR")!, /20분 12.*30분 26.*40분 48/);
  assert.match(gameMetaAnswer("바론 버프 공격력", "ko_KR")!, /18~20분 수치는 아직 검수하지/);
});

test("상세 문서와 검색 ID에서도 같은 답을 제공한다", () => {
  const docs = gameMetaDocs("en_US");
  assert.ok(docs.some(doc => doc.id === "meta:monster-infernal" && /Dragon Breath|Basic attacks add/.test(doc.text)));
  assert.match(gameMetaById("meta:monster-infernal", "en_US", "Infernal Drake attack damage")!, /Attack damage: 70/);
  assert.match(docs.find(doc => doc.id === "meta:baron")!.text, /350\.5–515/);
});

test("서로 다른 이름 길이의 몬스터와 능력치·스킬을 함께 물어도 요청을 누락하지 않는다", () => {
  const text = gameMetaAnswer("바론 유충 공격력과 스킬", "ko_KR")!;
  assert.match(text, /350\.5–515/);
  assert.match(text, /21\.69/);
  assert.match(text, /100%/);
});

test("CI 후보 추출은 URF 레코드를 제외하며 승인 버전을 만들지 않는다", () => {
  const record = (hp: number) => ({ __type: "CharacterRecord", baseHPModifiable: { baseValue: hp } });
  const candidate = monsterCandidate(JSON.stringify({ "Characters/Test/CharacterRecords/URF": record(9999),
    "Characters/Test/CharacterRecords/Root": record(16300) }), { id: "cdragon:test", kind: "cdragon", hash: "fixture", url: "https://example.com/source" });
  assert.equal(candidate.fields.baseHPModifiable, 16300);
  assert.equal(candidate.reviewStatus, "candidate");
  assert.equal(candidate.version.verifiedThroughPatch, null);
  assert.throws(() => monsterCandidate("{}", candidate.source), /Expected one normal/);
});

test("아군 버프의 기준 레벨·시간과 몬스터의 기본 능력치를 구분한다", () => {
  assert.match(gameMetaAnswer("블루 버프 스킬 가속", "ko_KR")!, /1\/6\/11레벨.*10\/15\/20/);
  assert.match(gameMetaAnswer("블루 기력 회복", "ko_KR")!, /최대 기력 200이면 초당 7/);
  assert.match(gameMetaAnswer("레드 버프 고정 피해", "ko_KR")!, /18레벨 54.*20레벨이 되면 60/);
  assert.match(gameMetaAnswer("레드 버프 둔화", "ko_KR")!, /원천 충돌.*10\/15\/20%.*10\/15\/25%/);
  assert.match(gameMetaAnswer("화염 용 버프 공격력", "ko_KR")!, /중첩당 3%.*4중첩.*12%/);
  assert.match(gameMetaAnswer("화염 용 공격력", "ko_KR")!, /공격력: 70/);
});
