import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { loadData, offlineFileJudge } from "../../scripts/llm/kev-agent/lib";
import { translations } from "../../src/i18n/translations";
import { planDialogue } from "../../src/lib/advisor/dialoguePlanner";
import { assembleDialogueReply } from "../../src/lib/advisor/dialogueReply";
import { composeMatchupReply } from "../../src/lib/advisor/matchupReply";
import { matchupQuestions } from "../../src/lib/advisor/matchupRequests";
import { emptyDialogue, type DialogueMemory } from "../../src/lib/advisor/dialogueState";
import { dehydrateTurn, reviveTurn } from "../../src/lib/advisor/history";
import type { PrecomputedFile } from "../../src/lib/advisor/precomputed";
import type { PlanContext } from "../../src/lib/advisor/planTypes";

const data = loadData("ko_KR");
const reported = "오공으로 럼블, 모데카이저 너무어려운데 방법 없나?";
const context = (judge: "none" | "offline" = "none", memory?: DialogueMemory): PlanContext => ({ data, lang: "ko_KR",
  copy: translations.ko_KR.advisor, turns: memory ? [{ role: "assistant", memory }] : [], championIds: [], judge,
  consented: false, canUseModel: false, retrieval: false });
const dependencies = (judge: "none" | "offline") => ({ judge: judge === "offline" ? offlineFileJudge() : async () => { throw Error("판정기 미사용"); }, search: async () => [] });
const banks = new Map<string, PrecomputedFile>();
function pair(mine: string, enemy: string) {
  if (!banks.has(mine)) banks.set(mine, JSON.parse(readFileSync(`public/data/${data.patch}/llm/matchups/${mine}.json`, "utf8")));
  return banks.get(mine)!.pairs[enemy];
}

async function reply(question: string, ctx = context()) {
  const plan = await planDialogue(question, ctx, dependencies(ctx.judge as "none" | "offline"), "combined");
  const result = await assembleDialogueReply(plan, data, "ko_KR", {
    matchup: async (source, lang, request) => composeMatchupReply(source, lang, request, pair(request.mine.id, request.enemy.id)),
  });
  return { plan, result };
}

for (const judge of ["none", "offline"] as const) {
  test(`${judge} 어려운 상대 둘을 각각의 대응법으로 답하고 능력치 표로 대신하지 않는다`, async () => {
    const { plan, result } = await reply(reported, context(judge));
    assert.deepEqual(plan.parts.map(part => part.plan.type === "matchup" ? [part.plan.mine.id, part.plan.enemy.id] : part.plan.type),
      [["MonkeyKing", "Rumble"], ["MonkeyKing", "Mordekaiser"]]);
    assert.match(result.text, /### 오공 vs 럼블[\s\S]*전기 작살/);
    assert.match(result.text, /### 오공 vs 모데카이저[\s\S]*죽음의 손아귀/);
    assert.doesNotMatch(result.text, /체력:|방어력:|이동 속도:/);
  });
  test(`${judge} 한 상대의 도움 요청도 수치 표로 보내지 않는다`, async () => {
    const { plan } = await reply("오공으로 럼블 너무 어려운데 방법 없나?", context(judge));
    assert.equal(plan.parts[0].plan.type, "matchup");
  });
}

for (const question of ["럼블이랑 모데카이저를 오공으로 상대하는 법 알려줘", "오공으로 럼블과 모데 한타 어떻게 해?",
  "오공으로 럼블 모데카이저 상대법 알려줘", "As Wukong against Rumble and Mordekaiser, how do I survive?",
  "我用孙悟空对线兰博和莫德凯撒，怎么打？"]) {
  test(`${question} 어순·연결어·별명을 유지하며 두 상대를 빠뜨리지 않는다`, async () => {
    const { plan } = await reply(question);
    assert.deepEqual(plan.parts.map(part => part.plan.type === "matchup" ? [part.plan.mine.id, part.plan.enemy.id] : part.plan.type),
      [["MonkeyKing", "Rumble"], ["MonkeyKing", "Mordekaiser"]]);
  });
}

for (const question of ["오공 럼블 모데카이저 체력 비교", "오공으로 럼블, 모데카이저 Q 쿨타임 알려줘",
  "오공으로 럼블 상대할 때 아이번 정글이면 아이템 뭐 가?", "오공으로 럼블, 아이번 정글인데 아이템 뭐 가?", "오공 럼블 모데카이저 스킬 설명해줘"]) {
  test(`${question} 조회나 곁들인 역할 이름은 여러 상성으로 나누지 않는다`, () => {
    assert.equal(matchupQuestions(question, emptyDialogue(data.patch), context()), undefined);
  });
}

test("상대 아홉 명을 물으면 일부를 빠뜨리지 않고 범위 조정을 안내한다", async () => {
  const enemies = ["럼블", "모데카이저", "가렌", "다리우스", "제드", "아리", "피오라", "잭스", "티모"];
  const { plan, result } = await reply(`오공으로 ${enemies.join(", ")} 상대법 알려줘`);
  assert.equal(plan.parts.length, 0);
  assert.match(result.text, /두 쌍까지[\s\S]*내 챔피언과 상대 한두 명/);
  assert.equal(result.answer, undefined);
});

test("저장 후 둘 다 아이템을 묻고 한 상대만 고르는 대화에서도 대상이 유지된다", async () => {
  const first = await reply(reported);
  const stored = dehydrateTurn({ id: 1, role: "assistant", content: first.result.text, memory: first.result.memory });
  const restored = reviveTurn(JSON.parse(JSON.stringify(stored)), data)!;
  const both = await reply("둘 다 아이템은?", context("none", restored.memory));
  assert.deepEqual(both.result.memory.matchups?.map(pair => pair.enemy), ["Rumble", "Mordekaiser"]);
  assert.match(both.result.text, /### 오공 vs 럼블[\s\S]*헤르메스/);
  assert.match(both.result.text, /### 오공 vs 모데카이저[\s\S]*헤르메스/);
  const selected = await reply("모데카이저만 한타는?", context("none", both.result.memory));
  assert.equal(selected.plan.parts.length, 1);
  assert.equal(selected.result.memory.matchup?.enemy, "Mordekaiser");
  assert.equal(selected.result.memory.matchupScope, "single");
  assert.deepEqual(selected.result.memory.matchups?.map(pair => pair.enemy), ["Rumble", "Mordekaiser"]);
  const continuation = await reply("라인전은?", context("none", selected.result.memory));
  assert.equal(continuation.plan.parts.length, 1);
  assert.equal(continuation.result.memory.matchup?.enemy, "Mordekaiser");
  const returned = await reply("아까 둘 다 아이템은?", context("none", continuation.result.memory));
  assert.deepEqual(returned.plan.parts.flatMap(p => p.matchup ? [p.matchup.enemy] : []), ["Rumble", "Mordekaiser"]);
});

test("팁을 반복하면 각 상대의 미표시 주제를 이어 보여주고 끝을 알린다", async () => {
  const first = await reply(reported);
  const more = await reply("팁 좀", context("none", first.result.memory));
  assert.ok(more.plan.parts.every(part => part.plan.type === "matchup" && part.plan.continuation === "advance"));
  assert.doesNotMatch(more.result.text, /전기 작살을 두 발 연속|모데카이저 E 죽음의 손아귀는 범위/);
  let current = more;
  for (let turn = 0; turn < 6 && !current.result.text.includes("모두 보여드렸어요"); turn++) current = await reply("팁 좀", context("none", current.result.memory));
  assert.match(current.result.text, /모두 보여드렸어요/);
});

test("각 하위 요청의 조건을 다음 상대의 조건과 섞지 않는다", async () => {
  const { plan, result } = await reply("아리로 제드 상대할 때 내 E가 없는데 궁 대응 어떻게 해? 그리고 아리로 럭스 상대할 때 내 R이 없는데 어떻게 해?");
  assert.equal(plan.parts.length, 2);
  assert.deepEqual(plan.parts[0].matchup?.conditions.map(c => [c.slot, c.status]), [["E", "down"]]);
  assert.deepEqual(plan.parts[1].matchup?.conditions.map(c => [c.slot, c.status]), [["R", "down"]]);
  assert.doesNotMatch(result.text.split("### 아리 vs 럭스")[0], /아리 E 매혹을 걸어|아리 E 매혹을 맞히/);
});
