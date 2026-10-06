import assert from "node:assert/strict";
import test from "node:test";
import { emptyEffect, type Job, type Rule } from "../../scripts/llm/champion-mechanics/contract";
import { sourceNumbers } from "../../scripts/llm/champion-mechanics/numbers";
import { renderRules } from "../../scripts/llm/champion-mechanics/ruleAnswer";
import { selectRules } from "../../scripts/llm/champion-mechanics/retrieval";
import { gradeAnswer } from "../../scripts/llm/champion-mechanics/evaluate";
import { qualityFailures } from "../../scripts/llm/champion-mechanics/qualityGate";
import { digest } from "../../scripts/llm/champion-mechanics/sources";
import { answerReviewed } from "../../scripts/llm/champion-mechanics/answerReviewed";
import { loadData } from "../../scripts/llm/kev-agent/lib";
import { translations } from "../../src/i18n/translations";
import type { PlanContext } from "../../src/lib/advisor/planTypes";

function conversionFixture() {
  const sources: Job["sources"] = [{ id: "en:body", text: "Convert 7 bonus Health to 2 Attack Damage.", tier: "tooltip", locale: "en_US", variant: null }];
  const job: Job = { id: "Example.P", champion: "Example", slot: "P", patch: "fixture", sourceHash: "source", promptHash: "prompt", slotRole: "ability",
    facts: {}, sources, numbers: sourceNumbers(sources), variants: [{ id: "base", label: "공통", sourceIds: ["en:body"] }] };
  const rule: Rule = { variant: "base", trigger: { event: "stat_gain", subject: "caster" }, conditions: [],
    evidence: [{ sourceId: "en:body", quote: sources[0].text }], effects: [{ ...emptyEffect("stat_conversion", "추가 체력을 추가 공격력으로 전환합니다."),
      statFrom: "bonusHealth", statTo: "bonusAttackDamage", parameters: [
        { role: "ratio_input", numberRefs: ["en:body:n0"], stat: "bonusHealth", statSubject: "caster", shape: "scalar" },
        { role: "ratio_output", numberRefs: ["en:body:n1"], stat: "bonusAttackDamage", statSubject: "caster", shape: "scalar" }] }] };
  return { job, rule };
}
test("전환 계산은 챔피언 이름과 고정 14:1 대신 출처의 두 비율을 사용한다", () => {
  const { job, rule } = conversionFixture();
  const text = renderRules(job, [rule], "체력 140짜리면?");
  assert.match(text, /추가 체력 7당 추가 공격력 2/);
  assert.match(text, /추가 공격력 40/);
});
test("미확정 식이나 없는 숫자 참조는 계산하지 않는다", () => {
  const { job, rule } = conversionFixture();
  rule.effects[0].parameters[0].shape = "formula_components";
  assert.doesNotMatch(renderRules(job, [rule], "체력 140짜리면?"), /공격력 40/);
  rule.effects[0].parameters[0].shape = "scalar";
  rule.effects[0].parameters[0].numberRefs = ["unknown"];
  assert.doesNotMatch(renderRules(job, [rule], "체력 140짜리면?"), /공격력 40/);
});
test("기본 체력은 추가 체력 전환 계산에 넣지 않는다", () => {
  const { job, rule } = conversionFixture();
  const text = renderRules(job, [rule], "기본 체력 140도 바뀌어?");
  assert.match(text, /포함되지 않습니다/);
  assert.doesNotMatch(text, /공격력 40/);
});
test("보호막의 대상과 사용 가능 조건을 함께 보존한다", () => {
  const { job, rule } = conversionFixture();
  rule.trigger = { event: "attack_or_ability_hit", subject: "target" };
  rule.effects = [emptyEffect("shield", "보호막을 얻는다.")];
  rule.conditions = [{ subject: "target", field: "target_type", operator: "eq", value: { kind: "enum", value: "champion" } },
    { subject: "caster", field: "shield_ready", operator: "eq", value: { kind: "enum", value: "ready" } }];
  assert.match(renderRules(job, [rule], "미니언 보호막?"), /미니언은.*해당하지/);
  assert.match(renderRules(job, [rule], "보호막 쿨 남아 있으면?"), /대기시간이 남아.*해당하지/);
  assert.match(renderRules(job, [rule], "챔피언 보호막?"), /챔피언.*보호막 사용 가능/);
  assert.doesNotMatch(renderRules(job, [rule], "보호막 쿨 안 남았으면?"), /해당하지/);
  assert.doesNotMatch(renderRules(job, [rule], "쿨 남았으면?"), /보호막을 얻는다/);
});
test("첫 공격 취소와 추가 공격 취소를 같은 효과로 답하지 않는다", () => {
  const { job, rule } = conversionFixture();
  rule.effects = [emptyEffect("movement", "추가 공격을 취소하면 이동 속도를 얻습니다.")];
  rule.conditions = [{ subject: "caster", field: "followup_status", operator: "eq", value: { kind: "enum", value: "cancelled" } }];
  const first = renderRules(job, [rule], "첫 평타를 발사 전에 취소하면?");
  assert.match(first, /첫 평타.*해당하지/);
  assert.doesNotMatch(first, /이동 속도를 얻습니다/);
  assert.match(renderRules(job, [rule], "두 번째 공격 취소하면?"), /이동 속도를 얻습니다/);
});
test("전환 질문이 기존 능력치 경로로 가도 근거 스킬 카드와 저장 답변을 함께 바꾼다", async () => {
  const data = loadData("ko_KR");
  const { job, rule } = conversionFixture();
  const reviewedJob = { ...job, id: "Pyke.P", champion: "Pyke", patch: data.patch };
  const index = new Map([[reviewedJob.id, { job: reviewedJob, draft: { summary: "fixture", rules: [rule], gaps: [] } }]]);
  const ctx: PlanContext = { data, lang: "ko_KR", copy: translations.ko_KR.advisor, turns: [], championIds: [],
    judge: "none", consented: false, canUseModel: false, retrieval: false };
  const deps = { judge: async () => { throw new Error("모델 호출 금지"); }, search: async () => [] };
  const result = await answerReviewed("파이크 체력 140이면 공격력 얼마야?", { ctx, deps, index });
  assert.equal(result.source, "reviewed");
  assert.match(result.reply.text, /추가 공격력 40/);
  const answer = result.reply.answer;
  assert.equal(answer?.kind, "spell");
  if (answer?.kind !== "spell") throw new Error("근거 스킬 카드가 없습니다");
  assert.equal(`${answer.championId}.${answer.spell.slot}`, result.abilityId);
  assert.match(answer.highlighted.join("\n"), /추가 공격력 40/);
  assert.equal(result.reply.memory.lastReply?.text, result.reply.text);
});
test("아톰 효과만 떼지 않고 규칙 단위로 검색해 조건과 인용을 유지한다", () => {
  const { job, rule } = conversionFixture();
  const other: Rule = { ...rule, effects: [emptyEffect("heal", "피해를 비축해 회복합니다.")] };
  const selected = selectRules({ job, draft: { summary: "fixture", rules: [other, rule], gaps: [] } }, "체력템 사면?", "conversion");
  assert.deepEqual(selected, [rule]);
  assert.equal(selected[0].evidence[0].quote, job.sources[0].text);
});
test("챔피언 이름만 겹치는 규칙은 선택하지 않고 실제 전환 주제는 유지한다", () => {
  const { job, rule } = conversionFixture();
  const unrelated: Rule = { ...rule, effects: [emptyEffect("mark", "시험용 챔피언의 아군이 표식을 남깁니다.")] };
  const ability = { job, draft: { summary: "fixture", rules: [unrelated, rule], gaps: [] } };
  const question = "시험용 챔피언 패시브 평타 세 대 치면?";
  assert.deepEqual(selectRules(ability, question, undefined, { championMentions: ["시험용 챔피언"] }), []);
  assert.deepEqual(selectRules(ability, "시험용 챔피언 체력 전환은?", "conversion", { championMentions: ["시험용 챔피언"] }), [rule]);
});
test("평가기는 단순 통과 숫자와 별개로 누락과 금지 문구를 기록한다", () => {
  assert.deepEqual(gradeAnswer({ q: "fixture", require: ["공격력 10"], forbid: ["800%"] }, "공격력 10"), []);
  assert.deepEqual(gradeAnswer({ q: "fixture", require: ["공격력 10"], forbid: ["800%"] }, "800%"), ["missing:공격력 10", "forbidden:800%"]);
});
test("새로 통과한 질문의 회귀도 검사하되 바뀐 원문에는 옛 정답을 강제하지 않는다", () => {
  const { job, rule } = conversionFixture();
  const ability = { job, draft: { summary: "fixture", rules: [rule], gaps: [] } };
  const index = new Map([[job.id, ability]]);
  const reference = { questionHash: "questions", passed: [{ id: "conversion", turn: 1, abilityId: job.id, sourceHash: job.sourceHash, candidateHash: digest(ability.draft) }] };
  const options = { questionHash: "questions", index, reference, rows: [{ id: "conversion", turn: 1, variant: { pass: false } }] };
  assert.deepEqual(qualityFailures(options), ["conversion:1"]);
  job.sourceHash = "changed-source";
  assert.deepEqual(qualityFailures(options), []);
  assert.throws(() => qualityFailures({ ...options, questionHash: "new-rubric" }), /rubric changed/);
});
