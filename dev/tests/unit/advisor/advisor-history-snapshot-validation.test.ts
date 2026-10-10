import assert from "node:assert/strict";
import { globSync,readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { ChampionCard } from "../../../../src/domain/knowledge/cards/contracts";
import { isHistorySource,isSnapshotAnswer } from "../../../../src/features/advisor/storage/historySnapshot";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const fixtures = globSync("public/data/*/llm/champion-cards-*.json", { cwd: root })
  .map(path => ({ path, ...JSON.parse(readFileSync(new URL(path, `file://${root}`), "utf8")) as { cards: ChampionCard[] } }));
const example = fixtures[0].cards[0];
const second = fixtures[0].cards[1];
const fact = { label: "재사용 대기시간", value: "10초" };
const comparison = { kind: "compare", cards: [example, second], rows: [{ label: "체력", values: ["665", "640"], winner: 0 }] };
const spellAnswer = {
  kind: "spell", championId: example.id, championName: example.name,
  card: example, spell: example.spells[0], facts: [fact], highlighted: ["원래 스킬 설명"],
};
const ruleAnswer = {
  kind: "rule", rule: {
    name: "정복자", page: "Conqueror", subject: "rune", notes: ["Original rule"],
    notesKo: ["원래 규칙"], notesZh: ["原规则"], nameEn: "Conqueror", nameZh: "征服者",
  }, highlighted: ["원래 규칙"], rest: [],
};

function changed(value: unknown, path: string, replacement: unknown): unknown {
  const copy = structuredClone(value) as Record<string, unknown>;
  const keys = path.split(".");
  let parent = copy;
  for (const key of keys.slice(0, -1)) parent = parent[key] as Record<string, unknown>;
  parent[keys[keys.length - 1]] = replacement;
  return copy;
}

test("기록 출처는 숫자 버전과 지원하는 세 언어만 받는다", () => {
  for (const locale of ["ko_KR", "en_US", "zh_CN"]) {
    assert.equal(isHistorySource({ patch: "26.19", ddragonVersion: "16.19.1", locale }), true);
  }
  const source = { patch: "26.19", ddragonVersion: "16.19.1", locale: "ko_KR" };
  for (const value of [null, [], {}, ...["patch", "ddragonVersion"].flatMap(field =>
    [null, [], 26.19, "latest", "../26.19", "16.19/1", "26", "26.19\n"].map(entry => ({ ...source, [field]: entry }))),
    { ...source, locale: null }, { ...source, locale: "fr_FR" }]) {
    assert.equal(isHistorySource(value), false, JSON.stringify(value));
  }
});

test("배포된 세 언어의 모든 카드와 모든 스킬을 변경 없이 인정한다", () => {
  assert.ok(fixtures.length >= 3);
  for (const locale of ["ko_KR", "en_US", "zh_CN"]) assert.ok(fixtures.some(entry => entry.path.endsWith(`${locale}.json`)));
  for (const fixture of fixtures) {
    assert.ok(fixture.cards.length > 0);
    for (const card of fixture.cards) {
      assert.equal(isSnapshotAnswer({ kind: "champion", card }), true, `${fixture.path}: ${card.id}`);
      for (const spell of card.spells) {
        assert.equal(isSnapshotAnswer({ kind: "spell", card, spell, championId: card.id, championName: card.name, facts: [], highlighted: [] }),
          true, `${fixture.path}: ${card.id}:${spell.slot}`);
      }
    }
  }
});

test("일곱 답 종류의 원본 내용과 선택 메타데이터를 검사하되 바꾸지 않는다", () => {
  const { forms: _forms, ...baseSpell } = example.spells[0];
  const form = { ...baseSpell, key: "B", id: "HistoricalForm", label: "당시 형태", text: "당시 형태의 원문" };
  const answers = [
    { kind: "champion", card: example, view: "skills", focus: "cooldown", headline: fact,
      statQuery: { kind: "championStat", champions: [example.id], field: "health", fields: ["health", "armor"], level: 18 },
      notes: { playing: ["노트"], against: [], detail: "full", topic: "combo", perspective: "playing", sources: ["wiki"], unavailable: ["Q"] } },
    { ...spellAnswer, focus: "effect", headline: fact },
    { ...spellAnswer, card: undefined },
    { ...spellAnswer, spell: { ...baseSpell, forms: [form] } },
    { ...comparison, matchup: true, inMatchup: false, more: true, precomputed: "당시 답", headlines: [fact],
      notes: { mine: ["당시 내 노트"], enemy: [], derived: 1, plan: { question: "원 질문", focus: "general",
        claims: [{ kind: "pinned", text: "확인된 사실" }], mine: [{ category: "offense", text: "노트" }], enemy: [] } } },
    { kind: "suggestion", original: "아트록쓰", candidates: [example], reason: "typo" },
    ruleAnswer,
    { kind: "item", itemId: "1", itemName: "당시 아이템", price: 0, askedPrice: false, stats: [fact],
      effects: [{ name: "당시 효과", active: true, text: "당시 내용" }], verdicts: [{ tag: "둔화", yes: true, evidence: "원문" }] },
    { kind: "text", text: "당시 답변" },
  ];
  for (const answer of answers) {
    const original = structuredClone(answer);
    assert.equal(isSnapshotAnswer(answer), true, answer.kind);
    assert.deepEqual(answer, original);
  }
  for (const forms of [null, [], [null], [form, form], [{ ...form, key: "C" }], [{ ...form, label: 1 }],
    [{ ...form, id: null }], [{ ...form, slot: form.slot === "P" ? "Q" : "P" }],
    [{ ...form, cooldownRank1: Infinity }], [{ ...form, forms: [form] }]]) {
    assert.equal(isSnapshotAnswer({ ...spellAnswer, spell: { ...baseSpell, forms } }), false);
  }
});

test("카드의 필수 구조와 중첩 선택 필드의 깨진 값은 거절한다", () => {
  const full = { kind: "champion", card: { ...example,
    riot: { tagPrimary: "전사", tagSecondary: "탱커", damageType: "물리", attackType: "근접",
      playstyle: { damage: 1, durability: 2, crowdControl: 3, mobility: 4, utility: 5 } },
    wiki: { heroType: "Fighter", altType: "Tank", subclass: "Juggernaut", subclasses: ["Juggernaut"], positions: ["Top"] },
  } };
  assert.equal(isSnapshotAnswer(full), true);
  const invalid: Array<[string, unknown]> = [
    ["card", null], ["card", []], ["card.id", 1], ["card.name", null], ["card.title", null], ["card.resource", []],
    ["card.roleTags", [1]], ["card.rangeType", "melee"], ["card.attackRange", Infinity],
    ["card.stats", null], ["card.stats.armor", []], ["card.stats.health", undefined],
    ["card.stats.armor.gradeLv1", "average"], ["card.stats.armor.gradeLv18", null], ["card.stats.armor.perLevel", NaN],
    ["card.damageProfile", []], ["card.damageProfile.primary", "고정"], ["card.scalingProfile", null],
    ["card.scalingProfile.primary", "magic"], ["card.mechanics", [null]], ["card.spells", [null]],
    ["card.riot", null], ["card.riot", []], ["card.riot.tagPrimary", 1], ["card.riot.tagSecondary", null],
    ["card.riot.damageType", "magic"], ["card.riot.attackType", "melee"], ["card.riot.playstyle", null],
    ["card.wiki", []], ["card.wiki.heroType", null], ["card.wiki.altType", 1], ["card.wiki.subclass", []],
    ["card.wiki.subclasses", [null]], ["card.wiki.positions", undefined],
    ...["lv1", "lv6", "lv11", "lv18", "percentileLv1", "percentileLv18"].map(key => [`card.stats.armor.${key}`, NaN] as [string, unknown]),
    ...["physical", "magical", "trueDamage"].map(key => [`card.damageProfile.${key}`, Infinity] as [string, unknown]),
    ...["apSpells", "adSpells", "healthSpells"].map(key => [`card.scalingProfile.${key}`, "1"] as [string, unknown]),
    ...["damage", "durability", "crowdControl", "mobility", "utility"].map(key => [`card.riot.playstyle.${key}`, undefined] as [string, unknown]),
  ];
  for (const [path, replacement] of invalid) assert.equal(isSnapshotAnswer(changed(full, path, replacement)), false, path);
  assert.equal(isSnapshotAnswer({ ...full, card: { ...full.card, spells: new Array(1) } }), false);
});

test("스킬의 계수·사거리·군중 제어·원 챔피언 연결을 검사한다", () => {
  const full = { ...spellAnswer, spell: { ...spellAnswer.spell, range: [600, 750], cooldownRank1: 10, maxCharges: 2,
    crowdControl: { status: "inferred", effects: [{ type: "root", target: "enemy", source: "원문", condition: "세 번째 공격" }] } } };
  assert.equal(isSnapshotAnswer(full), true);
  for (const status of ["known", "borrowed", "inferred"]) {
    assert.equal(isSnapshotAnswer(changed(full, "spell.crowdControl", { status, effects: [] })), true);
  }
  const invalid: Array<[string, unknown]> = [
    ["championId", "Other"], ["championName", null], ["card", null], ["spell", []], ["spell.slot", "A"],
    ["spell.name", null], ["spell.text", []], ["spell.ratios", null], ["spell.ratios", { AP: Infinity }],
    ["spell.ratios", { AD: "50" }], ["spell.range", [600, null]], ["spell.range", NaN],
    ["spell.cooldownRank1", "10"], ["spell.maxCharges", Infinity], ["spell.damageTypes", ["magic"]],
    ["spell.effects", [1]], ["spell.crowdControl", null], ["spell.crowdControl.status", "unknown"],
    ["spell.crowdControl.effects", [null]], ["spell.crowdControl.effects.0.type", "unknown"],
    ["spell.crowdControl.effects.0.type", "toString"], ["spell.crowdControl.effects.0.type", "__proto__"],
    ["spell.crowdControl.effects.0.target", "champion"], ["spell.crowdControl.effects.0.source", undefined],
    ["spell.crowdControl.effects.0.condition", null],
    ...["summary", "cooldown", "recharge", "cost"].map(key => [`spell.${key}`, null] as [string, unknown]),
  ];
  for (const [path, replacement] of invalid) assert.equal(isSnapshotAnswer(changed(full, path, replacement)), false, path);
});

test("규칙 원문과 번역 필드 및 다른 답 종류의 선택 필드를 검사한다", () => {
  for (const [path, replacement] of [
    ["rule", null], ["rule.page", 1], ["rule.name", []], ["rule.subject", "item"],
    ["rule.notes", [null]], ["rule.notesKo", null], ["rule.notesZh", [1]], ["rule.nameEn", null], ["rule.nameZh", 1],
  ] as Array<[string, unknown]>) assert.equal(isSnapshotAnswer(changed(ruleAnswer, path, replacement)), false, path);
  for (const value of [
    null, [], { kind: "other" }, { ...comparison, cards: [] }, { ...comparison, cards: [null] },
    { ...comparison, inMatchup: "true" }, { ...comparison, more: null }, { ...comparison, precomputed: [] },
    { kind: "suggestion", original: "이름", candidates: [null] },
    { kind: "item", itemId: "1", itemName: "이름", stats: [], effects: [], verdicts: [], askedPrice: 1 },
    { kind: "text", text: null },
  ]) assert.equal(isSnapshotAnswer(value), false);
});

test("스냅샷에서도 기존 사실·표·노트 메타데이터 검증을 통과해야 한다", () => {
  for (const value of [
    { ...spellAnswer, facts: [null] }, { ...spellAnswer, headline: { label: "쿨", value: 10 } },
    { ...spellAnswer, highlighted: [1] }, { ...spellAnswer, focus: "unknown" },
    { kind: "champion", card: example, notes: { playing: [], against: null } },
    { kind: "champion", card: example, statQuery: { kind: "championStat", champions: [], field: "health", level: 1 } },
    { ...comparison, rows: [{ label: "체력", values: ["665"] }] },
    { ...comparison, rows: [{ label: "체력", values: ["665", "640"], winner: 2 }] },
    { ...comparison, cards: [example], rows: [], matchup: true },
    { ...comparison, notes: { mine: [1], enemy: [] } },
    { ...ruleAnswer, rest: null },
  ]) assert.equal(isSnapshotAnswer(value), false);
});
