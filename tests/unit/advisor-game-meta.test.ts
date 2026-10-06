/**
 * 게임 규칙·메타 답 시험 — 세 언어 낱말로 사실을 찾고, 챔피언 가격을 답한다(`gameMeta.ts`)
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { championPriceAnswer, findGameMeta, gameMetaAnswer, gameMetaById } from "../../src/lib/advisor/gameMeta";
import { answerDialogue } from "../../src/lib/advisor/dialogueFlow";
import { evaluationDeps, qualityContext } from "../../scripts/llm/quality/dialogue";
import { detectChampionMentions } from "../../src/lib/advisor/intent";

for (const [q, id] of [
  ["what minute can we ff?", "surrender"],
  ["队友开局一直没连进来，重开的条件是什么？", "remake"],
  ["첫 드래곤 언제 나와", "dragon"],
  ["장로 드래곤 언제 나와?", "elder"], ["바론 몇 분에 나와", "baron"],
  ["공허 유충 몇 분에 나와?", "voidgrubs"], ["협곡의 전령 몇 분에 나와?", "herald"], ["아타칸 언제 나와?", "atakhan"],
  ["厄塔汗现在还在游戏里吗？", "atakhan"],
  ["포탑 방패 몇 분에 없어져?", "plating"],
  ["억제기 몇 분에 다시 살아나?", "inhibitor"], ["미니언 웨이브 몇 초마다 와?", "minion-waves"],
  ["킬 골드 얼마야?", "kill-gold"],
  ["랭겜 닷지하면 LP 얼마나 까여?", "dodge"],
  ["듀오 티어 제한이 어떻게 되나요?", "duo"],
  ["cs가 뭐야?", "cs"], ["바위게 몇 분에 나와?", "scuttle"], ["블루 버프 리젠 몇 분이야?", "buffs"],
  ["lethality vs armor pen whats the difference", "lethality"], ["팀원 채팅 음소거 어떻게 해?", "mute"],
  ["죽으면 몇 초 뒤에 부활해?", "death-timer"],
] as const) {
  test(`사실: ${q}`, () => {
    assert.deepEqual(findGameMeta(q)?.id, id, `사실: ${q}`);
  });
}

// 게임 규칙이 아닌 말에는 걸리지 않는다("ff" 가 "effect" 에, "dc" 가 낱말 속에 걸리지 않게)
for (const q of ["What does Conqueror's effect do?", "가렌으로 다리우스 라인전 어떻게 해?"]) {
  test(`사실 없음: ${q}`, () => {
    assert.deepEqual(findGameMeta(q), undefined, `사실 없음: ${q}`);
  });
}

test("챔피언 가격 답", () => {
  const ahri = championPriceAnswer("아리 가격 얼마야?", { id: "Ahri", name: "아리" }, "ko_KR") ?? "";
  assert.match(ahri, /^아리의 상점 가격은 블루 정수 [\d,]+ 또는 [\d,]+ RP입니다\./);
  assert.match(championPriceAnswer("how much is Mel?", { id: "Mel", name: "Mel" }, "en_US") ?? "", /Mel costs 3,150 Blue Essence or 975 RP/);
  assert.deepEqual(championPriceAnswer("아리 콤보 알려줘", { id: "Ahri", name: "아리" }, "ko_KR"), undefined, "가격을 묻지 않으면 답하지 않는다");
});

test("중국어 몬스터 전체 이름 안의 별명은 제외하고 별도 챔피언 언급은 보존한다", () => {
  const ctx = qualityContext("zh_CN", "offline");
  assert.deepEqual(detectChampionMentions(ctx.data!, "纳什男爵的攻击力").map(m => m.card.id), []);
  assert.deepEqual(detectChampionMentions(ctx.data!, "男爵的技能").map(m => m.card.id), ["Renata"]);
  const question = "纳什男爵附近的烈娜塔怎么打团？";
  const mentions = detectChampionMentions(ctx.data!, question);
  assert.deepEqual(mentions.map(m => m.card.id), ["Renata"]);
  assert.equal(mentions[0].index, question.indexOf("烈娜塔"));
});

test("게임 메타 답", () => {
  assert.match(gameMetaAnswer("챔피언 가격 얼마야?", "ko_KR") ?? "", /225 · 675 · 1,575 · 2,400 · 3,150/);
  assert.match(gameMetaAnswer("几分钟能投降啊", "zh_CN") ?? "", /15 分钟起可以发起投降/);
});

for (const [lang, question, expected] of [
  ["ko_KR", "바론 공격력 얼마야?", /350\.5–515/],
  ["en_US", "Baron attack damage?", /350\.5–515/],
  ["zh_CN", "大龙的攻击力是多少？", /350\.5–515/],
] as const) test(`${lang} 상세 질문에는 검수한 레벨별 수치로 답한다`, () => {
  assert.match(gameMetaAnswer(question, lang)!, expected);
  assert.match(gameMetaById("meta:baron", lang, question)!, expected);
});

test("생성 시간은 계속 답하고 제거된 오브젝트는 상세 질문에도 제거 상태가 우선이다", () => {
  assert.match(gameMetaAnswer("바론 몇 분에 나와?", "ko_KR")!, /20분/);
  assert.match(gameMetaAnswer("유충 스킬 알려줘", "ko_KR")!, /12초마다.*4마리/);
  assert.match(gameMetaAnswer("아타칸 공격력 얼마야?", "ko_KR")!, /현재.*제거.*26\.1 패치/);
});

for (const [lang, question] of [
  ["ko_KR", "바론 공격력은 현재 얼마야?"],
  ["en_US", "What is Baron Nashor attack damage?"],
  ["zh_CN", "纳什男爵的攻击力是多少？"],
] as const) test(`${lang} 분류기가 소개로 오인해도 현재 챔피언으로 몬스터 질문을 대체하지 않는다`, async () => {
  const ctx = qualityContext(lang, "offline");
  ctx.championIds = ["MonkeyKing"];
  for (const scope of ["overview", "statsAll", "skills"] as const) {
    const deps = { ...evaluationDeps(undefined, lang), classifyRequest: async () => ({ scope, confidence: 1 }) };
    const output = await answerDialogue(question, ctx, deps);
    assert.match(output.reply.text, /350\.5–515/);
    assert.equal(output.dialogue.parts[0]?.plan.type, "code");
  }
});
