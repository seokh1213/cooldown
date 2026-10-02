import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { CROWD_CONTROL, controlText } from "../../src/lib/knowledge/crowdControl";
import type { ChampionCard } from "../../src/lib/knowledge/facts";
import { attachCrowdControl } from "../../scripts/llm/lib/crowdControl";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "../../scripts/llm/lib/data";
import { loadMechanicsNotes } from "../../scripts/llm/lib/mechanicsNotes";
import { lexicalSearch } from "../../src/lib/advisor/searchFallback";

const patch = resolvePatchVersion();
const cards = (lang: string): ChampionCard[] => JSON.parse(fs.readFileSync(path.join(PUBLIC_DATA_ROOT, patch, "llm", `champion-cards-${lang}.json`), "utf8")).cards;
const korean = cards("ko_KR");
const get = (key: string) => { const [id, slot] = key.split(":"); return korean.find(c => c.id === id)!.spells.find(s => s.slot === slot)!.crowdControl!; };

test("세 언어의 모든 실재 스킬에 같은 CC 메타데이터가 있고 출처가 남아 있다", () => {
  const canonical = new Map(korean.flatMap(card => card.spells.map(s => [`${card.id}:${s.slot}`, s.crowdControl])));
  const input = JSON.parse(fs.readFileSync("knowledge/crowd-control.json", "utf8"));
  assert.deepEqual(Object.keys(input.abilities).sort(), [...canonical.keys()].sort());
  for (const lang of ["ko_KR", "en_US", "zh_CN"]) for (const card of cards(lang)) for (const spell of card.spells) {
    assert.ok(spell.crowdControl, `${card.id}:${spell.slot}`);
    assert.deepEqual(spell.crowdControl, canonical.get(`${card.id}:${spell.slot}`));
    for (const effect of spell.crowdControl.effects) {
      assert.ok(CROWD_CONTROL[effect.type]);
      assert.ok(effect.source);
      assert.ok(["enemy", "self", "ally", "all", "nonChampion"].includes(effect.target));
    }
  }
});
test("하드 CC 중 강타를 막는 종류는 제압과 정지뿐이다", () => {
  assert.deepEqual(Object.entries(CROWD_CONTROL).filter(([, c]) => c.blocksSmite).map(([type]) => type), ["suppression", "stasis"]);
  assert.equal(CROWD_CONTROL.stun.blocksSmite, false);
  assert.equal(CROWD_CONTROL.root.blocksSmite, false);
  assert.equal(CROWD_CONTROL.charm.blocksSmite, false);
});
test("변이·수면·광란과 기절처럼 보이는 나미 Q를 서로 구분한다", () => {
  assert.deepEqual(get("Nami:Q").effects.map(e => e.type), ["suspension"]);
  assert.deepEqual(get("Zoe:E").effects.map(e => e.type), ["drowsy", "sleep"]);
  assert.ok(get("Lulu:W").effects.some(e => e.type === "polymorph"));
  assert.deepEqual(get("Renata:R").effects.map(e => e.type), ["berserk"]);
});
test("자기 둔화·자기 침묵·미니언 밀치기를 적 챔피언 CC로 표시하지 않는다", () => {
  assert.ok(get("Varus:Q").effects.every(e => e.target === "self"));
  assert.ok(get("Rumble:P").effects.every(e => e.target === "self"));
  assert.ok(get("Graves:P").effects.every(e => e.target === "nonChampion"));
  assert.equal(get("Aurora:Q").effects.length, 0);
  assert.ok(get("Camille:E").effects.every(e => e.type !== "pull"));
});
test("행동 가능한 끌림과 강제 이동에 동반되는 기절을 구분한다", () => {
  assert.deepEqual(get("Camille:E").effects.map(e => e.type).sort(), ["knockback", "stun"]);
  assert.ok(get("Rell:R").effects.some(e => e.type === "kinematics"));
  assert.ok(get("Velkoz:E").effects.some(e => e.type === "stun"));
  assert.ok(get("Velkoz:E").effects.some(e => e.type === "knockup"));
  assert.ok(get("Velkoz:E").effects.every(e => e.type !== "suspension"));
  assert.deepEqual(get("Kassadin:Q").effects.map(e => e.type), ["disrupt"]);
});
test("조건부 CC와 복사/반사에 따라 달라지는 효과는 CC 없음과 구분한다", () => {
  assert.ok(get("Annie:Q").effects[0].condition?.includes("4중첩"));
  assert.ok(get("Kayn:W").effects.find(e => e.type === "knockup")?.condition?.includes("다르킨"));
  for (const key of ["Sylas:R", "Viego:P", "Mel:W"]) assert.equal(get(key).status, "borrowed");
  assert.doesNotMatch(controlText(get("Sylas:R"), "ko_KR"), /CC 없음/);
});
test("패치나 툴팁이 달라지면 검증된 판정으로 표시하지 않는다", () => {
  const changed = structuredClone(korean);
  changed[0].spells[0].text = "아예 다른 효과를 가진 새 스킬입니다.";
  attachCrowdControl(changed, patch);
  assert.equal(changed[0].spells[0].crowdControl?.status, "inferred");
  attachCrowdControl(changed, "future");
  assert.ok(changed.every(c => c.spells.every(s => s.crowdControl?.status === "inferred")));
});
test("추가 판정 노트는 출처·검토일·세 언어와 구체적인 질문 조건을 가진다", () => {
  const notes = loadMechanicsNotes();
  assert.ok(notes.length >= 20);
  for (const note of notes) {
    assert.ok(note.sources?.every(source => source.startsWith("https://") && !/WR|Wild_Rift/.test(source)));
    assert.ok(note.reviewedAt);
    assert.ok(note.localized?.en_US?.text);
    assert.ok(note.localized?.zh_CN?.text);
  }
});
test("판정 노트의 공통 낱말만 맞는 질문은 다른 주제 검색을 가로채지 않는다", () => {
  const docs = loadMechanicsNotes().map(note => ({ ...note, kind: "mechanics" as const }));
  assert.equal(lexicalSearch(docs, "부쉬에서 시야를 확보하는 방법").length, 0);
  assert.ok(lexicalSearch(docs, "실명과 시야 축소의 차이").some(hit => hit.doc.id === "nearsight-blind"));
});
