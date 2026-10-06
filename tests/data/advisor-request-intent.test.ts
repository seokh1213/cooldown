import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";
import { loadData, offlineFileJudge } from "../../scripts/llm/kev-agent/lib";
import { requestClassifier } from "../../src/lib/advisor/requestIntent";
import { answerDialogue } from "../../src/lib/advisor/dialogueFlow";
import { dehydrateTurn, reviveTurn } from "../../src/lib/advisor/history";
import { statFields } from "../../src/lib/advisor/statQuery";
import { translations } from "../../src/i18n/translations";
import type { Language } from "../../src/i18n";
import type { PlanContext, PlanTurn } from "../../src/lib/advisor/planTypes";

const classifyRequest = requestClassifier(async file => {
  const buffer = await fs.readFile(`public/${file}`);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
});
const deps = { judge: offlineFileJudge(), classifyRequest, search: async () => [] };
function context(lang: Language = "ko_KR", turns: PlanTurn[] = []): PlanContext {
  return { data: loadData(lang), lang, copy: translations[lang].advisor, turns,
    championIds: [], consented: false, canUseModel: false, retrieval: false, judge: "offline" };
}

test("소개 → 전체 스탯 → 소개 정정을 저장 복원해 답한다", async () => {
  const ctx = context();
  for (const [question, expected] of [
    ["오공 설명해줘", "overview"],
    ["아니 스킬말고 스탯들. 체력이나이런정보들", "statsAll"],
    ["아니 체력말고 전부다알려줘야지. 오공이라는 챔피언에 대해서", "overview"],
  ]) {
    const { reply } = await answerDialogue(question, ctx, deps);
    assert.doesNotMatch(reply.text, /조회할 대상이나 항목이 남지|어느 쪽을 물으신/);
    assert.match(reply.text, /610/);
    assert.match(reply.text, /방어력/);
    assert.match(reply.text, /이동 속도/);
    if (expected === "overview") {
      assert.equal(reply.answer?.kind === "champion" && reply.answer.view, "overview");
      assert.match(reply.text, /기본 능력치.*1레벨/);
      assert.match(reply.text, /Q 파쇄격/);
    } else {
      assert.equal(reply.answer?.kind, "compare");
      assert.equal(reply.answer?.kind === "compare" && reply.answer.statQuery && statFields(reply.answer.statQuery).length, 7);
      assert.doesNotMatch(reply.text, /Q 파쇄격/);
    }
    const stored = dehydrateTurn({ id: ctx.turns.length, role: "assistant", content: reply.text, answer: reply.answer, memory: reply.memory, byCode: true });
    ctx.turns = [...ctx.turns, { role: "user", content: question }, reviveTurn(JSON.parse(JSON.stringify(stored)), ctx.data!)!];
  }
});

test("세 언어에서 소개와 명시적인 스킬 요청은 다른 카드가 된다", async () => {
  for (const [lang, intro, skills] of [
    ["ko_KR", "자헨 소개해줘", "자헨 스킬 설명해줘"],
    ["en_US", "Tell me about Wukong", "Explain Wukong abilities"],
    ["zh_CN", "介绍一下孙悟空", "孙悟空技能介绍"],
  ] as const) {
    const ctx = context(lang);
    const overview = await answerDialogue(intro, ctx, deps);
    assert.equal(overview.reply.answer?.kind === "champion" && overview.reply.answer.view, "overview", intro);
    const kit = await answerDialogue(skills, ctx, deps);
    assert.equal(kit.reply.answer?.kind === "champion" && kit.reply.answer.view, "skills", skills);
    assert.equal(kit.reply.answer?.kind === "champion" && kit.reply.answer.notes, undefined);
    assert.doesNotMatch(kit.reply.text, /Base stats|기본 능력치|基础属性/);
  }
});

test("전체 소개 뒤 스킬을 바꿔 물어도 지정한 슬롯에 답하고 기억을 갱신한다", async () => {
  for (const [lang, questions] of [
    ["ko_KR", [
      ["오공 Q 스킬정보 알려줘", "Q"],
      ["오공 패시브 스킬정보 알려줘", "P"], ["오공 궁 스킬정보 알려줘", "R"],
    ]],
    ["en_US", [["Wukong Q skill information please", "Q"], ["Wukong R skill information please", "R"]]],
    ["zh_CN", [["孙悟空Q技能信息说下", "Q"], ["孙悟空R技能信息说下", "R"]]],
  ] as const) {
    const ctx = context(lang);
    ctx.turns = [{ role: "assistant", answer: { kind: "champion", card: ctx.data!.cardById.get("MonkeyKing")!, view: "overview" } }];
    for (const [question, slot] of questions) {
      const { reply } = await answerDialogue(question, ctx, deps);
      assert.equal(reply.answer?.kind === "spell" && reply.answer.spell.slot, slot, question);
      assert.equal(reply.memory.spell?.slot, slot, question);
      ctx.turns = [...ctx.turns, { role: "user", content: question }, { role: "assistant", answer: reply.answer, memory: reply.memory }];
    }
  }
});

test("콤보·상대법은 학습된 요청 의도를 뒤의 조회 규칙이 덮어쓰지 않는다", async () => {
  const ctx = context();
  const combo = await answerDialogue("오공 콤보 알려주라", ctx, deps);
  assert.equal(combo.reply.answer?.kind === "champion" && combo.reply.answer.notes?.topic, "combo");
  const counterplay = await answerDialogue("피오라 W 쓰게 만드는 방법", ctx, deps);
  assert.equal(counterplay.reply.answer?.kind === "champion" && counterplay.reply.answer.notes?.perspective, "against");
  assert.doesNotMatch(counterplay.reply.text, /재사용 대기시간/);
});

test("전체 스탯 요청도 미지원 레벨을 1레벨로 대신하지 않는다", async () => {
  const { reply } = await answerDialogue("오공 2레벨 스탯 전체", context(), deps);
  assert.match(reply.text, /2레벨 능력치는 현재 자료에 없습니다/);
  assert.doesNotMatch(reply.text, /610/);
});
