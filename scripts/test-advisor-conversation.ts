/**
 * 대화 상태 시험 — 앞 상성을 이어 받을지(planTurn), 방금 다룬 상성이 무엇인지(matchupStateOf)
 */
import assert from "node:assert/strict";
import { actCriteria, actFromProbs, actFromWords, actState, matchupStateOf, planTurn, sideOfNewName, ACT_LABELS } from "../src/lib/advisor/conversation";
import type { AdvisorAnswer } from "../src/lib/advisor/answer";

let checks = 0;
const eq = (actual: unknown, expected: unknown, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};

const garen = { id: "Garen" };
const darius = { id: "Darius" };
const fiora = { id: "Fiora" };
const state = { mine: garen, enemy: darius };

eq(planTurn(undefined, [], false), { kind: "pass" }, "앞 상성이 없으면 지금 경로");
eq(planTurn(state, [], false), { kind: "matchup", mine: garen, enemy: darius, act: "followup" }, "판정기 없이 이름 없는 말은 이어 묻기");
eq(planTurn(state, [], true), { kind: "pass" }, "아이템·게임 규칙 이름이 있으면 새 질문");
eq(planTurn(state, [], false, "new"), { kind: "matchup", mine: garen, enemy: darius, act: "followup" }, "이름 없는 말에서 판정기의 new 는 따르지 않는다(새 질문은 entity 가 가른다)");
eq(planTurn(state, [], false, "more"), { kind: "matchup", mine: garen, enemy: darius, act: "more" }, "더 자세히");
eq(planTurn(state, [], false, "flip"), { kind: "matchup", mine: darius, enemy: garen, act: "flip" }, "입장 뒤집기는 둘을 맞바꾼다");
eq(planTurn(state, [], false, "enemy"), { kind: "matchup", mine: garen, enemy: darius, act: "followup" }, "이름 없이 상대 바꾸기를 고르면 이어 묻기");
eq(planTurn(state, [fiora], false, "enemy"), { kind: "matchup", mine: garen, enemy: fiora, act: "enemy" }, "새 상대");
eq(planTurn(state, [fiora], false, "mine"), { kind: "matchup", mine: fiora, enemy: darius, act: "mine" }, "새 내 챔피언");
eq(planTurn(state, [fiora], false, "new"), { kind: "pass" }, "다른 챔피언 자체를 묻는 말");
eq(planTurn(state, [fiora], false), { kind: "pass" }, "판정기 없이 새 이름 하나는 앞 쌍에 붙이지 않는다");
eq(planTurn(state, [darius], false, "flip"), { kind: "matchup", mine: darius, enemy: garen, act: "flip" }, "\"다리우스 입장에서는?\"");
eq(planTurn(state, [darius], false), { kind: "matchup", mine: garen, enemy: darius, act: "followup" }, "\"다리우스 W 어떻게 피해\" 는 같은 상성");
eq(planTurn(state, [fiora, darius], false, "followup"), { kind: "pass" }, "이름이 둘이면 새 상성 질문");
eq(planTurn(state, [fiora], false, "mine", "enemy"), { kind: "matchup", mine: garen, enemy: fiora, act: "enemy" }, "문형이 판정기보다 먼저");
eq(planTurn(state, [fiora], false, "new", "mine"), { kind: "matchup", mine: fiora, enemy: darius, act: "mine" }, "문형이 자리를 말하면 새 질문이라도 이어 받는다");

eq(planTurn(state, [fiora], false, "enemy", undefined, "spellStat"), { kind: "pass" }, "새 이름의 수치 질문은 앞 쌍에 붙이지 않는다");
eq(planTurn(state, [fiora], false, undefined, undefined, "guide"), { kind: "matchup", mine: garen, enemy: fiora, act: "enemy" }, "판정기 없이 공략 질문이면 상대를 바꾼 것");
eq(planTurn(state, [fiora], false, "new", undefined, "guide"), { kind: "pass" }, "판정기가 새 질문이라면 공략 질문도 새 질문");
eq(sideOfNewName("오공으로 하면 좀 나아?", ["오공"]), "mine", "~으로 하면");
eq(sideOfNewName("차라리 럭스로 가면 어때", ["럭스"]), "mine", "~로 가면");
eq(sideOfNewName("야스오 만나면 어떻게 해야 돼", ["야스오"]), "enemy", "~ 만나면");
eq(sideOfNewName("만약 상대가 다리우스면?", ["다리우스"]), "enemy", "상대가 ~");
eq(sideOfNewName("피오라는?", ["피오라"]), "enemy", "~는? 은 상대를 바꾼 것");
eq(sideOfNewName("카이사면 어떻게 해?", ["카이사"]), undefined, "~면 은 문형만으로 못 가린다");
eq(sideOfNewName("would wukong do better here?", ["Wukong"]), undefined, "영어 문형이 없으면 모른다");
eq(sideOfNewName("maybe i should just go lux, thoughts?", ["Lux"]), "mine", "go X");
eq(sideOfNewName("and if it's darius instead?", ["Darius"]), "enemy", "if it's X");
eq(sideOfNewName("what do i do when i get yasuo", ["Yasuo"]), "enemy", "get X");
eq(sideOfNewName("用猴子会不会好一点", ["猴子"]), "mine", "用X");
eq(sideOfNewName("遇到亚索该怎么打", ["亚索"]), "enemy", "遇到X");
eq(sideOfNewName("要是对面换成诺手呢", ["诺手"]), "enemy", "对面换成X");

for (const [q, want] of [
  ["다리우스 입장에서는?", "flip"], ["반대로 내가 다리우스면?", "flip"], ["what's it like from Darius's side?", "flip"], ["反过来呢", "flip"],
  ["왜?", "more"], ["방금 말한 거 좀 풀어서 설명해줄래", "more"], ["wait why is that", "more"], ["这是为啥啊", "more"],
  ["항복 몇 분부터 돼?", "new"], ["what minute can we ff?", "new"], ["랭겜 닷지하면 LP 얼마나 까여?", "new"], ["几分钟能投降啊", "new"],
  ["그럼 한타 때는?", undefined], ["뭐 사야 돼", undefined], ["how do i lane?", undefined],
] as const) eq(actFromWords(q), want, `문형: ${q}`);

eq(ACT_LABELS, ["followup", "more", "enemy", "mine", "flip", "new"], "선택지 순서는 학습 순서");
eq(actFromProbs([0.1, 0.1, 0.1, 0.1, 0.5, 0.1]), "flip", "가장 큰 확률");
eq(Object.keys(actCriteria("a", "b")).length, 6, "선택지 여섯");
eq(
  actState("가렌", "다리우스", "피오라는?", "피오라"),
  "Earlier in this chat the user asked how to play 가렌 against 다리우스.\nNew message: 피오라는?\nChampion named in the new message: 피오라",
  "학습 자료와 같은 꼴",
);

const card = (id: string) => ({ id }) as never;
const compare = (ids: string[], matchup: boolean) => ({ kind: "compare", cards: ids.map(card), rows: [], matchup }) as unknown as AdvisorAnswer;
eq(matchupStateOf([compare(["Garen", "Darius"], true)])?.mine, card("Garen"), "상성 답의 앞이 내 챔피언");
eq(matchupStateOf([compare(["Garen", "Darius"], true), undefined]), { mine: card("Garen"), enemy: card("Darius") }, "사용자 말(답 없음)은 건너뛴다");
eq(matchupStateOf([compare(["Garen", "Darius"], true), compare(["Garen", "Fiora"], false)]), undefined, "능력치 비교가 더 최근이면 상성 맥락은 끝났다");
eq(matchupStateOf([compare(["Garen", "Darius"], true), { kind: "rule" } as unknown as AdvisorAnswer]), { mine: card("Garen"), enemy: card("Darius") }, "룬 답은 상성 맥락을 끊지 않는다");

console.log(`✅ 대화 상태 통과 (${checks}건)`);
