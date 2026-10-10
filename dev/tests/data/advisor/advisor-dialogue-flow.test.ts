import assert from "node:assert/strict";
import { test } from "node:test";
import { loadData } from "../../../scripts/advisor/kev-agent/lib";
import { translations } from "../../../../src/shared/i18n/translations";
import { answerDialogue } from "../../../../src/features/advisor/conversation/dialogueFlow";
import { emptyDialogue, type DialogueMemory } from "../../../../src/features/advisor/conversation/memory/dialogueState";
import { dehydrateTurn, reviveTurn } from "../../../../src/features/advisor/storage/history";
import type { PlanContext, PlanDeps } from "../../../../src/features/advisor/contracts/planTypes";
import { findGameMeta } from "../../../../src/features/advisor/retrieval/gameMeta";

const data = loadData("ko_KR");
const deps: PlanDeps = { judge: async () => { throw new Error("이 사실 조회에는 판정이 필요 없다"); }, search: async () => [] };
function context(memory?: DialogueMemory): PlanContext {
  return {
    data, lang: "ko_KR", copy: translations.ko_KR.advisor,
    turns: memory ? [{ role: "assistant", memory }] : [],
    championIds: [], consented: false, canUseModel: false, retrieval: false, judge: "none",
  };
}

test("앱 진입점은 명시적인 두 질문의 본문을 함께 답한다", async () => {
  const { reply } = await answerDialogue("애니 Q 쿨타임 알려주고, 점멸 쿨타임도 알려줘", context(), deps);
  assert.match(reply.text, /애니 Q/);
  assert.match(reply.text, /300초/);
  assert.equal(reply.respond, undefined);
});

test("답변과 함께 저장한 기억을 복원해 수치 정정에 사용한다", async () => {
  const first = await answerDialogue("럭스 궁 2랭크에 가속 75면 몇 초야?", context(), deps);
  assert.match(first.reply.text, /28\.57초/);
  const stored = dehydrateTurn({ id: 1, role: "assistant", content: first.reply.text, answer: first.reply.answer, memory: first.reply.memory, byCode: true });
  const restored = reviveTurn(JSON.parse(JSON.stringify(stored)), data)!;
  const { reply } = await answerDialogue("아니 100으로 정정할게", { ...context(), turns: [restored] }, deps);
  assert.match(reply.text, /럭스 R.*2랭크.*가속 100.*25초/);
  assert.equal(first.reply.memory.numeric?.haste, 75);
});

test("앱 진입점은 불명확한 대상을 확인하고 다음 답의 관점을 반영한다", async () => {
  const memory = { ...emptyDialogue(data.patch), active: "matchup" as const, matchup: { mine: "Jax", enemy: "Fiora" } };
  const first = await answerDialogue("W 쿨은?", context(memory), deps);
  assert.match(first.reply.text, /잭스.*피오라/);
  const next = await answerDialogue("내 W 말한 거야", context(first.reply.memory), deps);
  assert.match(next.reply.text, /잭스 W.*재사용 대기시간/);
  assert.equal(next.reply.memory.matchup?.enemy, "Fiora");
});

test("확인 질문이 필요한 뒤쪽 요청도 앞에서 찾은 답변을 지우지 않는다", async () => {
  const { reply } = await answerDialogue("점멸 쿨타임 알려주고, 그 스킬 쿨도 알려줘", context(), deps);
  assert.match(reply.text, /300초/);
  assert.match(reply.text, /어느 챔피언의 어떤 스킬/);
});

test("자료 준비 전에도 같은 진입점에서 기존 응답 계획을 반환한다", async () => {
  const { reply } = await answerDialogue("잭스 E 설명해줘", { ...context(), data: null }, deps);
  assert.equal(reply.respond?.plan.withoutConsent, translations.ko_KR.advisor.noModel);
  assert.equal(reply.answer, undefined);
  assert.equal(reply.memory.patch, "");
});

test("쿨타임 계산 뒤 사거리로 바꿔도 가속을 사거리에 적용하지 않는다", async () => {
  const first = await answerDialogue("제드 궁 1랭크에 가속 50이면 몇 초야?", context(), deps);
  const range = await answerDialogue("그럼 사거리는?", context(first.reply.memory), deps);
  assert.match(range.reply.text, /625/);
  assert.equal(range.reply.memory.spell?.focus, "range");
  const cooldown = await answerDialogue("같은 조건으로 쿨타임은?", context(range.reply.memory), deps);
  assert.match(cooldown.reply.text, /80초/);
});

test("쿨타임 계산 뒤 마나 소모 질문은 소모값으로 답한다", async () => {
  const first = await answerDialogue("아리 Q에 가속 50이면 몇 초야?", context(), deps);
  const next = await answerDialogue("그럼 Q 마나 소모는?", context(first.reply.memory), deps);
  assert.equal(next.reply.answer?.kind, "spell");
  assert.equal(next.reply.memory.spell?.focus, "cost");
  assert.match(next.reply.text, /55\/65\/75\/85\/95/);
  assert.doesNotMatch(next.reply.text, /4\.67초/);
});

test("사거리 비교와 다음 슬롯 조회는 사거리 의도를 유지한다", async () => {
  const first = await answerDialogue("제드랑 아리 궁 사거리 비교해줘", context(), deps);
  assert.match(first.reply.text, /제드 625.*아리 450/);
  const stored = dehydrateTurn({ id: 1, role: "assistant", content: first.reply.text, answer: first.reply.answer, memory: first.reply.memory });
  const restored = reviveTurn(JSON.parse(JSON.stringify(stored)), data)!;
  const next = await answerDialogue("둘의 Q는?", { ...context(), turns: [restored] }, deps);
  assert.equal(next.reply.memory.spell?.focus, "range");
  assert.match(next.reply.text, /제드 900.*아리 970/);
});

test("앱의 기억 계층에서도 룬 쿨타임을 첫 답으로 보여준다", async () => {
  for (const [question, value] of [["감전 쿨타임", "20초"], ["어둠의 수확 쿨타임", "35초"]]) {
    const { reply } = await answerDialogue(question, context(), deps);
    assert.match(reply.text, new RegExp(value));
  }
});

test("최근 스킬 조회 뒤 룬 두 개를 물으면 공통 규칙 계획이 두 쿨타임을 답한다", async () => {
  const first = await answerDialogue("아리 Q 쿨타임", context(), deps);
  const { reply } = await answerDialogue("감전과 어둠의 수확 쿨타임", context(first.reply.memory), deps);
  assert.match(reply.text, /감전.*20초/s);
  assert.match(reply.text, /어둠의 수확.*35초/s);
});

test("스킬을 피하거나 빼는 질문은 상대 관점 노트로 답한다", async () => {
  for (const question of ["피오라 W 어떻게 빼?", "제드 궁 어떻게 피해?", "how to dodge Zed R?"]) {
    const { reply } = await answerDialogue(question, context(), deps);
    if (reply.answer?.kind !== "champion") assert.fail("상대법 노트여야 한다");
    assert.equal(reply.answer.notes?.perspective, "against");
    assert.doesNotMatch(reply.text, /플레이할 때|아트록스/);
  }
});

test("피오라 W 대처법은 상대가 누구인지 추측하지 않고 방법까지 설명한다", async () => {
  const { reply } = await answerDialogue("피오라 W 어떻게 빼?", context(), deps);
  assert.match(reply.text, /옆무빙.*판정을 흘/);
  assert.doesNotMatch(reply.text, /아트록스/);
  const stored = dehydrateTurn({ id: 1, role: "assistant", content: reply.text, answer: reply.answer, memory: reply.memory });
  assert.equal(reviveTurn(JSON.parse(JSON.stringify(stored)), data)?.answer?.kind, "champion");
});

test("상성 뒤 제목 없는 규칙 요약을 조회해도 저장 복원한 지칭은 그 규칙을 따른다", async () => {
  const memory = { ...emptyDialogue(data.patch), active: "matchup" as const, matchup: { mine: "Rumble", enemy: "MonkeyKing", focus: "general" } };
  const first = await answerDialogue("물리 관통력이랑 방어구 관통력 차이가 뭐야?", context(memory), deps);
  assert.equal(first.reply.memory.active, "rule");
  assert.equal(first.reply.memory.rule?.id, "meta:lethality");
  assert.doesNotMatch(first.reply.text, /^###/);
  const stored = dehydrateTurn({ id: 1, role: "assistant", content: first.reply.text, memory: first.reply.memory });
  const restored = reviveTurn(JSON.parse(JSON.stringify(stored)), data)!;
  const next = await answerDialogue("그거 평타에도 적용돼?", { ...context(), turns: [restored] }, deps);
  assert.match(next.reply.text, /물리 피해인 기본 공격에는 적용/);
  assert.doesNotMatch(next.reply.text, /럼블|오공|한타/);
  assert.equal(next.reply.memory.matchup?.mine, "Rumble");
});

test("벡터 검색으로 선택한 규칙 요약도 본문 제목 없이 주제를 기억한다", async () => {
  const rule = findGameMeta("물리 관통력")!;
  const modelContext = { ...context(), consented: true, canUseModel: true, retrieval: true };
  const vectorDeps = { ...deps, search: async () => [{ id: `meta:${rule.id}`, score: 1 }] };
  const first = await answerDialogue("물리 관통력이랑 방어구 관통력 차이가 뭐야?", modelContext, vectorDeps);
  assert.doesNotMatch(first.reply.text, /^###/);
  assert.equal(first.reply.memory.active, "rule");
  const next = await answerDialogue("그거 평타에도 적용돼?", context(first.reply.memory), deps);
  assert.match(next.reply.text, /물리 피해인 기본 공격에는 적용/);
});
