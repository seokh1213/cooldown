import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { loadData, offlineFileJudge } from "../../scripts/llm/kev-agent/lib";
import { auditAbilityTicks } from "../../scripts/llm/ability-ticks/audit";
import { answerDialogue } from "../../src/lib/advisor/dialogueFlow";
import { dehydrateTurn, reviveTurn } from "../../src/lib/advisor/history";
import { translations } from "../../src/i18n/translations";
import type { Language } from "../../src/i18n";
import type { PlanContext } from "../../src/lib/advisor/planTypes";

function conversation(lang: Language = "ko_KR", model = false) {
  const data = loadData(lang);
  const ctx: PlanContext = { data, lang, copy: translations[lang].advisor, turns: [], championIds: [], judge: "offline",
    consented: model, canUseModel: model, retrieval: false };
  let generated = false;
  const deps = { judge: offlineFileJudge(), search: async () => [], generateNumeric: async () => { generated = true; return "NOT_FOUND"; } };
  return { ctx, async ask(question: string) {
    const result = await answerDialogue(question, ctx, deps);
    assert.equal(generated, false, "Tick numbers must come from reviewed fields, including with a model enabled");
    const index = ctx.turns.length;
    const turns = [{ id: index, role: "user" as const, content: question }, { id: index + 1, role: "assistant" as const,
      content: result.reply.text, answer: result.reply.answer, answers: result.reply.answers, memory: result.reply.memory }];
    ctx.turns = [...ctx.turns, ...turns.map(turn => reviveTurn(JSON.parse(JSON.stringify(dehydrateTurn(turn))), data)!)];
    assert.ok(ctx.turns.every(Boolean), "tick answers must survive history restoration");
    return result.reply;
  } };
}

test("모든 챔피언·스킬과 세 언어 배포 카드의 틱 정보가 검수본과 일치한다", () => {
  const locales = (["ko_KR", "en_US", "zh_CN"] as const).map(lang => loadData(lang).cards);
  const file = JSON.parse(readFileSync("knowledge/ability-ticks.json", "utf8"));
  assert.deepEqual(auditAbilityTicks(file, loadData("ko_KR").patch, locales), []);
  assert.equal(Object.keys(file.abilities).length, locales[0].reduce((n, card) => n + card.spells.length, 0));
});

test("검수한 반복 효과를 모든 스킬 슬롯에서 실제 대화 진입점으로 조회할 수 있다", async () => {
  for (const card of loadData("ko_KR").cards) for (const spell of card.spells) {
    if (!spell.ticks || spell.ticks.status === "not_documented") continue;
    const forms = spell.forms?.filter(form => form.ticks?.status !== "not_documented") ?? [spell];
    for (const form of forms) {
      const question = `${card.name} ${"label" in form ? form.label : ""} ${spell.slot} 틱은?`;
      const reply = await conversation().ask(question);
      assert.equal(reply.answer?.kind, "spell", `${question}: ${reply.text}`);
      if (reply.answer?.kind !== "spell") continue;
      assert.equal(reply.answer.championId, card.id, question);
      assert.equal(reply.answer.spell.slot, spell.slot, question);
      assert.equal(reply.answer.focus, "ticks", question);
      assert.equal(reply.answer.spell.ticks?.status, form.ticks?.status, question);
      assert.ok(reply.text.includes(form.ticks!.status === "known" ? form.ticks!.effects[0].label.ko_KR : form.ticks!.note!.ko_KR), question);
    }
  }
});

test("쉼표·접속사로 나열한 스킬은 공통 조회 항목을 공유한다", async () => {
  for (const list of ["W, E", "W와 E", "W / E"]) {
    const reply = await conversation().ask(`코르키 ${list} 틱 간격은?`);
    assert.match(reply.text, /W 발키리[\s\S]*0\.5초[\s\S]*E 개틀링 건[\s\S]*0\.25초/);
    assert.equal(reply.answers?.length, 2);
  }
});

for (const model of [false, true]) test(`코르키 W·E 질문과 생략 후속 질문, 저장 복원: 모델 사용 ${model}`, async () => {
  const c = conversation("ko_KR", model);
  const both = await c.ask("코르키 w, e 지속 틱은 어떻게되는거지?");
  assert.match(both.text, /W 발키리[\s\S]*0\.5초 간격[\s\S]*5틱분[\s\S]*1초간[\s\S]*E 개틀링 건[\s\S]*0\.25초 간격[\s\S]*16틱/);
  assert.doesNotMatch(both.text, /재사용 대기시간|둔화율/);
  assert.equal(both.answers?.length, 2);
  const next = await c.ask("그럼 E는 몇 틱?");
  assert.match(next.text, /코르키 E[\s\S]*16틱[\s\S]*총피해 ÷ 16/);
  assert.doesNotMatch(next.text, /어느 챔피언|발키리/);
  const abbreviated = await c.ask("W는?");
  assert.match(abbreviated.text, /코르키 W[\s\S]*0\.5초 간격/);
});

for (const [question, expected] of [
  ["카시오페아 W 틱 간격은?", /0\.2632초 간격[\s\S]*19틱[\s\S]*18틱/],
  ["가렌 E 틱 수는?", /7 \+[\s\S]*25[\s\S]*3초 ÷ 회전 수/],
  ["워윅 R 틱당 피해는?", /6틱[\s\S]*홀수 틱[\s\S]*2\/9[\s\S]*1\/9/],
  ["피들스틱 W 틱은?", /8틱[\s\S]*마지막 틱[\s\S]*잃은 체력/],
  ["말자하 R 지속 틱은?", /제압 대상 피해[\s\S]*0\.25초[\s\S]*바닥 지대 피해[\s\S]*0\.5초/],
  ["제이스 해머 W 틱은?", /해머 W[\s\S]*1초 간격/],
  ["제이스 캐논 W 틱은?", /명시되어 있지 않습니다/],
  ["브랜드 패시브 틱당 피해는?", /확인되지 않았[\s\S]*서로 맞지 않아/],
  ["블라디미르 E 틱은?", /자신의 체력 소모[\s\S]*한 번만/],
  ["아리 Q 틱은?", /명시되어 있지 않습니다/],
  ["멜 E 틱은?", /0\.125초 간격[\s\S]*이탈 후 0\.25초/],
  ["클레드 R 틱은?", /보호막 증가[\s\S]*0\.25초[\s\S]*이동 속도 증가/],
] as const) test(question, async () => assert.match((await conversation().ask(question)).text, expected));

for (const [lang, question, expected] of [
  ["en_US", "Corki E damage ticks?", /0\.25s interval[\s\S]*16ticks[\s\S]*total E damage ÷ 16/],
  ["zh_CN", "库奇 E 每跳伤害？", /0\.25秒间隔[\s\S]*16跳[\s\S]*总伤害 ÷ 16/],
] as const) test(`${lang}: ${question}`, async () => assert.match((await conversation(lang).ask(question)).text, expected));

for (const [lang, question, expected] of [
  ["ko_KR", "점화 틱 간격은?", /약 1초 간격으로 총 5틱/],
  ["en_US", "Ignite tick interval?", /five ticks, about one second apart/],
  ["zh_CN", "引燃每跳间隔是多少？", /约每秒.*5跳/],
] as const) for (const model of [false, true]) test(`${lang}: 점화 틱은 근사 간격과 횟수만 전달한다, 모델 ${model}`, async () => {
  const reply = await conversation(lang, model).ask(question);
  assert.match(reply.text, expected);
  assert.doesNotMatch(reply.text, /5\.28|1\.056|0\.833|1\.125|검토한 영상|reviewed recording|核对的视频/);
  assert.equal(reply.answer?.kind, "rule");
});
