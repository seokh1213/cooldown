/**
 * 주제·관점 판정을 쓰는 쪽 시험
 *
 * 판정기가 가른 주제·관점이 노트 고르기와 요약에 그대로 반영되는지 본다. 헤드 자체의
 * 정확도는 `scripts/llm/eval-judge-browser.ts` 와 학습 기록(README)이 잰다.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ChampionCard } from "./llm/lib/facts";
import type { Playbook } from "./llm/lib/playbookCore";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./llm/lib/data";
import { askedSlot, selectNotes } from "../src/lib/advisor/noteSelect";
import { championNotes, matchupNotes, type AdvisorData } from "../src/lib/advisor/context";
import { buildCompareAnswer } from "../src/lib/advisor/answer";
import { answerProse } from "../src/lib/advisor/prose";
import { topicFromWords } from "../src/lib/advisor/topicJudge";
import { TOPIC_CRITERIA, TOPIC_LABELS, topicFromJudge, topicQuestions } from "../src/lib/advisor/topicJudge";
import { TOPIC_TEST } from "./llm/lib/topicCases";

let checks = 0;
const eq = (actual: unknown, expected: unknown, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};
const ok = (value: unknown, message: string) => {
  assert.ok(value, message);
  checks += 1;
};

const root = path.join(PUBLIC_DATA_ROOT, resolvePatchVersion());
const cards = (JSON.parse(fs.readFileSync(path.join(root, "llm", "champion-cards-ko_KR.json"), "utf8")) as { cards: ChampionCard[] }).cards;
const knowledge = JSON.parse(fs.readFileSync(path.join(root, "llm", "advisor-knowledge.json"), "utf8")) as { playbooks: Record<string, Playbook> };
const items = (JSON.parse(fs.readFileSync(path.join(root, "items-normalized-ko_KR.json"), "utf8")) as { items: unknown[] }).items;
const data = { cards, items, cardById: new Map(cards.map((c) => [c.id, c])), playbooks: new Map(Object.entries(knowledge.playbooks)) } as unknown as AdvisorData;
const card = (id: string) => data.cardById.get(id)!;

// --- 질문 꼴: 선택지 순서가 헤드가 배운 순서와 같다 ---
{
  const [topic, perspective] = topicQuestions(1, true);
  eq(topic.options.map((o) => o.name), TOPIC_LABELS, "주제 선택지 순서");
  eq(perspective.options.map((o) => o.name), ["playing", "against", "both"], "관점 선택지 순서");
  eq(topicQuestions(2, true).length, 1, "챔피언이 둘이면 관점은 묻지 않는다");
  eq(topicQuestions(1).length, 1, "앱은 기본으로 주제만 묻는다");
  eq(topicFromJudge([0, 0, 0, 0, 0.9, 0.1, 0, 0], [0.1, 0.8, 0.1]), { topic: "situational-item", perspective: "against" }, "가장 높은 것을 고른다");
  eq(topicFromJudge([0.45, 0.4, 0, 0, 0.15, 0, 0, 0]).topic, "general", "확신이 0.6 에 못 미치면 한 갈래로 몰지 않는다");
  ok(Object.keys(TOPIC_CRITERIA).length === 8, "주제는 여덟");
  // 시험 문항의 정답이 모두 선택지 안에 있다
  for (const c of TOPIC_TEST) ok(TOPIC_LABELS.includes(c.topic), `정답 갈래가 선택지에 있다: ${c.question}`);
}

// --- 지목한 스킬 ---
eq(askedSlot("제드 궁 피하는 법"), "R", "궁 → R");
eq(askedSlot("How to dodge Zed ult"), "R", "ult → R");
eq(askedSlot("怎么躲影流之主的大招"), "R", "大招 → R");
eq(askedSlot("럭스 E 어떻게 써"), "E", "슬롯 문자");
eq(askedSlot("궁금한데 야스오 어때"), undefined, "궁금 은 궁이 아니다");

// --- 판정한 주제·관점이 노트 고르기를 바꾼다 ---
{
  const zed = data.playbooks.get("Zed")!;
  const judged = selectNotes(zed, "How to dodge Zed ult", undefined, { topic: "skill", perspective: "against" });
  eq(judged.perspective, "against", "판정한 관점을 쓴다(영어 문장이라 낱말 표로는 못 가린다)");
  ok(/(?<![A-Za-z])R(?![A-Za-z])/.test(judged.against[0]), `지목한 R 을 말하는 노트가 먼저: ${judged.against[0]}`);
  const rules = selectNotes(zed, "How to dodge Zed ult");
  eq(rules.perspective, "both", "판정이 없으면 예전처럼 낱말 표로 — 영어는 못 가린다");
}

// --- 상성 요약: 주제가 칸 순서와 제목을 정한다 ---
{
  const digest = (focus?: string) => {
    const notes = matchupNotes(data, card("MonkeyKing"), card("Rumble"), "ko_KR");
    if (notes.plan && focus) notes.plan.focus = focus;
    return answerProse(buildCompareAnswer([card("MonkeyKing"), card("Rumble")], "q", undefined, { matchup: true, notes, lang: "ko_KR" }), "ko_KR");
  };
  ok(digest().startsWith("**조심할 것**"), "주제가 없으면 조심할 것부터");
  ok(digest("situational-item").startsWith("**아이템**"), "아이템을 물으면 아이템부터");
  ok(/\*\*아이템\*\*\n(?:[^.\n]+\.\s?){3}/.test(digest("situational-item")), "아이템을 물으면 세 문장까지");
  ok(digest("laning").startsWith("**라인전**"), "라인전을 물으면 칸 제목이 라인전");
  ok(digest("teamfight").startsWith("**한타**"), "한타를 물으면 칸 제목이 한타");
}

// --- 챔피언 하나: 물은 쪽을 먼저, 세 문장 ---
{
  const notes = championNotes(data, card("Zed"), "How to dodge Zed ult", undefined, { topic: "skill", perspective: "against" });
  const text = answerProse({ kind: "champion", card: card("Zed"), notes }, "ko_KR");
  ok(text.startsWith("**상대할 때**"), "상대하는 질문은 상대할 때부터");
  ok(/\*\*플레이할 때\*\*/.test(text), "묻지 않은 쪽도 한 줄은 붙인다");
}

// 갈래를 못 박는 낱말은 판정기보다 먼저다. 판정기는 상성 문항에서 "한타" 를 라인전으로 갈랐다.
eq(topicFromWords("가렌으로 다리우스 있는 한타 어떻게 해?", ["가렌", "다리우스"]), "teamfight", "한타");
eq(topicFromWords("리븐으로 레넥톤 라인전 어떻게 해?", ["리븐", "레넥톤"]), "laning", "라인전");
eq(topicFromWords("잭스로 피오라 상대할 때 피오라 W 어떻게 빼?", ["잭스", "피오라"]), "skill", "이름 바로 뒤의 슬롯은 스킬");
eq(topicFromWords("제드 궁 어떻게 피해", ["제드"]), "skill", "이름 뒤의 궁");
eq(topicFromWords("오공으로 럼블 상대할 때 아이템 뭐 가?", ["오공", "럼블"]), "situational-item", "아이템");
eq(topicFromWords("세트로 모데카이저 상대하면 후반 어때?", ["세트", "모데카이저"]), "phase", "후반");
eq(topicFromWords("제드로 럭스 상대할 때 언제 들어가?", ["제드", "럭스"]), "escape-window", "언제 들어가");
eq(topicFromWords("What should I build as Wukong against Rumble?"), "situational-item", "영어 build");
eq(topicFromWords("剑魔团战怎么打"), "teamfight", "중국어 团战");
// 낱말이 없으면 판정기에 맡긴다. 넓은 말("들어가", "라인")로 가르지 않는다.
eq(topicFromWords("오공으로 럼블이 너무어려운데 팁이 없나?", ["오공", "럼블"]), undefined, "낱말 없음");
eq(topicFromWords("탑 라인 다리우스 짜증나", ["다리우스"]), undefined, "라인 한 글자로는 가르지 않는다");
eq(topicFromWords("템빨로 이기는 챔피언이야?", []), undefined, "낱말 속 템은 아이템이 아니다");
eq(topicFromWords("잭스 상대로 피오라 할 때 탑 갱 오는 정글이 녹턴이면?", ["잭스", "피오라", "녹턴"]), "laning", "갱");
eq(topicFromWords("How do I survive ganks as Vayne?"), "laning", "gank");
eq(topicFromWords("갱플랭크 통 어떻게 써?", ["갱플랭크"]), undefined, "이름 속 갱은 갱이 아니다");

console.log(`✅ 주제 판정 통과 (${checks}건)`);
