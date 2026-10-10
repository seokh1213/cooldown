import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { appChat } from "../../scripts/advisor/stat-classifier/appChat";
import { appStatClassifier } from "../../scripts/advisor/stat-classifier/appClassifier";
import type { LinearModel } from "../../scripts/advisor/stat-classifier/contracts";
import { dataUrl } from "../../../src/features/advisor/conversation/context";
import { statPlanForQuery } from "../../../src/features/advisor/conversation/dialogueStats";
import { loadData } from "../../scripts/advisor/kev-agent/lib";
import { translations } from "../../../src/shared/i18n/translations";
import { resolveQuestion } from "../../../src/features/advisor/understanding/resolvedQuestion";

const model: LinearModel = JSON.parse(fs.readFileSync("dev/research/llm-evals/stat-query/ml/context.json", "utf8"));
const inferStatQuery = appStatClassifier(async () => model);
const expected = { kind: "championStat" as const, champions: ["MonkeyKing", "DrMundo"], field: "attackSpeed" as const, level: 18 as const };

test("명확한 규칙 조회에서는 실험 판정기를 호출하지 않는다", async () => {
  let calls = 0;
  const chat = appChat({ inferStatQuery: async () => { calls++; throw Error("호출 불필요"); } });
  const row = await chat.ask("오공 문도 박사 18레벨 공속 비교", expected);
  assert.equal(row.exact, true);
  assert.equal(calls, 0);
});

test("실제 대화에서 공속 오타를 해석하고 저장 복원 뒤 레벨과 대상을 유지한다", async () => {
  const chat = appChat({ inferStatQuery });
  await chat.ask("오공 문도 박사 18레벨 체력 비교", { ...expected, field: "health" });
  const typo = await chat.ask("그럼 공걱속도는?", expected);
  assert.equal(typo.exact, true);
  assert.equal(typo.valuesCorrect, true);
  assert.deepEqual(typo.serializedMemory?.stat, expected);
  const one = await chat.ask("문도만 보여줘", { ...expected, champions: ["DrMundo"] });
  assert.equal(one.exact, true);
  assert.equal(one.valuesCorrect, true);
});

test("스킬·아이템 회복은 실제 카드 경로로 답한다", async () => {
  const chat = appChat({ inferStatQuery });
  await chat.ask("문도 박사 18레벨 체력 재생", { ...expected, champions: ["DrMundo"], field: "healthRegen" });
  const spell = await chat.ask("문도 R 회복량은?", null);
  assert.equal(spell.answerKind, "spell");
  assert.equal(spell.query, null);
  const item = await chat.ask("체력 물약 회복량은?", null);
  assert.equal(item.answerKind, "item");
  assert.equal(item.query, null);
});

test("실험 가중치를 못 읽으면 기존 앱 경로로 계속 답한다", async () => {
  const current = await appChat({}).ask("아니 회복량", null);
  const failed = await appChat({ inferStatQuery: async () => { throw Error("가중치 읽기 실패"); } }).ask("아니 회복량", null);
  assert.equal(failed.text, current.text);
  assert.deepEqual(failed.memory, current.memory);
});

test("실험 조회의 잘못된 대상과 레벨을 카드로 만들지 않는다", () => {
  const data = loadData("ko_KR");
  const ctx = { data, lang: "ko_KR" as const, copy: translations.ko_KR.advisor, turns: [], championIds: [],
    consented: false, canUseModel: false, retrieval: false, judge: "offline" as const };
  const resolved = resolveQuestion("공속", data);
  assert.equal(statPlanForQuery({ ...expected, champions: ["없는챔피언"] }, resolved, ctx), undefined);
  assert.equal(statPlanForQuery({ ...expected, level: 2 as 18 }, resolved, ctx), undefined);
});

test("전체 대화 평가에서도 미리 만든 노트의 자료 URL을 Node에서 만들 수 있다", () => {
  assert.equal(dataUrl("26.19", "llm/matchups/Garen.json"), "/data/26.19/llm/matchups/Garen.json");
});
