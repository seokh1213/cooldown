import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import test from "node:test";
import { loadStaticData, PUBLIC_DATA_ROOT } from "../../scripts/llm/lib/data";
import { fillGenerated, loadPlaybooks, type Playbook, type PlaybookEntry } from "../../scripts/llm/lib/playbook";
import { loadCuratedTips } from "../../scripts/llm/lib/knowledge";
import { validateKnowledge } from "../../scripts/llm/validate-knowledge";
import type { ChampionCard } from "../../src/lib/knowledge/facts";
import { deriveItemClaims } from "../../src/lib/knowledge/claims";

const data = loadStaticData("ko_KR");
const directory = path.join(PUBLIC_DATA_ROOT, data.patch, "llm");
const cards = (JSON.parse(fs.readFileSync(path.join(directory, "champion-cards-ko_KR.json"), "utf8")) as { cards: ChampionCard[] }).cards;
const card = cards.find((card) => card.id === "DrMundo")!;
const source: PlaybookEntry = {
  id: "generated-reference-check",
  category: "situational-item",
  text: "",
  generated: "situational-item",
  nuance: "정화 대신 점멸을 고릅니다.",
  refs: { summoners: ["점멸"] },
  avoid: { summoners: ["정화"] },
};

function validate(entry: PlaybookEntry, actualCards = cards) {
  const book: Playbook = { champion: card.id, playing: [], against: [entry] };
  return validateKnowledge(data, actualCards, new Map([[card.id, book]]), []).findings;
}

test("챔피언 대상 아이템 조언은 미니언만 끌어당기는 클레드 E를 군중 제어로 세지 않는다", () => {
  const kled = cards.find(card => card.id === "Kled")!;
  const jousting = kled.spells.find(spell => spell.slot === "E")!;
  assert.ok(jousting.effects.includes("강제 이동(넉백/끌기)"), "미니언 끌어당김 자체는 보존한다");
  assert.equal(jousting.crowdControl?.status, "known");
  assert.deepEqual(jousting.crowdControl?.effects.map(effect => effect.target), ["nonChampion"]);
  assert.deepEqual(deriveItemClaims(kled).cc, ["Q", "R"]);
});

test("검수한 클레드 탈출 노트가 있으면 일반 이동기 설명을 중복 생성하지 않는다", () => {
  const bundle = JSON.parse(fs.readFileSync(path.join(directory, "advisor-knowledge.json"), "utf8")) as { playbooks: Record<string, Playbook> };
  const escapes = bundle.playbooks.Kled.against.filter(entry => entry.category === "escape-window");
  assert.equal(escapes.length, 1, "검수한 수동 탈출 노트가 있으면 일반 도출문을 중복 생성하지 않는다");
  assert.match(escapes[0].text, /탑승한 상태에서만 E와 R/);
  assert.match(escapes[0].text, /미탑승|내린 상태/);
  assert.doesNotMatch(escapes[0].text, /여러 개를 겹쳐 빠져나가므로/);
});

test("current playbooks validate and generation preserves text while excluding authoring references", () => {
  const playbooks = loadPlaybooks();
  assert.deepEqual(validateKnowledge(data, cards, playbooks, loadCuratedTips()).findings, []);
  const bundle = JSON.parse(fs.readFileSync(path.join(directory, "advisor-knowledge.json"), "utf8")) as { playbooks: Record<string, Playbook> };
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  let reviewed = 0;
  for (const [champion, book] of playbooks) {
    for (const scope of ["playing", "against"] as const) {
      for (const entry of book[scope]) {
        if (!entry.generated) continue;
        const before = structuredClone(entry);
        const rendered = fillGenerated(entry, cardsById.get(champion));
        const stored = bundle.playbooks[champion]?.[scope].find((stored) => stored.id === entry.id);
        assert.ok(stored, `${champion}:${entry.id}: existing generated note missing`);
        assert.equal(rendered.text, stored.text, `${champion}:${entry.id}: generated body changed`);
        assert.deepEqual(rendered.refs, entry.refs);
        assert.deepEqual(rendered.avoid, entry.avoid);
        assert.equal("reviewRefs" in rendered, false);
        assert.deepEqual(entry, before);
        if (entry.reviewRefs) reviewed += 1;
      }
    }
  }
  assert.ok(reviewed > 0, "legacy review references must remain in authored playbooks");
});

test("generated refs and avoid are checked against final text without dropping missing or conflicting names", () => {
  assert.deepEqual(validate(source), []);
  const missing = validate({ ...source, refs: { summoners: ["강타"] } });
  assert.ok(missing.some((finding) => /refs 에 적었으나 본문에 없는/.test(finding.message)));
  const conflict = validate({ ...source, refs: { summoners: ["점멸", "정화"] } });
  assert.ok(conflict.some((finding) => /refs 와 avoid 에 동시에/.test(finding.message)));
  assert.deepEqual(fillGenerated(source, card).refs, source.refs);
  const absentCard = validate(source, cards.filter((candidate) => candidate.id !== card.id));
  assert.ok(absentCard.some((finding) => /사실 카드가 없음/.test(finding.message)));
});

test("authoring references preserve name and game-mode validation without requiring a runtime mention", () => {
  const reviewed = { ...source, reviewRefs: { items: ["처형인의 대검"] } };
  assert.deepEqual(validate(reviewed), []);
  assert.equal("reviewRefs" in fillGenerated(reviewed, card), false);
  const unknown = validate({ ...source, reviewRefs: { items: ["존재하지 않는 아이템"] } });
  assert.ok(unknown.some((finding) => /데이터에 없는 아이템/.test(finding.message)));
  const purchasable = new Set(data.items.items
    .filter((item) => item.availableOnMap11 && item.purchasable !== false && item.inStore !== false)
    .map((item) => item.name));
  const otherMode = data.items.items.find((item) => !purchasable.has(item.name));
  assert.ok(otherMode, "a current unavailable-item fixture is required");
  const unavailable = validate({ ...source, reviewRefs: { items: [otherMode.name] } });
  assert.ok(unavailable.some((finding) => /협곡에서 구매할 수 없는/.test(finding.message)));
});

test("manual recommendations, avoid names and source conditions retain strict validation", () => {
  const entry: PlaybookEntry = {
    id: "manual-reference-check", category: "summoner", text: "정화 대신 점멸을 고릅니다.",
    refs: { summoners: ["점멸"] }, avoid: { summoners: ["정화"] },
  };
  assert.deepEqual(validate(entry), []);
  assert.deepEqual(fillGenerated(entry, card), entry);
  const missing = validate({ ...entry, text: "점멸을 고릅니다." });
  assert.ok(missing.some((finding) => /avoid 에 적었으나 본문에 없는/.test(finding.message)));
  const unknown = validate({ ...entry, refs: { summoners: ["없는 주문"] } });
  assert.ok(unknown.some((finding) => /데이터에 없는 소환사 주문/.test(finding.message)));
  const invalidConditions = validate({ ...entry, when: { enemyIds: ["MissingChampion"], enemyHasEffects: ["MissingEffect"] } });
  assert.ok(invalidConditions.some((finding) => /없는 상대 id/.test(finding.message)));
  assert.ok(invalidConditions.some((finding) => /어떤 챔피언에게도 없는 효과 태그/.test(finding.message)));
  for (const [champion, name, message] of [
    ["Ahri", "처형인의 대검", /마법 피해 챔피언에게 공격력 아이템/],
    ["Ashe", "증폭의 고서", /물리 피해 챔피언에게 주문력 아이템/],
  ] as const) {
    const recommendation = { ...entry, text: `${name}을 구매합니다.`, refs: { items: [name] }, avoid: undefined };
    const book: Playbook = { champion, playing: [recommendation], against: [] };
    const findings = validateKnowledge(data, cards, new Map([[champion, book]]), []).findings;
    assert.ok(findings.some((finding) => message.test(finding.message)));
  }
});
