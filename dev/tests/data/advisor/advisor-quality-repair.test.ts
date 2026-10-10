import assert from "node:assert/strict";
import { test } from "node:test";
import { answerDialogue } from "../../../../src/features/advisor/conversation/dialogueFlow";
import { penetrationCalculation } from "../../../../src/features/advisor/conversation/planning/dialogueRules";
import { evaluationDeps, localFetch, qualityContext, restoreReply } from "../../../scripts/advisor/quality/dialogue";

const reset = localFetch();
process.on("exit", reset);
const deps = evaluationDeps();
function conversation() {
  const ctx = qualityContext("ko_KR", "none");
  return { ctx, async ask(question: string) {
    const output = await answerDialogue(question, ctx, deps);
    restoreReply(ctx, question, output.reply);
    return output;
  } };
}

test("관통의 숫자 계산이 일반 중첩 문서보다 우선한다", async () => {
  const { reply } = await conversation().ask("방어력이 100인 상대에게 30% 관통이랑 고정 관통 10이 있으면 어떤 순서로 계산해?");
  assert.match(reply.text, /비율 관통.*고정 관통[\s\S]*= 60/);
  assert.doesNotMatch(reply.text, /= 51%/);
});

test("관통은 0을 허용하고 음수·감소·여러 비율을 임의 계산하지 않는다", () => {
  const ctx = qualityContext("ko_KR", "none");
  const zero = penetrationCalculation("방어력 0에 0% 관통과 고정 관통 10", ctx);
  assert.equal(zero?.type, "code");
  if (zero?.type === "code") assert.match(String(zero.answer), /= 0/);
  for (const question of ["방어력 -100에 30% 관통과 고정 관통 10", "방어력 100에 101% 관통과 고정 관통 10",
    "방어력 100에 30% 관통과 20% 관통과 고정 관통 10", "방어력 100에 30% 관통, 방어력 감소와 고정 관통 10"])
    assert.equal(penetrationCalculation(question, ctx), undefined, question);
});

test("마나 반환 질문에 스킬로 폭발시켜야 하는 조건과 60을 함께 답한다", async () => {
  const { reply } = await conversation().ask("이즈리얼 W 마나는 언제 돌려받아?");
  assert.match(reply.text, /스킬로.*폭발.*마나.*60/);
});

test("구체가 붙는 대상과 이어지는 반환 조건을 구분한다", async () => {
  const chat = conversation();
  assert.match((await chat.ask("이즈리얼 W 구체는 어떤 대상에 붙어?")).reply.text, /챔피언.*구조물.*에픽/);
  assert.match((await chat.ask("그럼 스킬로 구체를 폭발시키면?")).reply.text, /마나.*60/);
});

test("표시용 슬롯에 사용 가능한 공격 스킬 효과를 만들어 붙이지 않는다", async () => {
  const { reply } = await conversation().ask("아펠리오스 E는 쓰면 무슨 스킬이 나가?");
  assert.match(reply.text, /(?:표시|인터페이스|정보)/);
  assert.match(reply.text, /(?:시전|사용|발동).*스킬.*(?:아니|않)/);
  assert.doesNotMatch(reply.text, /둔화|속박|쿨 0/);
});

test("두 형태를 명시하면 한 형태의 쿨타임만 반환하지 않는다", async () => {
  const { reply } = await conversation().ask("제이스 망치 Q랑 캐논 Q 쿨타임 알려줘");
  assert.match(reply.text, /(?:해머|망치).*16\/14\/12\/10\/8\/6/);
  assert.match(reply.text, /캐논.*8초/);
});

test("기본 능력치를 언급한 특정 항목 질문을 전체 표로 확장하지 않는다", async () => {
  const { reply } = await conversation().ask("럭스 1레벨 기본 스탯 체럭은 얼마야?");
  assert.ok(reply.answer && "statQuery" in reply.answer);
  assert.equal(reply.answer.statQuery?.field, "health");
  assert.equal(reply.answer.statQuery?.fields?.length ?? 1, 1);
});

test("이전 능력치 설명을 끝내고 요청한 스킬 구성으로 전환한다", async () => {
  const chat = conversation();
  await chat.ask("오공 체력뿐 아니라 기본 능력치를 싹 보여줘");
  await chat.ask("오공 R 스킬정보 알려줘");
  const { reply } = await chat.ask("기본 능력치는 알았으니 오공 스킬 구성 전체를 듣고 싶어");
  assert.equal(reply.answer?.kind, "champion");
  if (reply.answer?.kind === "champion") assert.equal(reply.answer.view, "skills");
});

test("실제 요청 분류기로 새 챔피언의 콤보와 라인전 팁을 함께 물으면 이전 상대를 붙이지 않는다", async () => {
  const chat = conversation();
  await chat.ask("오공 콤보 알려줘");
  await chat.ask("궁 없는데 콤보 있어?");
  await chat.ask("점멸도 없는데?");
  await chat.ask("궁 돌아왔어");
  await chat.ask("궁 쿨타임 몇 초야?");
  const { reply } = await chat.ask("빅토르 콤보는? 라인전 팁은?");
  assert.match(reply.text, /빅토르 콤보는 상황별로/);
  assert.match(reply.text, /미니언과 상대를 함께/);
  assert.doesNotMatch(reply.text, /오공으로 빅토르 상대/);
});
