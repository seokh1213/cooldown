import assert from "node:assert/strict";
import { after, test } from "node:test";
import { answerDialogue } from "../../src/lib/advisor/dialogueFlow";
import { emptyDialogue } from "../../src/lib/advisor/dialogueState";
import { resolveQuestion } from "../../src/lib/advisor/resolvedQuestion";
import { resolveStatQuery } from "../../src/lib/advisor/dialogueStats";
import { queryFor } from "../../src/lib/advisor/statClassifierCore";
import { statClassifier } from "../../src/lib/advisor/statClassifier";
import { buildCompareAnswer } from "../../src/lib/advisor/answer";
import { knowledgeFactPlan } from "../../src/lib/advisor/knowledgeFactPlan";
import { evaluationDeps, localFetch, qualityContext, restoreReply } from "../../scripts/llm/quality/dialogue";
import { renderRules } from "../../src/lib/advisor/mechanics/render";
import { selectRules } from "../../src/lib/advisor/mechanics/retrieval";
import { emptyEffect, type Job, type Rule } from "../../scripts/llm/champion-mechanics/contract";
import { sourceNumbers } from "../../scripts/llm/champion-mechanics/numbers";
import { detectStats } from "../../src/lib/advisor/statQuery";
import { matchupSidesDetailed, matchupSidesByPhrase } from "../../src/lib/advisor/matchupSides";
import { detectSlot } from "../../src/lib/advisor/context";
import { askedRules } from "../../src/lib/advisor/questionDocs";
import { MECHANIC_TOPICS } from "../../src/lib/advisor/mechanics/types";
import { dehydrateTurn, reviveTurn } from "../../src/lib/advisor/history";

const restore = localFetch();
after(restore);

test("가격만 물으면 가격만 답하고 아이템 전체 질문에는 능력치도 답한다", async () => {
  const deps = evaluationDeps();
  const price = await answerDialogue("도란검 가격은?", qualityContext("ko_KR", "none"), deps);
  assert.equal(price.reply.text, "도란의 검 가격은 450 골드입니다.");
  const item = await answerDialogue("도란검 설명해줘", qualityContext("ko_KR", "none"), deps);
  assert.match(item.reply.text, /공격력/);
});

test("모든 승인 규칙 주제를 저장 후 복원할 수 있다", () => {
  for (const topic of MECHANIC_TOPICS) {
    const memory = { ...emptyDialogue("fixture"), mechanic: { abilityId: "Example.P", sourceHash: "s", ruleIndices: [0], topic } };
    const stored = dehydrateTurn({ id: 1, role: "assistant", content: "fixture", memory });
    assert.deepEqual(reviveTurn(stored, { patch: "fixture" })?.memory, memory);
  }
});

test("패시브 슬롯 문자와 일반 영어 단어를 구분한다", () => {
  assert.equal(detectSlot("가상의 챔피언 P 효과"), "P");
  assert.equal(detectSlot("what happens to people?"), undefined);
});

test("스킬 본문의 표식 이름과 명시한 소환사 주문 질문을 구분한다", () => {
  const data = qualityContext("ko_KR", "none").data!;
  assert.deepEqual(askedRules(data, "블리츠크랭크 R 표식은 언제 붙어?"), []);
  assert.ok(askedRules(data, "블리츠크랭크 R 말고 소환사 주문 표식 설명해줘").some(rule => rule.subject === "summoner"));
});

test("승인 스킬 설명에 부활의 발동 조건과 지속 오라의 자원 소모를 보존한다", async () => {
  for (const [question, expected] of [
    ["질리언 R은 걸면 바로 부활해?", /치명적인.*피해/s],
    ["카서스 E를 켜고 계속 있으면 어떻게 돼?", /초당.*마나.*소모/s],
    ["우디르 P 각성 쿨은 공격하면 언제 돌려받아?", /적중.*5%/s],
  ] as const) {
    const result = await answerDialogue(question, qualityContext("ko_KR", "none"), evaluationDeps());
    assert.match(result.reply.text, expected);
  }
});

test("사용 가능 조건이 있는 스킬의 쿨타임 후속 질문은 쿨 수치 대신 조건을 평가한다", async () => {
  const ctx = qualityContext("ko_KR", "none"), deps = evaluationDeps();
  const question = "블리츠크랭크 R은 언제 평타에 표식이 붙어?";
  const first = await answerDialogue(question, ctx, deps); restoreReply(ctx, question, first.reply);
  const next = await answerDialogue("그럼 R 쿨타임 중에는?", ctx, deps);
  assert.match(next.reply.text, /사용 가능 조건에 해당하지 않습니다/);
  assert.equal(next.reply.memory.mechanic?.abilityId, "Blitzcrank.R");
  assert.equal(next.reply.memory.mechanic?.spellReady, "down");
});

test("얼마나·궁금하다는 능력치 질문을 마나·궁극기 질문으로 차단하지 않는다", () => {
  const ctx = qualityContext("ko_KR", "none"), memory = emptyDialogue(ctx.data!.patch);
  assert.equal(resolveStatQuery(resolveQuestion("애쉬 기본 체력 재생은 얼마나 돼?", ctx.data!), memory, ctx)?.kind, "championStat");
  const query = resolveStatQuery(resolveQuestion("애쉬 방어력 수치가 궁금해", ctx.data!), memory, ctx);
  assert.equal(query?.kind === "championStat" && query.field, "armor");
  assert.equal(resolveStatQuery(resolveQuestion("애쉬 궁 마나 소모는?", ctx.data!), memory, ctx), undefined);
});

test("챔피언 이름에 포함된 랭크·몬스터 어휘가 기본 능력치 조회를 가로채지 않는다", () => {
  const ctx = qualityContext("ko_KR", "none"), memory = emptyDialogue(ctx.data!.patch);
  for (const id of ["Blitzcrank", "Kindred", "Kled"]) {
    const name = ctx.data!.cardById.get(id)!.name;
    const query = resolveStatQuery(resolveQuestion(`${name} 11레벨 마법 저항력은?`, ctx.data!), memory, ctx);
    assert.equal(query?.kind, "championStat");
    assert.deepEqual(query?.kind === "championStat" && query.champions, [id]);
    assert.equal(query?.kind === "championStat" && query.field, "magicResist");
  }
});

test("분류한 항목을 원문에 붙이지 않아 단일 대상 선택을 보존한다", () => {
  const ctx = qualityContext("ko_KR", "none");
  const memory = { ...emptyDialogue(ctx.data!.patch), active: "stat" as const,
    stat: { kind: "championStat" as const, champions: ["Ashe", "Jinx"], field: "health" as const, level: 18 as const } };
  assert.deepEqual(queryFor("애쉬만 보여줘", memory, ctx, "attackSpeed"), {
    kind: "championStat", champions: ["Ashe"], field: "attackSpeed", level: 18,
  });
  assert.equal(queryFor("방어구 관통력이 무슨 뜻이야?", memory, ctx, "armor"), null);
});

test("전체 능력치로 오분류해도 구체적인 조회와 레벨 이어 묻기가 우선한다", async () => {
  const ctx = qualityContext("ko_KR", "none");
  const deps = { ...evaluationDeps(), classifyRequest: async () => ({ scope: "statsAll" as const, confidence: .9 }) };
  const first = await answerDialogue("애쉬 6레벨 방어력", ctx, deps);
  assert.equal(first.reply.answer?.kind === "champion" && first.reply.answer.statQuery?.field, "armor");
  restoreReply(ctx, "애쉬 6레벨 방어력", first.reply);
  const next = await answerDialogue("18레벨이면?", ctx, deps);
  assert.equal(next.reply.answer?.kind === "champion" && next.reply.answer.statQuery?.level, 18);
});

test("상성 카드의 참고 능력치를 조회 결과나 능력치 대화로 저장하지 않는다", () => {
  const ctx = qualityContext("ko_KR", "none");
  const answer = buildCompareAnswer([ctx.data!.cardById.get("Ashe")!, ctx.data!.cardById.get("Jinx")!], "방어력 올려?", undefined, { matchup: true });
  assert.equal(answer.kind, "compare");
  if (answer.kind !== "compare") throw new Error("expected compare");
  assert.equal(answer.statQuery, undefined);
  assert.equal(answer.headline, undefined);
});

test("게임 운영의 풀어야 한다는 표현을 CC 해제 확인 질문으로 바꾸지 않는다", () => {
  const ctx = qualityContext("ko_KR", "none");
  const resolved = resolveQuestion("상대는 제이스고 저는 사이온입니다. 어디서부터 풀어야 할까요?", ctx.data!);
  assert.equal(knowledgeFactPlan(resolved, ctx), undefined);
  const actual = knowledgeFactPlan(resolveQuestion("나미 Q 수은으로 풀려?", ctx.data!), ctx);
  assert.ok(actual);
});

test("비율을 잘못 전제해도 게임 숫자를 코드에 고정하지 않고 승인 근거의 비율로 답한다", () => {
  const sources: Job["sources"] = [{ id: "en:body", tier: "tooltip", locale: "en_US", variant: null, text: "Convert 7 bonus Health to 2 Attack Damage." }];
  const job: Job = { id: "Example.P", champion: "Example", slot: "P", patch: "fixture", sourceHash: "s", promptHash: "p", slotRole: "ability",
    facts: {}, sources, numbers: sourceNumbers(sources), variants: [{ id: "base", label: "base", sourceIds: ["en:body"] }] };
  const rule: Rule = { variant: "base", trigger: { event: "stat_gain", subject: "caster" }, conditions: [], evidence: [{ sourceId: "en:body", quote: sources[0].text }],
    effects: [{ ...emptyEffect("stat_conversion", "추가 체력을 추가 공격력으로 전환합니다."), statFrom: "bonusHealth", statTo: "bonusAttackDamage", parameters: [
      { role: "ratio_input", shape: "scalar", stat: "bonusHealth", statSubject: "caster", numberRefs: ["en:body:n0"] },
      { role: "ratio_output", shape: "scalar", stat: "bonusAttackDamage", statSubject: "caster", numberRefs: ["en:body:n1"] }] }] };
  const text = renderRules(job, [rule], "추가 체력의 1600%가 공격력으로 변환돼?");
  assert.match(text, /7당.*2/);
  assert.doesNotMatch(text, /1600|수치를 하나로/);
});

test("적중 조건 선택에 기억한 횟수를 쓰고 문서의 횟수 기준을 따른다", () => {
  const sources: Job["sources"] = [{ id: "en:body", tier: "tooltip", locale: "en_US", variant: null, text: "After 5 hits, deal magic damage and gain a shield." }];
  const job: Job = { id: "Example.P", champion: "Example", slot: "P", patch: "fixture", sourceHash: "s", promptHash: "p", slotRole: "ability",
    facts: {}, sources, numbers: sourceNumbers(sources), variants: [{ id: "base", label: "base", sourceIds: ["en:body"] }] };
  const rule: Rule = { variant: "base", trigger: { event: "attack_or_ability_hit", subject: "target" },
    conditions: [{ subject: "target", field: "hit_count", operator: "eq", value: { kind: "number_ref", ref: "en:body:n0" } }],
    effects: [emptyEffect("damage", "마법 피해"), emptyEffect("shield", "보호막")], evidence: [{ sourceId: "en:body", quote: sources[0].text }] };
  const ability = { job, draft: { summary: "fixture", rules: [rule], gaps: [] } };
  assert.deepEqual(selectRules(ability, "그럼 챔피언이면?", undefined, { state: { hitCount: 5 } }), [rule]);
  const unmet = selectRules(ability, "그럼?", undefined, { state: { hitCount: 3 } });
  assert.deepEqual(unmet, [rule]);
  assert.match(renderRules(job, unmet, "그럼?", { hitCount: 3 }), /3회 적중.*5회 적중 조건에 해당하지/);
});

test("능력치 모델을 못 읽으면 다음 요청에서 다시 읽을 수 있다", async () => {
  let calls = 0;
  const infer = statClassifier(async () => { calls++; throw new Error("unavailable"); });
  const ctx = qualityContext("ko_KR", "none"), memory = emptyDialogue(ctx.data!.patch);
  const resolved = resolveQuestion("애쉬 낯선조회어", ctx.data!);
  await assert.rejects(infer(resolved, memory, ctx), /unavailable/);
  await assert.rejects(infer(resolved, memory, ctx), /unavailable/);
  assert.equal(calls, 2);
});

test("자모 교정은 새로운 오타도 읽고 띄어쓰기 경계의 짧은 약어는 붙여 만들지 않는다", () => {
  assert.deepEqual(detectStats("애쉬 방어럭은?"), ["armor"]);
  assert.deepEqual(detectStats("진 공격소도"), ["attackSpeed"]);
  assert.deepEqual(detectStats("최대 체려"), ["health"]);
  assert.deepEqual(detectStats("능력과 기본 능력치를 같이 소개해줘"), []);
  assert.deepEqual(detectStats("생명력 흡수는 어떻게 적용해?"), []);
});

test("능력치 어휘가 있어도 전환 여부와 공격 발사의 조건을 기본 수치로 바꾸지 않는다", async () => {
  const deps = evaluationDeps();
  const ctx = qualityContext("ko_KR", "none");
  const growth = await answerDialogue("파이크 성장 체력도 공격력으로 바뀌어?", ctx, deps);
  assert.match(growth.reply.text, /성장.*(?:포함되지|전환되지|않)/s);
  const first = await answerDialogue("아크샨 두 번째 공격 취소하면?", ctx, deps);
  restoreReply(ctx, "아크샨 두 번째 공격 취소하면?", first.reply);
  const fired = await answerDialogue("그럼 두 발 다 쏘면 이속도 얻어?", ctx, deps);
  assert.match(fired.reply.text, /취소 조건에 해당하지/);
  assert.equal(fired.reply.memory.active, "spell");
});

test("내 챔피언 문형은 먼저 나온 상대보다 우선하며 챔피언 이름에 종속되지 않는다", () => {
  const a = { name: "상대챔피언" }, b = { name: "내챔피언" };
  assert.deepEqual(matchupSidesDetailed("상대챔피언이 길을 막는데 내챔피언 하는 나는 어떻게 해?", [a, b]).sides, [b, a]);
  assert.equal(matchupSidesByPhrase("First time facing Enemy on Mine", ["Enemy", "Mine"], name => [name]), "Mine");
  assert.equal(matchupSidesByPhrase("对手一直突进，我这把英雄二该怎么办？", ["对手", "英雄二"], name => [name]), "英雄二");
});

test("여러 챔피언의 같은 슬롯 설명은 각각의 이름과 승인 근거로 답한다", async () => {
  const ctx = qualityContext("ko_KR", "none");
  const { reply } = await answerDialogue("파이크랑 아크샨 패시브 각각 설명해줘", ctx, evaluationDeps());
  assert.equal(reply.answer?.kind, "compare");
  assert.deepEqual(reply.answer?.kind === "compare" && reply.answer.cards.map(card => card.id), ["Pyke", "Akshan"]);
  assert.match(reply.text, /추가.*체력.*공격력/);
  assert.match(reply.text, /적중/);
});

test("기본 능력치 조회가 승인 패시브 설명으로 바뀌지 않고 새 대상에도 이어진다", async () => {
  const ctx = qualityContext("ko_KR", "none"), deps = evaluationDeps();
  const first = await answerDialogue("오공 18렙 체력 체젠 알려줘", ctx, deps);
  assert.equal(first.reply.memory.active, "stat");
  restoreReply(ctx, "오공 18렙 체력 체젠 알려줘", first.reply);
  const next = await answerDialogue("그럼 제드는?", ctx, deps);
  assert.deepEqual(next.reply.memory.stat?.champions, ["Zed"]);
  assert.equal(next.reply.memory.stat?.level, 18);
});

test("아이템 조회로 잠시 전환해도 승인 계산의 명시적인 후속 조건을 이어받는다", async () => {
  const ctx = qualityContext("ko_KR", "none"), deps = evaluationDeps();
  for (const question of ["파이크 추가 체력 70이면 공격력은?", "도란의 방패 가격은?"]) {
    const result = await answerDialogue(question, ctx, deps); restoreReply(ctx, question, result.reply);
  }
  const next = await answerDialogue("아까 파이크 패시브로 돌아가서 210이면?", ctx, deps);
  assert.match(next.reply.text, /210.*15/s);
});

test("역할이 없는 새 챔피언의 단독 공략을 이전 상성의 새 상대로 확정하지 않는다", async () => {
  const ctx = qualityContext("ko_KR", "none"), deps = evaluationDeps();
  const question = "아트록스로 하이머딩거 상대법 알려줘";
  const first = await answerDialogue(question, ctx, deps); restoreReply(ctx, question, first.reply);
  const next = await answerDialogue("유미 붙은 상대는 누구부터 노려야 돼? 떨어지는 순간을 기다리는 게 맞나", ctx, deps);
  assert.equal(next.dialogue.parts[0].plan.type, "card");
  assert.equal(next.reply.answer?.kind === "champion" && next.reply.answer.card.id, "Yuumi");
  assert.equal(next.reply.memory.matchup?.enemy, "Heimerdinger");
});
