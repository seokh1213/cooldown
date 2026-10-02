import assert from "node:assert/strict";
import { test } from "node:test";
import { appChat } from "../../scripts/llm/stat-classifier/appChat";
import { loadData } from "../../scripts/llm/kev-agent/lib";
import { translations } from "../../src/i18n/translations";
import { directFactPlan } from "../../src/lib/advisor/directFactPlan";
import { resolveQuestion } from "../../src/lib/advisor/resolvedQuestion";
import { fixChampionTypo } from "../../src/lib/advisor/knowledgePlans";
import { understand } from "../../src/lib/advisor/questionUnderstanding";
import { isGameWord } from "../../src/lib/advisor/questionDocs";
import type { PlanContext } from "../../src/lib/advisor/planTypes";

const pair = { kind: "championStat" as const, champions: ["MonkeyKing", "DrMundo"], field: "health" as const, level: 18 as const };
for (const [word, field] of [["공속", "attackSpeed"], ["마저", "magicResist"], ["체젠", "healthRegen"],
  ["AD", "attackDamage"], ["깡공", "attackDamage"], ["이속", "moveSpeed"]] as const) {
  test(`${word} 한 단어로 물어도 두 대상과 레벨, 실제 수치를 유지한다`, async () => {
    const chat = appChat({});
    await chat.ask("오공 문도 박사 18레벨 체력 비교", pair);
    const row = await chat.ask(word, { ...pair, field });
    assert.equal(row.exact, true);
    assert.equal(row.valuesCorrect, true);
    assert.equal(row.regenUnitCorrect, true);
  });
}

for (const [word, title] of [["방관", "치명력"], ["물관", "치명력"], ["마관", "관통과 감소"],
  ["스가", "스킬 가속"], ["스킬 가속", "스킬 가속"], ["치피", "공격 속도, 치명타"]] as const) {
  test(`${word}은 챔피언 오타로 바꾸지 않고 원리 자료로 답한다`, async () => {
    for (const scope of ["fresh", "comparison"]) {
      const chat = appChat({});
      if (scope === "comparison") await chat.ask("오공 문도 박사 18레벨 체력 비교", pair);
      const row = await chat.ask(word, null);
      assert.match(row.text, new RegExp(title));
      assert.equal(row.query, null);
      assert.doesNotMatch(row.text, /마스터 이|피즈|가렌|알아들었습니다/);
      assert.notEqual(row.answerKind, "champion");
    }
  });
}

for (const [word, label] of [["피흡", "생명력 흡수"], ["흡혈", "생명력 흡수"], ["마젠", "마나 재생"], ["AP", "주문력"]]) {
  test(`${word}은 인식하되 없는 기본 능력치를 만들어 답하지 않는다`, async () => {
    for (const question of [word, `문도 ${word}은?`]) {
      const row = await appChat({}).ask(question, null);
      assert.match(row.text, new RegExp(label));
      assert.match(row.text, /수치는 아직 확인할 수 없어요/);
      assert.equal(row.answerKind, "text");
      assert.equal(row.query, null);
    }
  });
}

const data = loadData("ko_KR");
const ctx: PlanContext = { data, lang: "ko_KR", copy: translations.ko_KR.advisor, turns: [], championIds: [],
  judge: "none", consented: false, canUseModel: false, retrieval: false };

test("흡혈 아이템·스킬과 AP 계수는 자료 없음 안내로 가로채지 않는다", () => {
  for (const question of ["피흡템 추천", "문도 R 피흡", "아리 Q AP 계수", "흡혈의 낫 효과"]) {
    const plan = directFactPlan(resolveQuestion(question, data), ctx);
    assert.ok(!plan || plan.type === "card", question);
  }
});

test("약칭을 보호해도 실제 챔피언 별명과 오타는 그대로 읽는다", async () => {
  for (const [word, id] of [["마이", "MasterYi"], ["피즈", "Fizz"], ["가렌", "Garen"]]) {
    assert.equal(resolveQuestion(word, data).champions[0]?.id, id);
    assert.equal(isGameWord(data, word), false);
  }
  for (const [question, id] of [["럼미 E", "럼블"], ["재이스 궁", "제이스"]]) {
    const intent = await understand(question, ctx, data, { judge: async () => [], search: async () => [] });
    const plan = fixChampionTypo(intent);
    assert.equal(plan?.type, "retry");
    if (plan?.type === "retry") assert.ok(plan.question.includes(id));
  }
});

test("짧은 약칭이 일반 단어의 일부로 걸리지 않는다", () => {
  for (const word of ["흡혈귀", "APEX", "capable"]) assert.equal(isGameWord(data, word), false, word);
});
