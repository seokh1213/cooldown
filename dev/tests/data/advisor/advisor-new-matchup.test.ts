import assert from "node:assert/strict";
import { test } from "node:test";
import { loadData } from "../../../scripts/advisor/kev-agent/lib";
import { translations } from "../../../../src/shared/i18n/translations";
import { answerNewMatchup } from "../../../../src/features/advisor/application/plans/newMatchupPlan";
import type { Intent } from "../../../../src/features/advisor/contracts/planTypes";

const data = loadData("ko_KR");
const card = (id: string) => data.cardById.get(id)!;

function request(question: string, ids: string[], options: { ask?: Intent["ask"]; recent?: string[]; mine?: string } = {}) {
  let topicCalls = 0;
  const intent: Intent = {
    question, data, ask: options.ask ?? "matchup", champions: ids.map(card), recent: (options.recent ?? []).map(card),
    route: options.mine ? { kind: "matchup", mine: card(options.mine) } : undefined,
    ctx: { data, lang: "ko_KR", copy: translations.ko_KR.advisor, turns: [], championIds: [], consented: false, canUseModel: false, retrieval: false, judge: "none" },
    topic: async () => { topicCalls++; return { topic: "laning" }; },
  };
  return { intent, topicCalls: () => topicCalls };
}

test("새 상성은 최근 대상·두 이름·곁들인 정글 이름을 같은 내/상대 계획으로 해석한다", async () => {
  const cases = [
    request("럼블이랑 상대한다 생각하면", ["Rumble"], { ask: "guide", recent: ["MonkeyKing"] }),
    request("럼블 상대로 오공 하는데 어떻게 해", ["Rumble", "MonkeyKing"]),
    request("오공으로 럼블 상대할 때 아이번 정글이면 아이템 뭐 가?", ["MonkeyKing", "Rumble", "Ivern"]),
  ];
  for (const entry of cases) {
    const plan = await answerNewMatchup(entry.intent);
    if (plan?.type !== "matchup") assert.fail("상성 계획이어야 한다");
    assert.deepEqual([plan.mine.id, plan.enemy.id], ["MonkeyKing", "Rumble"]);
    assert.equal(plan.focus, "laning");
    assert.equal(entry.topicCalls(), 1);
  }
});

test("한 챔피언의 일반 상대법에는 최근 챔피언을 추정해 붙이지 않는다", async () => {
  const entry = request("럼블 상대법", ["Rumble"], { ask: "guide", recent: ["MonkeyKing"] });
  assert.equal(await answerNewMatchup(entry.intent), undefined);
  assert.equal(entry.topicCalls(), 0);
});

test("두 이름의 능력치 비교와 세 이름의 비교는 상성 주제 판정 없이 비교 카드로 넘긴다", async () => {
  for (const entry of [request("아리 vs 럼블 누가 더 빨라?", ["Ahri", "Rumble"]), request("오공 럼블 아이번 중 누가 세?", ["MonkeyKing", "Rumble", "Ivern"])]) {
    assert.equal(await answerNewMatchup(entry.intent), undefined);
    assert.equal(entry.topicCalls(), 0);
  }
});

test("확실한 조사 관점은 판정기와 충돌해도 보존하고 모호한 두 이름은 판정기 관점을 따른다", async () => {
  const clear = await answerNewMatchup(request("럼블 상대로 오공 하는데", ["Rumble", "MonkeyKing"], { mine: "Rumble" }).intent);
  const ambiguous = await answerNewMatchup(request("오공 럼블 라인전", ["MonkeyKing", "Rumble"], { mine: "Rumble" }).intent);
  if (clear?.type !== "matchup" || ambiguous?.type !== "matchup") assert.fail("상성 계획이어야 한다");
  assert.equal(clear.mine.id, "MonkeyKing");
  assert.equal(ambiguous.mine.id, "Rumble");
});

test("세 번째 정글 이름 때문에 다른 갈래로 판정돼도 명시한 상성의 두 주체를 보존한다", async () => {
  for (const ask of ["guide", "item"] as const) {
    const entry = request("오공으로 럼블 상대할 때 아이번 정글이면 아이템 뭐 가?", ["MonkeyKing", "Rumble", "Ivern"], { ask });
    const plan = await answerNewMatchup(entry.intent);
    if (plan?.type !== "matchup") assert.fail("명시한 내 챔피언과 상대의 상성이어야 한다");
    assert.deepEqual([plan.mine.id, plan.enemy.id], ["MonkeyKing", "Rumble"]);
    assert.equal(entry.topicCalls(), 1);
  }
});

test("갈래 보완은 세 명의 비교나 관점 없는 나열, 두 명의 일반 질문을 상성으로 바꾸지 않는다", async () => {
  for (const entry of [
    request("오공 럼블 아이번 중 누가 세?", ["MonkeyKing", "Rumble", "Ivern"], { ask: "guide" }),
    request("오공 럼블 아이번 아이템", ["MonkeyKing", "Rumble", "Ivern"], { ask: "item" }),
    request("오공 럼블 상대법", ["MonkeyKing", "Rumble"], { ask: "guide" }),
  ]) {
    assert.equal(await answerNewMatchup(entry.intent), undefined);
    assert.equal(entry.topicCalls(), 0);
  }
});

test("상성 상황을 곁들인 구체적인 스킬 조회 판정은 새 상성이 덮어쓰지 않는다", async () => {
  for (const ask of ["skills", "spellStat"] as const) {
    const entry = request("오공으로 럼블 상대하고 아이번 정글인데 오공 Q 쿨타임 알려줘", ["MonkeyKing", "Rumble", "Ivern"], { ask });
    assert.equal(await answerNewMatchup(entry.intent), undefined);
    assert.equal(entry.topicCalls(), 0);
  }
});
