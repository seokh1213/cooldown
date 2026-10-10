import assert from "node:assert/strict";
import test from "node:test";
import { tickText, type SpellTicks } from "../../../src/domain/knowledge/abilityTicks";
import { isSpellTicks } from "../../../src/domain/knowledge/abilityTicksValidation";
import { isSnapshotAnswer } from "../../../src/features/advisor/storage/historySnapshot";
import { wikiFields } from "../../scripts/advisor/ability-ticks/wikiFields";
import { attachAbilityTicks, tooltipHash, type TickFile } from "../../scripts/advisor/ability-ticks/attach";
import type { ChampionCard } from "../../../src/domain/knowledge/facts";
import { loadData } from "../../scripts/advisor/kev-agent/lib";
import { detectSpellFocus } from "../../../src/features/advisor/understanding/spellFocus";
import { splitDialogueQuestions } from "../../../src/features/advisor/conversation/dialogueRequest";

const localized = { ko_KR: "지속 피해", en_US: "Periodic damage", zh_CN: "持续伤害" };
const ticks: SpellTicks = { status: "known", sources: ["https://wiki.leagueoflegends.com/en-us/Corki"],
  effects: [{ label: localized, intervalSeconds: 0.25, durationSeconds: 4, count: 16, countMode: "continuous" }] };

test("챔피언·아이템 이름 속 음절은 틱 조회가 아니며 붙여 쓴 틱 질문은 인식한다", () => {
  for (const q of ["피들스틱 공포 중 이속 둔화는 어떻게 돼?", "스태틱 가격은?"]) assert.notEqual(detectSpellFocus(q)?.focus, "ticks", q);
  for (const q of ["코르키 E틱은?", "피들스틱 W 몇틱?", "E 지속틱", "16틱은 몇초마다?"]) assert.equal(detectSpellFocus(q)?.focus, "ticks", q);
  const unavailable = "내 E와 R이 재사용 대기 중인데 어떻게 해?";
  assert.deepEqual(splitDialogueQuestions(unavailable, loadData("ko_KR")), [unavailable]);
});

test("틱 정보 저장은 옛 기록과 호환되며 깨진 수치·언어·출처를 거절한다", () => {
  const card = structuredClone(loadData("ko_KR").cardById.get("Corki")!);
  const spell = card.spells.find(spell => spell.slot === "E")!;
  const answer = { kind: "spell", championId: card.id, championName: card.name, spell, facts: [], highlighted: [], focus: "ticks" };
  assert.equal(isSnapshotAnswer(answer), true);
  const old = structuredClone(answer);
  delete old.spell.ticks;
  assert.equal(isSnapshotAnswer(old), true);
  for (const invalid of [null, {}, { ...ticks, status: "guessed" }, { ...ticks, effects: [] }, { ...ticks, sources: ["javascript:alert(1)"] },
    { ...ticks, effects: [{ label: { ko_KR: "피해" }, intervalSeconds: 1 }] },
    ...[0, -1, Infinity, NaN, [], [[1]]].map(intervalSeconds => ({ ...ticks, effects: [{ label: localized, intervalSeconds }] })),
    { ...ticks, effects: [{ label: localized, count: 1.5 }] }, { ...ticks, status: "unknown" },
    { ...ticks, effects: [{ label: localized, intervalSeconds: 1, forms: ["C"] }] }]) {
    assert.equal(isSpellTicks(invalid), false, JSON.stringify(invalid));
    assert.equal(isSnapshotAnswer({ ...answer, spell: { ...spell, ticks: invalid } }), false);
  }
});

test("버전·본문이 달라진 틱 정보는 재검증 전까지 내보내지 않는다", () => {
  const original = loadData("ko_KR").cardById.get("Corki")!;
  const entry: TickFile = { schemaVersion: 1, patch: "26.20", checkedAt: "2026-10-09T00:00:00Z",
    abilities: { "Corki:E": { ...ticks, tooltipHash: tooltipHash(original.spells.find(s => s.slot === "E")!.text) } } };
  for (const scenario of ["current", "patch", "tooltip", "malformed"] as const) {
    const card = structuredClone(original);
    if (scenario === "tooltip") card.spells.find(s => s.slot === "E")!.text += " 수치 변경";
    const file = structuredClone(entry);
    if (scenario === "malformed") file.abilities["Corki:E"].effects[0].intervalSeconds = -1;
    attachAbilityTicks([card], scenario === "patch" ? "26.21" : "26.20", [card], file);
    const result = card.spells.find(s => s.slot === "E")!.ticks!;
    assert.equal(result.status, scenario === "current" ? "known" : "unknown");
    if (scenario !== "current") assert.deepEqual(result.effects, []);
  }
});

test("위키 hover 안의 틱 간격과 변수를 보존하며 지속시간에서 횟수를 추정하지 않는다", () => {
  const fields = wikiFields("{{#vardefine:rate|0.25}}\n|description = Damage {{ft|over 4 seconds|every {{#var:rate}} seconds}}.\n|notes = {{tt|19 ticks|sometimes 18}}\n}}");
  assert.match(fields[0].text, /over 4 seconds.*every 0.25 seconds/);
  assert.match(fields[1].text, /19 ticks.*sometimes 18/);
  const equivalent = { ...ticks, effects: [{ ...ticks.effects[0], count: 5, countMode: "duration_equivalent" as const }] };
  assert.match(tickText(equivalent), /5틱분/);
  assert.doesNotMatch(tickText({ ...ticks, effects: [{ label: localized, intervalSeconds: 0.25, durationSeconds: 4 }] }), /16틱/);
});

test("변신 전후의 틱은 해당 형태에만 연결된다", () => {
  const card: ChampionCard = structuredClone(loadData("ko_KR").cardById.get("Jayce")!);
  const spell = card.spells.find(s => s.slot === "W")!;
  attachAbilityTicks([card], loadData("ko_KR").patch);
  assert.equal(spell.forms?.find(form => form.key === "A")?.ticks?.status, "known");
  assert.equal(spell.forms?.find(form => form.key === "B")?.ticks?.status, "not_documented");
});
