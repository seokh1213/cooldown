import assert from "node:assert/strict";
import { test } from "node:test";
import { loadData, offlineFileJudge } from "../../scripts/llm/kev-agent/lib";
import { planDialogue } from "../../src/lib/advisor/dialoguePlanner";
import { translations } from "../../src/i18n/translations";
import { currentPair } from "../../scripts/llm/atom-context/build-conditional";
import { buildBroadAtoms } from "../../scripts/llm/atom-context/broad-build";
import { selectDecisionAnswer } from "../../scripts/llm/atom-context/conditional";
import { emptyDialogue, scenarioConditions } from "../../src/lib/advisor/dialogueState";
import { adviceUnit, actionEligible, selectExecutableText } from "../../src/lib/advisor/adviceActions";
import { conditionMatchupText } from "../../src/lib/advisor/conditionedMatchup";
import { composeMatchupReply } from "../../src/lib/advisor/matchupReply";

const data = loadData("ko_KR");
const { atoms } = buildBroadAtoms();
const subjects = (mine = "Ahri", enemy = "Zed") => ({ mine: data.cardById.get(mine)!, enemy: data.cardById.get(enemy)! });
const down = (slot: string) => scenarioConditions(`내 ${slot}가 없는데 어떻게 해?`, [], 1);

test("슬롯·스킬 이름·Q로 표기로 적힌 불가능한 콤보는 문단 전체를 제외한다", () => {
  const pair = subjects("Vayne", "Jax");
  const text = "**콤보**\nQ로 각을 잡은 뒤 E로 벽에 박습니다. 그 뒤 평타로 중첩을 채웁니다.";
  assert.equal(selectExecutableText(text, pair, down("Q")).text, "");
  assert.equal(selectExecutableText("아리 매혹으로 콤보를 끊습니다.", subjects(), down("E")).text, "");
});

test("상대 스킬과 내 스킬을 같은 슬롯이라고 제거하지 않는다", () => {
  const text = "제드 E 그림자 베기 범위 밖으로 움직입니다.";
  assert.equal(selectExecutableText(text, subjects(), down("E")).text, text);
  const mixed = "제드 E 그림자 베기를 피한 뒤 아리 E 매혹을 맞힙니다.";
  assert.equal(selectExecutableText(mixed, subjects(), down("E")).text, "");
});

test("금지·대기·명시적인 미래 조건은 현재 스킬 사용 지시와 구분한다", () => {
  for (const text of ["아리 E를 쓰지 않습니다.", "아리 E가 돌아올 때까지 파밍합니다.", "아리 E가 돌아오면 E 매혹을 맞힙니다."]) {
    assert.equal(selectExecutableText(text, subjects(), down("E")).text, text);
  }
  assert.equal(selectExecutableText("아리 R로 피해를 피합니다.", subjects(), down("R")).text, "");
});

test("다른 챔피언에게만 적용되는 대안은 선택하지 않는다", () => {
  const local = { ...data, playbooks: new Map([["Ahri", { champion: "Ahri", playing: [{ id: "wrong", category: "skill", when: { enemyIds: ["Lux"] }, text: "Q로 견제합니다." }], against: [] }]]) };
  const checked = conditionMatchupText(local, "ko_KR", { ...subjects(), question: "내 E가 없는데?", conditions: down("E") }, "아리 E 매혹을 맞힙니다.");
  assert.equal(checked.abstained, true);
  assert.doesNotMatch(checked.text, /Q로 견제/);
});

test("일반 CC 대응은 사용 가능한 실제 스킬이 있어야 선택한다", () => {
  const unit = adviceUnit("표식이 붙으면 군중 제어를 걸어 콤보를 끊습니다.", subjects());
  assert.equal(actionEligible(unit, down("E")), false);
  assert.equal(actionEligible(unit, []), true);
});

test("알려진 네 실패에서 은행·노트·조건 묶음 복귀 모두 없는 스킬 사용을 피한다", () => {
  const failures = [
    { mine: "Ahri", enemy: "Zed", slot: "E", question: "내 E도 없는데 어떻게 해?", bad: /E 매혹을 맞힙|E 매혹으로 콤보를 끊|매혹 →/ },
    { mine: "Thresh", enemy: "Morgana", slot: "Q", question: "내 Q도 없는데 어떻게 들어가?", bad: /Q 사형 선고로 거리를 좁|Q 사형 선고를 맞히|Q 적중 →/ },
    { mine: "Vayne", enemy: "Jax", slot: "Q", question: "내 Q도 없는데 어떻게 해?", bad: /Q로 각을 잡|Q 강화 평타로 얹|Q로 물러나/ },
    { mine: "Ahri", enemy: "Zed", slot: "E", question: "내 매혹은 없는데 상대 궁이 오면 어떻게 해?", bad: /E 매혹으로 콤보를 끊|E 매혹을 맞힙|매혹 →/ },
  ];
  for (const entry of failures) {
    const cards = subjects(entry.mine, entry.enemy);
    const pair = entry.mine === "Vayne" ? undefined : currentPair(entry.mine, entry.enemy, data.patch);
    const conditions = down(entry.slot);
    const reply = composeMatchupReply(data, "ko_KR", { ...cards, question: entry.question, conditions, focus: "general", scope: "topic" }, pair);
    assert.equal(reply.answer.kind, "compare");
    const text = reply.answer.kind === "compare" ? reply.answer.precomputed! : "";
    assert.doesNotMatch(text, entry.bad);
    assert.ok(text.trim().length > 0, entry.question);
    const selected = selectDecisionAnswer(data, atoms, { ...entry, pair: pair ?? {}, focus: "general", baseline: "**콤보**\n" + (entry.mine === "Vayne" ? "Q로 각을 잡은 뒤 E로 벽에 박습니다." : `${cards.mine.name} ${entry.slot}를 맞힙니다.`),
      memory: { ...emptyDialogue(data.patch), conditions } });
    assert.doesNotMatch(selected.text, entry.bad);
    assert.doesNotMatch(selected.text, new RegExp(`${entry.slot}를 맞힙니다`));
  }
});

test("출처 변경으로 복귀해도 조건과 충돌하는 현재 답을 그대로 내보내지 않는다", () => {
  const input = { mine: "Lux", enemy: "Yasuo", question: "상대 W가 빠졌고 내 Q도 없는데 어떻게 해?", focus: "skill", pair: { watch: "바뀐 출처" }, baseline: "럭스 Q 빛의 속박을 맞힙니다.",
    memory: { ...emptyDialogue(data.patch), conditions: scenarioConditions("상대 W가 빠졌고 내 Q도 없어", [], 1) } };
  const reply = selectDecisionAnswer(data, atoms, input);
  assert.doesNotMatch(reply.text, /Q 빛의 속박을 맞힙/);
  assert.doesNotMatch(reply.text, /말씀하신 조건:/);
});

test("내 스킬 부재를 정정하면 해당 콤보를 다시 사용할 수 있다", () => {
  const pair = subjects();
  const text = "아리 E 매혹을 맞힙니다.";
  const restored = scenarioConditions("정정, 내 E는 돌아왔어", down("E"), 2);
  assert.equal(selectExecutableText(text, pair, restored).text, text);
});

test("슬롯 뒤에 상대가 등장해도 내 이동기 사용을 상대 스킬로 읽지 않는다", () => {
  const text = "미니언 뒤에 선 상대에게 닿지 않으므로 R로 줄을 넘어간 뒤 E를 씁니다.";
  assert.equal(selectExecutableText(text, subjects(), down("R")).text, "");
});

test("돌아오면서 보호막을 주는 스킬을 쿨타임 이후의 행동으로 읽지 않는다", () => {
  const text = "W 프리즘 보호막은 나갔다가 돌아오면서 보호막을 줍니다. 달리는 방향으로 던집니다.";
  assert.equal(selectExecutableText(text, subjects("Lux", "Zed"), down("W")).text, "");
});

test("같은 주인의 여러 스킬에 붙은 부재 상태를 함께 기억한다", () => {
  const conditions = scenarioConditions("내 E와 R이 없어", [], 1);
  assert.deepEqual(conditions.map(c => [c.owner, c.slot, c.status]), [["mine", "E", "down"], ["mine", "R", "down"]]);
  assert.deepEqual(scenarioConditions("상대 W와 R이 빠졌어", [], 1).map(c => c.slot), ["W", "R"]);
  assert.deepEqual(scenarioConditions("내 E와 상대 R이 없어", [], 1).map(c => [c.owner, c.slot, c.status]), [["mine", "E", "down"], ["enemy", "R", "down"]]);
});

test("사용 후 아끼라는 문장에서 앞의 스킬 사용을 놓치지 않는다", () => {
  const text = "아리 E 매혹을 맞히고 나머지 스킬은 아끼면서 파밍합니다.";
  assert.equal(selectExecutableText(text, subjects(), down("E")).text, "");
});

test("연속된 슬롯으로 적힌 콤보도 필요한 스킬이 없으면 제외한다", () => {
  assert.equal(selectExecutableText("EQR 콤보로 진입합니다.", subjects(), down("E")).text, "");
  assert.equal(selectExecutableText("We maintain distance.", subjects(), down("E")).text, "We maintain distance.");
});

test("한 스킬만 정정해도 나머지 상태는 유지하며 명시적인 조건 취소는 지운다", () => {
  const before = scenarioConditions("상대 W와 R이 빠졌고 내 E도 없어", [], 1);
  const after = scenarioConditions("정정, 내 E는 돌아왔어", before, 2);
  assert.deepEqual(after.map(c => [c.owner, c.slot, c.status]), [["enemy", "W", "down"], ["enemy", "R", "down"], ["mine", "E", "ready"]]);
  assert.deepEqual(scenarioConditions("조건을 취소해줘", after, 3), []);
});

test("중간에 쿨타임을 조회해도 부재 조건과 조언은 이전 상성으로 돌아간다", async () => {
  const memory = { ...emptyDialogue(data.patch), active: "spell" as const, spell: { champion: "Ezreal", slot: "Q", focus: "cooldown" as const }, matchup: { mine: "Ezreal", enemy: "Blitzcrank" } };
  const ctx = { data, lang: "ko_KR" as const, copy: translations.ko_KR.advisor, turns: [{ role: "assistant" as const, memory }], championIds: [], consented: false, canUseModel: false, retrieval: false, judge: "offline" as const };
  for (const question of ["내 E가 없는데 어떻게 버텨?", "내 Q도 없어. 그럼 어떻게 해?", "내 E도 없는데 콤보 알려줘", "내 E도 재사용 대기 중이야. 그래도 들어가?"]) {
    const result = await planDialogue(question, ctx, { judge: offlineFileJudge(), search: async () => [] }, "combined");
    assert.equal(result.parts[0].plan.type, "matchup");
    assert.ok(result.memory.conditions.some(c => c.owner === "mine" && c.status === "down"));
  }
  const numeric = await planDialogue("내 Q 쿨타임은?", ctx, { judge: offlineFileJudge(), search: async () => [] }, "combined");
  assert.equal(numeric.parts[0].plan.type, "card");
});

test("새 실행 조건이 없는 과거 아톰 파일도 스킬 부재 검사를 거친다", () => {
  const legacy = atoms.filter(a => a.mine === "Ahri" && a.enemy === "Lux").map(a => {
    const copy = { ...a };
    delete copy.actionRequirements;
    return copy;
  });
  const conditions = scenarioConditions("상대 Q가 빠졌고 내 R과 E도 없어", [], 1);
  const selected = selectDecisionAnswer(data, legacy, { mine: "Ahri", enemy: "Lux", question: "어떻게 들어가?", focus: "skill", pair: currentPair("Ahri", "Lux", data.patch),
    baseline: "아리 R 혼령 질주로 접근해 E 매혹을 맞힙니다.", memory: { ...emptyDialogue(data.patch), conditions } });
  assert.doesNotMatch(selected.text, /R 혼령 질주로 접근|E 매혹을 맞힙/);
});

test("상대 W 기억이 남아도 궁 대응을 물으면 R 대응 근거를 우선한다", () => {
  const conditions = scenarioConditions("상대 W는 없고 상대 R은 있어. 내 E는 돌아왔어", [], 1);
  const selected = selectDecisionAnswer(data, atoms, { mine: "Ahri", enemy: "Zed", question: "상대 궁에 어떻게 대응해?", focus: "skill", pair: currentPair("Ahri", "Zed", data.patch), baseline: "현재 답변", memory: { ...emptyDialogue(data.patch), conditions } });
  assert.equal(selected.atom, "zed-r-ready");
  assert.match(selected.text, /매혹으로 콤보를 끊/);
});

test("한타 대안이 없으면 무관한 라인전 노트로 채우지 않는다", () => {
  const local = { ...data, playbooks: new Map([["Ahri", { champion: "Ahri", playing: [{ id: "laning", category: "laning", text: "Q로 견제하며 파밍합니다." }], against: [] }]]) };
  const selected = conditionMatchupText(local, "ko_KR", { ...subjects(), focus: "teamfight", question: "내 E 없이 한타 어떻게 해?", conditions: down("E") }, "아리 E 매혹을 맞힙니다.");
  assert.equal(selected.abstained, true);
  assert.doesNotMatch(selected.text, /Q로 견제/);
});

test("E만 돌아오면 여전히 없는 R 대신 E로 시작하는 기존 콤보를 고른다", () => {
  const before = scenarioConditions("내 E와 R이 없어", [], 1);
  const conditions = scenarioConditions("정정, 내 E는 돌아왔어", before, 2);
  const reply = composeMatchupReply(data, "ko_KR", { ...subjects(), question: "콤보 알려줘", focus: "combo", conditions, scope: "topic" }, currentPair("Ahri", "Zed", data.patch));
  assert.equal(reply.answer.kind, "compare");
  const text = reply.answer.kind === "compare" ? reply.answer.precomputed! : "";
  assert.match(text, /E 매혹 → W 여우불 → Q/);
  assert.doesNotMatch(text, /R 혼령 질주로.*(?:접근|넘|진입)/);
});
