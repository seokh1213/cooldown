import assert from "node:assert/strict";
import { test } from "node:test";
import { loadData } from "../../scripts/llm/kev-agent/lib";
import { translations } from "../../src/i18n/translations";
import { answerDialogue } from "../../src/lib/advisor/dialogueFlow";
import { emptyDialogue, type DialogueMemory } from "../../src/lib/advisor/dialogueState";
import { dehydrateTurn, reviveTurn } from "../../src/lib/advisor/history";
import type { PlanContext, PlanDeps } from "../../src/lib/advisor/planTypes";

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
