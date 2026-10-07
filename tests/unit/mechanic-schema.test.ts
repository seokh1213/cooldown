import assert from "node:assert/strict";
import { test } from "node:test";
import { loadData } from "../../scripts/llm/kev-agent/lib";
import { answerStructured } from "../../scripts/llm/mechanic-schema/adapter";
import { loadReviewedRecords, fingerprint, PATCH, sourceCard } from "../../scripts/llm/mechanic-schema/fixtures";
import { evaluate } from "../../scripts/llm/mechanic-schema/engine";
import { updateMemory } from "../../scripts/llm/mechanic-schema/memory";
import { cueQuery, queryPrompt } from "../../scripts/llm/mechanic-schema/query";
import { auditCandidate, parsePayload, parseQuery, parseRecord, validateMemory } from "../../scripts/llm/mechanic-schema/schema";
import { grade } from "../../scripts/llm/mechanic-schema/cases";
import { emptyScenario, type Memory } from "../../scripts/llm/mechanic-schema/types";

const records = loadReviewedRecords();
const pyke = records.find(record => record.champion === "Pyke")!;
const akshan = records.find(record => record.champion === "Akshan")!;
const data = { ...loadData("ko_KR"), patch: PATCH };
function memory(champion: string, question: string, previous?: Memory): Memory {
  return updateMemory(previous, parseQuery(cueQuery(question, previous)), { champion, patch: PATCH });
}
function answer(champion: string, question: string, previous?: Memory) {
  const record = records.find(record => record.champion === champion)!;
  const state = memory(champion, question, previous);
  return evaluate(record, state, { patch: PATCH, sha256: fingerprint(sourceCard(champion)) });
}

test("고정 스키마는 알 수 없는 필드·별칭·버전·숫자 문자열을 거절한다", () => {
  assert.throws(() => parseRecord({ ...pyke, schemaVersion: 2 }));
  assert.throws(() => parseRecord({ ...pyke, newField: true }));
  const conversion = pyke.rules[0];
  assert.throws(() => parsePayload({ rules: [{ ...conversion, type: "health_to_ad" }] }));
  assert.throws(() => parsePayload({ rules: [{ ...conversion, inputPerOutput: "14" }] }));
  assert.throws(() => parsePayload({ rules: [{ ...conversion, inputPerOutput: 0 }] }));
  assert.throws(() => parsePayload({ rules: [conversion, conversion] }));
});
test("필드가 맞아도 전환 비율이 틀리면 출처 검수를 통과하지 않는다", () => {
  const candidate = structuredClone(pyke);
  if (candidate.rules[0].type === "stat_conversion") candidate.rules[0].inputPerOutput = 800;
  assert.doesNotThrow(() => parsePayload({ rules: candidate.rules }));
  assert.match(auditCandidate(candidate, pyke).join(" "), /schema/);
  assert.match(auditCandidate({ rules: candidate.rules }, pyke).join(" "), /source_review/);
  assert.deepEqual(auditCandidate({ rules: [...pyke.rules].reverse() }, pyke), []);
});
test("보호막 쿨 조건을 제거하거나 피해 유형을 바꾸면 내용 검수에서 잡는다", () => {
  const rules = structuredClone(akshan.rules);
  const shield = rules.find(rule => rule.type === "shield")!;
  shield.requiresReady = false;
  assert.match(auditCandidate({ rules }, akshan).join(" "), /source_review/);
  const changedDamage = akshan.rules.map(rule => rule.type === "damage_proc" ? { ...rule, damageType: "physical" } : rule);
  assert.match(auditCandidate({ rules: changedDamage }, akshan).join(" "), /source_review/);
});
test("null과 false를 구분하고 명시하지 않은 질문 필드는 필수 null로 둔다", () => {
  const valid = { topic: "stack_proc", asked: "shield", scenario: { ...emptyScenario(), shieldReady: false } };
  assert.equal(parseQuery(valid).scenario.shieldReady, false);
  assert.throws(() => parseQuery({ ...valid, scenario: { hits: 3 } }));
  assert.throws(() => parseQuery({ ...valid, scenario: { ...valid.scenario, shieldReady: "false" } }));
});
test("체력 140·280 전환은 코드로 계산하고 800% 계수와 섞지 않는다", () => {
  assert.match(answer("Pyke", "체력 140짜리 템이면?").text, /공격력 10/);
  assert.match(answer("Pyke", "체력 280짜리 템이면?").text, /공격력 20/);
  const text = answer("Pyke", "체력템 살 때 800%가 전환 비율이야?").text;
  assert.match(text, /14/);
  assert.match(text, /800%.*비축/);
});
test("기본·성장 체력은 전환하지 않고 아이템 체력만 전환한다", () => {
  assert.match(answer("Pyke", "기본 체력도 공격력으로 바뀌어?").text, /전환되지 않아/);
  assert.match(answer("Pyke", "성장 체력도 공격력으로 치환돼?").text, /전환되지 않아/);
  assert.match(answer("Pyke", "체력템 가면 체력이랑 공격력 둘 다 늘어?").text, /최대 체력에 붙지 않고/);
});
test("한 발만 언급해도 취소를 추측하지 않으며 조건을 답변에 포함한다", () => {
  const state = memory("Akshan", "평타 한대 치면?");
  assert.equal(state.scenario.followup, null);
  assert.match(answer("Akshan", "평타 한대 치면?").text, /취소하면 이동 속도/);
});
test("두 번째 발사와 취소는 이속 판정이 반대로 나온다", () => {
  assert.match(answer("Akshan", "두 번째 공격 취소하면?").text, /취소하면 이동 속도/);
  assert.match(answer("Akshan", "평타 두 대 다 치면 이속도 올라?").text, /발동하지 않아/);
});
test("미니언 3타에는 보호막이 없고 챔피언도 쿨 조건이 필요하다", () => {
  assert.match(answer("Akshan", "미니언 평타 세대 보호막?").text, /미니언에게는 보호막이 생기지 않아/);
  assert.match(answer("Akshan", "챔피언 평타 세대 보호막?").text, /보호막 쿨이 돌아왔을 때/);
  assert.match(answer("Akshan", "쉴드 쿨 남아 있는데 챔피언 세대 때리면?").text, /보호막 쿨이 남아/);
});
test("같은 주제에서 대상만 정정하면 세 번째 적중 조건을 보존한다", () => {
  const previous = memory("Akshan", "미니언 평타 세대 보호막?");
  const changed = memory("Akshan", "아니 챔피언이면?", previous);
  assert.equal(changed.scenario.hits, 3);
  assert.equal(changed.scenario.target, "champion");
  assert.match(answer("Akshan", "아니 챔피언이면?", previous).text, /3번째/);
});
test("기억 JSON을 저장·복원해도 후속 대상 정정과 버전 검증이 유지된다", () => {
  const original = memory("Akshan", "미니언 평타 세대 보호막?");
  const restored = JSON.parse(JSON.stringify(original));
  assert.equal(validateMemory(restored), true);
  const changed = memory("Akshan", "아니 챔피언이면?", restored);
  assert.equal(changed.scenario.hits, 3);
  assert.equal(changed.scenario.target, "champion");
  assert.equal(validateMemory({ ...restored, schemaVersion: 2 }), false);
});
test("챔피언·주제·패치 변경에서 이전 가정은 새 판정에 섞이지 않는다", () => {
  const previous = memory("Pyke", "체력 280짜리 템이면?");
  const changed = memory("Akshan", "두 번째 공격 취소하면?", previous);
  assert.equal(changed.scenario.healthAmount, null);
  const otherTopic = memory("Pyke", "적에게 보이는 동안 회복돼?", previous);
  assert.equal(otherTopic.scenario.healthAmount, null);
  const newPatch = updateMemory(previous, { topic: "inherit", asked: "inherit", scenario: emptyScenario() }, { champion: "Pyke", patch: "26.20" });
  assert.equal(newPatch.topic, "unsupported");
  assert.equal(newPatch.scenario.healthAmount, null);
});
test("승인 전 후보·패치 차이·원문 변경에는 재검수 안내가 나온다", () => {
  const state = memory("Pyke", "체력템 사면?");
  const source = { patch: PATCH, sha256: fingerprint(sourceCard("Pyke")) };
  assert.equal(evaluate({ ...pyke, reviewStatus: "candidate" }, state, source).status, "needs_review");
  assert.equal(evaluate(pyke, state, { ...source, patch: "26.20" }).status, "needs_review");
  const changedCard = structuredClone(sourceCard("Pyke"));
  changedCard.spells.find(spell => spell.slot === "P")!.text += " changed";
  assert.equal(evaluate(pyke, state, { ...source, sha256: fingerprint(changedCard) }).status, "needs_review");
});
test("누락한 규칙을 absence로 추측하지 않고 미지원 안내를 한다", () => {
  const state = memory("Akshan", "체력템 사면?");
  assert.equal(evaluate(akshan, state, { patch: PATCH, sha256: fingerprint(sourceCard("Akshan")) }).status, "unsupported");
});
test("실제 이름 탐지·후속 질문·여러 대상 안내까지 실험 진입점에서 확인한다", async () => {
  const first = await answerStructured("파이크 체력템 사면?", { data, records });
  const next = await answerStructured("그럼 체력 140이면?", { data, records, previous: first.memory });
  assert.match(next.result.text, /공격력 10/);
  const correction = await answerStructured("아니 280짜리면?", { data, records, previous: next.memory });
  assert.match(correction.result.text, /공격력 20/);
  const multiple = await answerStructured("아크샨이랑 파이크 둘 다", { data, records, previous: correction.memory });
  assert.equal(multiple.result.status, "clarify");
  assert.equal(multiple.memory, undefined);
});
test("질문 추출 결과가 스키마를 벗어나면 답변을 만들지 않는다", async () => {
  const invalid = await answerStructured("파이크 체력템?", { data, records }, async () => ({ topic: "conversion", asked: "overview", scenario: {} }) as never);
  assert.equal(invalid.result.status, "clarify");
  assert.equal(invalid.memory, undefined);
});
test("질문 추출 프롬프트에 채점 기대값이나 사실 정답을 전달하지 않는다", () => {
  const prompt = queryPrompt("체력 140이면?", memory("Pyke", "체력템 사면?"));
  assert.match(prompt, /Current question: 체력 140이면/);
  assert.doesNotMatch(prompt, /공격력 10|inputPerOutput|checks|criteria|체력 14당/);
});
test("숫자 채점은 57.1429 안의 14를 올바른 전환 비율로 인정하지 않는다", () => {
  const item = { id: "numeric", group: "numeric", question: "전환 비율?", split: "new" as const, checks: ["14"] };
  assert.equal(grade("추가 공격력 57.1429", item).pass, false);
  assert.equal(grade("추가 체력 14당 공격력 1", item).pass, true);
});
