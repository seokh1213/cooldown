import assert from "node:assert/strict";
import { globSync, readFileSync } from "node:fs";
import test from "node:test";
import type { AdvisorAnswer } from "../../../src/features/advisor/answers/answer";
import type { AdvisorTurn } from "../../../src/features/advisor/session/useAdvisorTurns";
import type { ChampionCard } from "../../../src/domain/knowledge/facts";
import { dehydrateAnswer, dehydrateTurn, reviveAnswer, reviveTurn, reviveTurns, writeConversations } from "../../../src/features/advisor/storage/history";
import { reviveChampionDetails } from "../../../src/features/advisor/answers/championDetail";
import type { HistorySource } from "../../../src/features/advisor/storage/historySnapshot";

const cardPath = globSync("public/data/*/llm/champion-cards-ko_KR.json")[0];
const cards = (JSON.parse(readFileSync(cardPath, "utf8")) as { cards: ChampionCard[] }).cards;
const garen = cards.find(card => card.id === "Garen")!;
const ahri = cards.find(card => card.id === "Ahri")!;
const source: HistorySource = { patch: "26.18", ddragonVersion: "16.18.1", locale: "ko_KR" };
const current = { patch: "26.19" };

test("현재 자료를 참조하지 않고 당시 카드 수치·스킬·답문·패치를 함께 복원한다", () => {
  const old = structuredClone(garen);
  old.stats.armor.lv1 = 38;
  old.spells[0].text = "당시 스킬 원문";
  const { forms: _forms, ...oldSpell } = old.spells[0];
  old.spells[0].forms = [{ ...oldSpell, key: "B", id: "HistoricalForm", label: "당시 형태", cooldown: "12", text: "당시 형태의 원문" }];
  const turn: AdvisorTurn = { id: 2, role: "assistant", content: "당시 답문 38", source,
    answer: { kind: "champion", card: old }, byCode: true };
  const stored = dehydrateTurn(turn);
  old.stats.armor.lv1 = 40;
  old.spells[0].forms[0].cooldown = "7";
  const revived = reviveTurn(JSON.parse(JSON.stringify(stored)), current);
  assert.equal(revived?.content, "당시 답문 38");
  assert.deepEqual(revived?.source, source);
  assert.ok(revived?.answer?.kind === "champion");
  assert.equal(revived.answer.card.stats.armor.lv1, 38);
  assert.equal(revived.answer.card.spells[0].text, "당시 스킬 원문");
  assert.equal(revived.answer.card.spells[0].forms?.[0].cooldown, "12");
  revived.answer.card.stats.armor.lv1 = 42;
  assert.equal(stored.answer?.snapshot?.kind === "champion" && stored.answer.snapshot.card.stats.armor.lv1, 38);
});

test("스킬·규칙·비교·후보·아이템·전문 원본은 새 데이터 없이 복원한다", () => {
  const answers: AdvisorAnswer[] = [
    { kind: "spell", championId: garen.id, championName: garen.name, spell: garen.spells[0], card: garen, facts: [], highlighted: [] },
    { kind: "rule", rule: { name: "당시 규칙", page: "old", subject: "gameplay", notes: ["당시 원문"] }, highlighted: [], rest: ["당시 원문"] },
    { kind: "compare", cards: [garen, ahri], rows: [{ label: "방어력", values: ["38", "21"] }], precomputed: "당시 비교" },
    { kind: "suggestion", original: "가랜", candidates: [garen] },
    { kind: "item", itemId: "1", itemName: "당시 이름", price: 100, askedPrice: true, stats: [], effects: [], verdicts: [] },
    { kind: "text", text: "당시 전문" },
  ];
  for (const answer of answers) assert.deepEqual(reviveAnswer(JSON.parse(JSON.stringify(dehydrateAnswer(answer)))), answer);
});

test("당시 원본이 없는 옛 기록은 대화를 보존하고 재저장 때 과거 기억과 ID를 잃지 않는다", () => {
  const stored = { id: 2, role: "assistant", content: "당시 답변", byCode: true,
    answer: { kind: "champion", cardId: "RemovedChampion" },
    memory: { patch: "26.18", active: "champion", champion: "RemovedChampion" } };
  const turns = reviveTurns([{ id: 1, role: "user", content: "당시 질문" }, stored], current);
  assert.equal(turns.length, 2);
  assert.equal(turns[1].answer, undefined);
  assert.equal(turns[1].referenceUnavailable, true);
  assert.equal(turns[1].memory, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(dehydrateTurn(turns[1]))), stored);
  turns[1].rating = "up";
  assert.deepEqual(JSON.parse(JSON.stringify(dehydrateTurn(turns[1]))), { ...stored, rating: "up" });
});

test("깨진 원본이나 다른 카드 ID가 섞인 원본은 최신 자료로 덮지 않고 답문을 남긴다", () => {
  const answer = dehydrateAnswer({ kind: "champion", card: garen });
  for (const snapshot of [null, { kind: "champion", card: { ...garen, stats: null } }, { kind: "champion", card: ahri }]) {
    const revived = reviveTurn({ id: 1, role: "assistant", content: "보존할 답문", answer: { ...answer, snapshot } }, current);
    assert.equal(revived?.content, "보존할 답문");
    assert.equal(revived?.referenceUnavailable, true);
    assert.equal(revived?.answer, undefined);
  }
});

test("여러 답 중 카드 하나를 못 복원해도 다른 당시 카드와 답문은 남긴다", () => {
  const answer = dehydrateAnswer({ kind: "champion", card: garen });
  const turn = reviveTurn({ id: 1, role: "assistant", content: "두 답문", source,
    answers: [answer, { kind: "champion", cardId: "NoSuchChampion" }] }, current);
  assert.equal(turn?.answers?.length, 1);
  assert.equal(turn?.referenceUnavailable, true);
  assert.equal(turn?.content, "두 답문");
});

test("정규화 상세 원본은 패치·언어·챔피언·자료 버전이 모두 일치할 때만 복원한다", () => {
  const detailPath = globSync("public/data/*/champions/ko_KR/Garen.json")[0];
  const detail = JSON.parse(readFileSync(detailPath, "utf8"));
  const identity: HistorySource = { patch: detail.patchVersion, locale: detail.locale, ddragonVersion: detail.sources.ddragon };
  const restored = reviveChampionDetails({ Garen: detail }, identity);
  assert.deepEqual(restored.Garen.champion.baseStats.mana, detail.champion.baseStats.mana);
  for (const patch of [{ patch: "0.0" }, { locale: "en_US" as const }, { ddragonVersion: "0.0.0" }]) {
    assert.deepEqual(reviveChampionDetails({ Garen: detail }, { ...identity, ...patch }), {});
  }
  assert.deepEqual(reviveChampionDetails({ Ahri: detail, Garen: { ...detail, champion: null } }, identity), {});
  assert.deepEqual(reviveChampionDetails(null, identity), {});
});

test("저장 공간 오류를 호출자에게 알리고 기존 저장 기록은 바꾸지 않는다", () => {
  let previous = "기존 대화";
  const storage = { getItem: () => previous, setItem: (_key: string, value: string) => { if (value !== "") throw new Error("quota"); previous = value; } };
  assert.equal(writeConversations([], storage), false);
  assert.equal(previous, "기존 대화");
  assert.equal(writeConversations([], { getItem: () => previous, setItem: (_key, value) => { previous = value; } }), true);
  assert.equal(previous, "[]");
});
