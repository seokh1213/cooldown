/**
 * 답 고르기 순서 시험 — `planAnswer` 가 지금 어느 길로 답하는지, 판정기·검색을 몇 번 어떤 순서로 부르는지
 *
 * 기대값은 예상으로 적지 않았다. 옮기기만 한 코드(solve → planAnswer)를 돌려 얻은 값이다(특성 시험).
 * 모양을 바꾼 뒤에도 한 글자도 달라지면 안 된다. 동작을 바꾸려면 이 표를 함께 고친다.
 *
 * 판정기는 가짜다. 문항마다 갈래·내 챔피언·주제·흐름을 정해 주고, 정해 주지 않은 것을 물으면 거절한다
 * (앱에서 판정이 실패한 것과 같다). 검색 벡터도 정해 준 점수를 돌려준다.
 *
 * 판정기 단계(`PlanContext.judge`)는 세 가지다. `model`(판정기·검색 벡터·동의 있음), `offline`(모델 없는 기기의 오프라인 판정기 —
 * 판정기는 있지만 동의·검색 벡터가 없다), 둘 다 아니면 `none`(판정기 없이 낱말 규칙만). 오프라인 판정기의 확률 자체는
 * `tests/unit/offline-judge.test.ts` 가 파이썬과 맞춰 보고, 여기서는 같은 가짜로 "판정기는 부르되 동의·검색 없는 길" 만 본다.
 *
 *   RECORD=1 npx tsx tests/data/advisor-plan.test.ts   지금 값을 표 꼴로 찍는다
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { koKRTranslations } from "../../src/i18n/koKRTranslations";
import { enUSTranslations } from "../../src/i18n/enUSTranslations";
import { zhCNTranslations } from "../../src/i18n/zhCNTranslations";
import type { Language } from "../../src/i18n";
import type { AdvisorAnswer } from "../../src/lib/advisor/answer";
import { planAnswer, type AnswerPlan, type JudgeTier, type PlanContext, type PlanTurn } from "../../src/lib/advisor/plan";
import { JUDGE_KIND_INSTRUCTIONS, JUDGE_MINE_INSTRUCTIONS } from "../../src/lib/advisor/routeAsk";
import { TOPIC_INSTRUCTIONS } from "../../src/lib/advisor/topicJudge";
import { ACT_INSTRUCTIONS } from "../../src/lib/advisor/conversation";
import type { JudgeQuestion } from "../../src/lib/advisor/judge";
import { loadData, type Lang } from "../../scripts/llm/kev-agent/lib";

type Asked = "kind" | "mine" | "topic" | "act";
const ASKED: Record<string, Asked> = {
  [JUDGE_KIND_INSTRUCTIONS]: "kind",
  [JUDGE_MINE_INSTRUCTIONS]: "mine",
  [TOPIC_INSTRUCTIONS]: "topic",
  [ACT_INSTRUCTIONS]: "act",
};

interface Case {
  name: string;
  question: string;
  lang?: Lang;
  /** 모델 판정기·검색 벡터를 쓸 수 있고 동의했다. `offline` 도 아니면 판정기 없이 낱말 규칙만 */
  model?: boolean;
  /** 모델 없는 기기의 오프라인 판정기(동의 전, 검색 벡터 없음). 판정기는 `judge` 의 가짜 그대로 */
  offline?: boolean;
  /** 모델은 있는데 검색 벡터 가지가 없다 */
  noRetrieval?: boolean;
  /** 가짜 판정기가 고를 이름. 없는 것을 물으면 거절한다 */
  judge?: Partial<Record<Asked, string>>;
  /** 가짜 검색 벡터의 결과. "fail" 이면 거절한다 */
  search?: Array<{ id: string; score: number }> | "fail";
  turns?: PlanTurn[];
  screen?: string[];
  notice?: string;
  want: string;
  calls: string[];
}

const copyOf = (lang: Lang) => (lang === "en_US" ? enUSTranslations : lang === "zh_CN" ? zhCNTranslations : koKRTranslations).advisor;

const card = (lang: Lang, id: string) => {
  const found = loadData(lang).cardById.get(id);
  assert.ok(found, id);
  return found;
};
const answered = (answer: AdvisorAnswer): PlanTurn[] => [{ role: "user" }, { role: "assistant", answer }];
/** 방금 상성을 답한 대화. `focus` 는 그 답이 앞세운 칸 */
const matchupTurns = (mine: string, enemy: string, focus?: string, lang: Lang = "ko_KR"): PlanTurn[] =>
  answered({
    kind: "compare",
    cards: [card(lang, mine), card(lang, enemy)],
    rows: [],
    matchup: true,
    notes: focus ? { plan: { focus } } : undefined,
  } as unknown as AdvisorAnswer);
const championTurns = (id: string): PlanTurn[] => answered({ kind: "champion", card: card("ko_KR", id) });

function describeAnswer(answer: AdvisorAnswer | string, lang: Lang): string {
  if (typeof answer === "string") {
    const copy = copyOf(lang);
    const named = Object.entries({ ...copy, relatedPrompt: copy.card.relatedPrompt }).find(([, value]) => value === answer)?.[0];
    if (named) return `copy.${named}`;
    if (answer.endsWith(`\n\n${copy.fromNotes}`)) return `notes "${answer.slice(0, 24)}"`;
    return `text "${answer.slice(0, 24)}"`;
  }
  switch (answer.kind) {
    case "spell":
      return `spell ${answer.championId} ${answer.spell.slot}${answer.focus ? ` focus=${answer.focus}` : ""}`;
    case "champion":
      return `champion ${answer.card.id}${answer.view ? ` view=${answer.view}` : ""}${answer.focus ? ` focus=${answer.focus}` : ""}${answer.notes ? ` notes=${answer.notes.perspective} ${answer.notes.playing.length}/${answer.notes.against.length} "${(answer.notes.playing[0] ?? answer.notes.against[0] ?? "").slice(0, 12)}"` : ""}`;
    case "rule":
      return `rule ${answer.rule.name} highlighted=${answer.highlighted.length}`;
    case "suggestion":
      return `suggestion "${answer.original}" [${answer.candidates.map((c) => c.id).join(",")}]${answer.reason ? ` ${answer.reason}` : ""}`;
    case "compare":
      return `compare ${answer.cards.map((c) => c.id).join(",")}${answer.slot ? ` slot=${answer.slot}` : ""}${answer.matchup ? " matchup" : ""}`;
    case "item":
      return `item ${answer.itemId} verdicts=${answer.verdicts.length}`;
    case "text":
      return `text "${answer.text.slice(0, 24)}"`;
  }
}

function describe(plan: AnswerPlan, lang: Lang): string {
  const notice = "notice" in plan && plan.notice ? ` · ${plan.notice}` : "";
  switch (plan.type) {
    case "respond":
      return "respond";
    case "retry":
      return `retry "${plan.question}"${notice}`;
    case "matchup":
      return `matchup ${plan.mine.id}>${plan.enemy.id}${plan.focus ? ` focus=${plan.focus}` : ""}${plan.more ? " more" : ""}${notice}`;
    case "card":
      return `card ${describeAnswer(plan.answer, lang)}${notice}`;
    case "code":
      return `code ${describeAnswer(plan.answer, lang)}${plan.pending ? " pending" : ""}${plan.related ? ` related=[${plan.related.map((doc) => doc.id).join(",")}]` : ""}${notice}`;
  }
}

async function run(c: Case): Promise<{ want: string; calls: string[] }> {
  const lang = c.lang ?? "ko_KR";
  const calls: string[] = [];
  const judge = async (_head: string, _state: string, questions: JudgeQuestion[]) => {
    const asked = questions.map((q) => ASKED[q.instructions] ?? q.instructions);
    const picks = asked.map((what) => c.judge?.[what as Asked]);
    const refused = picks.some((pick) => pick === undefined);
    calls.push(`judge ${asked.join("+")}${refused ? " (refused)" : ""}`);
    if (refused) throw new Error("가짜 판정기: 정해 주지 않은 질문");
    return questions.map((q, i) => {
      const at = q.options.findIndex((option) => option.name === picks[i]);
      assert.ok(at >= 0, `${c.name}: 선택지에 ${picks[i]} 없음`);
      return q.options.map((_, j) => (j === at ? 1 : 0));
    });
  };
  const search = async () => {
    calls.push("search");
    if (c.search === "fail") throw new Error("가짜 검색 실패");
    return c.search ?? [];
  };
  // 검색 실패는 경고를 남기고 낱말 길로 간다. 경고도 부른 순서에 적는다.
  const warn = console.warn;
  console.warn = () => calls.push("warn");
  const tier: JudgeTier = c.model ? "model" : c.offline ? "offline" : "none";
  const ctx: PlanContext = {
    data: loadData(lang),
    lang: lang as Language,
    copy: copyOf(lang),
    turns: c.turns ?? [],
    championIds: c.screen ?? [],
    consented: Boolean(c.model),
    canUseModel: Boolean(c.model),
    retrieval: Boolean(c.model) && !c.noRetrieval,
    judge: tier,
    notice: c.notice,
  };
  try {
    return { want: describe(await planAnswer(c.question, ctx, { judge, search }), lang), calls };
  } finally {
    console.warn = warn;
  }
}

const CASES: Case[] = [
  // --- 모델 없이 써보기(판정기·검색 없음) ---
  { name: "잡담", question: "고마워 덕분에 이겼다", want: "code copy.smallTalk", calls: [] },
  { name: "룬 판정: 함께 부른 규칙의 문장", question: "정복자에 점화 들어가?", want: "card rule 점화 highlighted=1", calls: [] },
  { name: "게임 요소만 걸리고 게임 메타가 있으면 메타", question: "미니언 웨이브 생성 주기", want: "code text \"미니언 웨이브는 0분 30초부터 30초마다 \"", calls: [] },
  { name: "상성 대화 중 주문 쓰임새는 규칙 카드가 아니다", question: "점멸 빠지면 물어도 돼?", turns: matchupTurns("Garen", "Darius"), want: "matchup Garen>Darius · 앞서 말한 가렌 vs 다리우스 기준입니다.", calls: [] },
  { name: "상성 대화 밖의 주문 질문은 규칙 카드", question: "점멸 빠지면 물어도 돼?", want: "card rule 점멸 highlighted=0", calls: [] },
  { name: "오타 하나는 고쳐 다시 묻는다(말파이트 화면)", question: "럼미 E", screen: ["Malphite"], want: "retry \"럼블 E\" · 럼블로 이해했습니다.", calls: [] },
  { name: "오타 후보가 여럿이면 고르게 한다", question: "제라 e", want: "code suggestion \"제라\" [Zeri,Zed] pending", calls: [] },
  { name: "상성 대화 중 두 글자 낱말은 오타로 보지 않는다", question: "라인 어떻게 서", turns: matchupTurns("Garen", "Darius"), want: "matchup Garen>Darius · 앞서 말한 가렌 vs 다리우스 기준입니다.", calls: [] },
  { name: "챔피언 + 아이템 가격은 아이템 가격('가격' 을 가렌 오타로 보지 않는다)", question: "피오라 굶주린 히드라 가격", want: "code item 3074 verdicts=0", calls: [] },
  { name: "챔피언 가격", question: "피오라 가격 얼마야", want: "code text \"피오라의 상점 가격은 블루 정수 2,400 \"", calls: [] },
  { name: "게임 메타", question: "항복 몇 분부터 돼?", want: "code text \"소환사의 협곡에서는 15분부터 항복 투표를 \"", calls: [] },
  { name: "상성 이어 묻기(판정기 없이)", question: "그럼 한타 때는?", turns: matchupTurns("Garen", "Darius"), want: "matchup Garen>Darius focus=teamfight · 앞서 말한 가렌 vs 다리우스 기준입니다.", calls: [] },
  { name: "상성 이어 묻기: 입장 뒤집기 문형", question: "다리우스 입장에서는?", turns: matchupTurns("Garen", "Darius"), want: "matchup Darius>Garen · 앞서 말한 다리우스 vs 가렌 기준입니다.", calls: [] },
  { name: "상성 이어 묻기: 더 자세히는 앞 칸을 잇는다", question: "왜?", turns: matchupTurns("Garen", "Darius", "laning"), want: "matchup Garen>Darius focus=laning more · 앞서 말한 가렌 vs 다리우스 기준입니다.", calls: [] },
  { name: "상성 이어 묻기: 새 상대(문형)", question: "피오라 만나면 어떻게 해야 돼", turns: matchupTurns("Garen", "Darius"), want: "matchup Garen>Fiora · 앞서 말한 가렌 vs 피오라 기준입니다.", calls: [] },
  { name: "상성 대화 중 무관한 말", question: "내일 날씨 어때?", turns: matchupTurns("Garen", "Darius"), want: "code copy.noLiteAnswer", calls: [] },
  { name: "상성 대화 중 스킬 쿨타임은 해설이 아니라 두 챔피언 표", question: "두 챔피언에 대해 스킬 쿨타임도 알려줘", turns: matchupTurns("MonkeyKing", "Rumble"), want: "card compare MonkeyKing,Rumble · 앞서 말한 오공·럼블 기준입니다.", calls: [] },
  { name: "상성 대화 중 W 쿨타임은 두 W", question: "W 쿨타임 알려줘", turns: matchupTurns("MonkeyKing", "Rumble"), want: "card compare MonkeyKing,Rumble slot=W · 앞서 말한 오공·럼블 기준입니다.", calls: [] },
  { name: "상성 대화 중 쿨 빠진 때는 상성 이어 묻기", question: "궁 쿨 빠지면 들어가도 돼?", turns: matchupTurns("MonkeyKing", "Rumble"), want: "matchup MonkeyKing>Rumble · 앞서 말한 오공 vs 럼블 기준입니다.", calls: [] },
  { name: "상성 대화 중 아이템 이름은 새 질문", question: "쇼진의 창 효과", turns: matchupTurns("Garen", "Darius"), want: "code item 3161 verdicts=0", calls: [] },
  { name: "상성 대화 중 영어 ult 쿨타임은 두 R", question: "give me the ult cooldowns for both", lang: "en_US", turns: matchupTurns("Garen", "Darius", undefined, "en_US"), want: "card compare Garen,Darius slot=R · Using Garen·Darius from earlier in this chat.", calls: [] },
  { name: "상성 대화 중 중국어 大招 CD 는 두 R", question: "两人大招CD各是多少", lang: "zh_CN", turns: matchupTurns("Garen", "Darius", undefined, "zh_CN"), want: "card compare Garen,Darius slot=R · 以刚才提到的 德玛西亚之力·诺克萨斯之手 为准。", calls: [] },
  // "champions" 가 "챔피언 분류" 절의 검색어였다. 갈래를 한 곳(`askFromWords`)에서 정한 뒤로는 모델 없이도 영어 "cooldowns" 가
  // 스킬 수치 갈래가 되어 대화의 두 챔피언 표로 답한다(그 전에는 대화 챔피언을 붙이지 못해 모델에게 넘어갔다 — 문서가 아니라는 것이 요점)
  { name: "상성 대화 중 영어 champions 는 문서 검색어가 아니다", question: "show me both champions' ability cooldowns", lang: "en_US", turns: matchupTurns("Garen", "Darius", undefined, "en_US"), want: "card compare Garen,Darius · Using Garen·Darius from earlier in this chat.", calls: [] },
  { name: "상성 대화 중 쿨감 템 조언은 아이템 이어 묻기", question: "쿨감 템 먼저 가는 게 나아?", turns: matchupTurns("Garen", "Darius"), want: "matchup Garen>Darius focus=situational-item · 앞서 말한 가렌 vs 다리우스 기준입니다.", calls: [] },
  { name: "상성 대화 중 영어 cdr 템 조언은 아이템 이어 묻기", question: "should I rush a cdr item?", lang: "en_US", turns: matchupTurns("Garen", "Darius", undefined, "en_US"), want: "matchup Garen>Darius focus=situational-item · Using Garen vs Darius from earlier in this chat.", calls: [] },
  { name: "상성 대화 중 중국어 冷却缩减 장비 조언은 아이템 이어 묻기", question: "先出冷却缩减装备好吗", lang: "zh_CN", turns: matchupTurns("Garen", "Darius", undefined, "zh_CN"), want: "matchup Garen>Darius focus=situational-item · 以刚才提到的 德玛西亚之力 vs 诺克萨斯之手 为准。", calls: [] },
  { name: "상성 대화 중 갈래 낱말 없는 쿨타임 감소 계산은 게임 원리 문서", question: "쿨타임 감소 계산 어떻게 해?", turns: matchupTurns("Garen", "Darius"), want: "code text \"### 스킬 가속\n```\n쿨타임 감소율 = \"", calls: [] },
  { name: "상성 대화 밖의 쿨타임 감소 계산은 게임 원리 문서", question: "쿨타임 감소 계산 어떻게 해?", want: "code text \"### 스킬 가속\n```\n쿨타임 감소율 = \"", calls: [] },
  { name: "상대법 + 앞 대화의 다른 챔피언은 상성이 아니라 공략", question: "말파이트 상대법", turns: championTurns("Garen"), want: "card champion Malphite notes=against 1/4 \"말파이트에게 방어력은 \"", calls: [] },
  { name: "챔피언 카드 뒤의 '그럼 템은?' 은 그 챔피언의 아이템 노트(모델 없음)", question: "그럼 템은?", turns: championTurns("Jayce"), want: "card champion Jayce notes=both 3/3 \"상대가 회복으로 버티는\" · 앞서 말한 제이스 기준입니다.", calls: [] },
  { name: "챔피언 카드 뒤의 '그럼 템은?' 은 그 챔피언의 아이템 노트(판정기 item)", question: "그럼 템은?", model: true, judge: { kind: "item", topic: "situational-item" }, turns: championTurns("Jayce"), want: "card champion Jayce notes=both 3/3 \"상대가 회복으로 버티는\" · 앞서 말한 제이스 기준입니다.", calls: ["judge kind"] },
  { name: "챔피언 카드 뒤의 '그럼 한타 때는?' 은 그 챔피언의 한타 노트(모델 없음)", question: "그럼 한타 때는?", turns: championTurns("Jayce"), want: "card champion Jayce notes=both 3/3 \"한타는 뒤에서 캐논 Q\" · 앞서 말한 제이스 기준입니다.", calls: [] },
  { name: "챔피언 카드 뒤의 '그럼 한타 때는?' 은 그 챔피언의 한타 노트(판정기 guide)", question: "그럼 한타 때는?", model: true, judge: { kind: "guide", topic: "teamfight" }, turns: championTurns("Jayce"), want: "card champion Jayce notes=both 3/3 \"한타는 뒤에서 캐논 Q\" · 앞서 말한 제이스 기준입니다.", calls: ["judge kind"] },
  { name: "스킬 카드 뒤의 '그럼 궁은?' 은 그 챔피언의 궁(판정기가 그 밖이라 해도 슬롯이면 챔피언 질문)", question: "그럼 궁은?", model: true, judge: { kind: "chat" }, search: [], turns: answered({ kind: "spell", championId: "Rumble", championName: "럼블", spell: card("ko_KR", "Rumble").spells.find((s) => s.slot === "E")!, facts: [], highlighted: [] } as unknown as AdvisorAnswer), want: "card spell Rumble R · 앞서 말한 럼블 기준입니다.", calls: ["judge kind"] },
  { name: "아이템 카드 뒤의 '가격은?' 은 그 아이템의 가격(판정기·검색이 있어도)", question: "가격은?", model: true, judge: { kind: "item" }, search: [{ id: "mech:아이템-등급", score: 0.4 }], turns: answered({ kind: "item", itemId: "3161", itemName: "쇼진의 창", price: 3100, stats: [], effects: [], verdicts: [] } as unknown as AdvisorAnswer), want: "code item 3161 verdicts=0", calls: ["judge kind"] },
  { name: "'A vs B' 는 A 가 내 챔피언", question: "나서스 vs 다리우스", want: "matchup Nasus>Darius", calls: [] },
  { name: "이름 둘 + 비교 낱말 + 능력치 낱말은 판정기가 상성이라 해도 능력치 표", question: "아리 vs 럼블 누가 더 빨라?", model: true, judge: { kind: "matchup", mine: "아리" }, want: "card compare Ahri,Rumble", calls: ["judge kind+mine"] },
  { name: "상성 대화 중 '그럼 궁은?' 은 판정기가 잡담이라 해도 두 챔피언의 궁", question: "그럼 궁은?", model: true, judge: { kind: "chat" }, search: [], turns: matchupTurns("MonkeyKing", "Rumble"), want: "card compare MonkeyKing,Rumble slot=R · 앞서 말한 오공·럼블 기준입니다.", calls: ["judge kind"] },
  { name: "상성 대화 중 같은 쌍의 이름 + 슬롯만 던지면 그 스킬 카드", question: "럼블 E", model: true, judge: { kind: "spellStat", act: "followup" }, turns: matchupTurns("MonkeyKing", "Rumble"), want: "card spell Rumble E", calls: ["judge kind"] },
  { name: "상성 대화 중 같은 쌍의 이름 + 슬롯 + 운용 질문은 이어 묻기", question: "럼블 E 어떻게 피해?", model: true, judge: { kind: "guide", act: "followup", topic: "skill" }, turns: matchupTurns("MonkeyKing", "Rumble"), want: "matchup MonkeyKing>Rumble focus=skill · 앞서 말한 오공 vs 럼블 기준입니다.", calls: ["judge kind", "judge act"] },
  { name: "앞 대화 챔피언 + 새 이름 상성", question: "제이스랑 상대한다 생각하면", turns: championTurns("Malphite"), want: "matchup Malphite>Jayce", calls: [] },
  { name: "앞 대화 챔피언 + 새 이름 상성(판정기 guide 여도 상성 낱말이면 짝짓기)", question: "제이스랑 상대한다 생각하면", model: true, judge: { kind: "guide", topic: "general" }, turns: championTurns("Garen"), want: "matchup Garen>Jayce focus=general", calls: ["judge kind", "judge topic"] },
  { name: "이름 셋 상성은 자리 낱말 붙은 이름을 뺀다", question: "오공으로 럼블 상대할 때 아이번 정글이면 아이템 뭐 가?", want: "matchup MonkeyKing>Rumble · 오공 vs 럼블 상성으로 답합니다 (곁들인 이름: 아이번).", calls: [] },
  { name: "셋을 견주는 질문은 비교 표", question: "오공 럼블 아이번 중 누가 세?", want: "card compare MonkeyKing,Rumble,Ivern", calls: [] },
  { name: "이름 둘 상성: 조사가 시점", question: "럼블 상대로 오공 하는데 어떻게 해", want: "matchup MonkeyKing>Rumble", calls: [] },
  { name: "아이템", question: "쇼진의 창 효과", want: "code item 3161 verdicts=0", calls: [] },
  { name: "앞 대화의 아이템에 이어 묻기", question: "거기 둔화 있어?", turns: answered({ kind: "item", itemId: "3161", itemName: "쇼진의 창", stats: [], effects: [], verdicts: [] }), want: "code item 3161 verdicts=1", calls: [] },
  { name: "게임 원리", question: "스킬 가속이 뭐야", want: "code text \"### 스킬 가속\n```\n쿨타임 감소율 = \"", calls: [] },
  { name: "화면 챔피언의 스킬", question: "W 쿨타임", screen: ["Malphite"], want: "card spell Malphite W focus=cooldown · 화면의 말파이트 기준입니다.", calls: [] },
  { name: "VS 화면 둘 + 슬롯은 두 W 나란히", question: "W 쿨타임", screen: ["MonkeyKing", "Rumble"], want: "card compare MonkeyKing,Rumble slot=W · 화면의 오공·럼블 기준입니다.", calls: [] },
  { name: "VS 화면 둘 + 슬롯 없음은 누구 것인지 묻는다", question: "스킬 설명해줘", screen: ["MonkeyKing", "Rumble"], want: "code suggestion \"스킬 설명해줘\" [MonkeyKing,Rumble] ambiguous pending", calls: [] },
  { name: "VS 화면 둘 + 비교", question: "누가 체력 더 높아?", screen: ["MonkeyKing", "Rumble"], want: "card compare MonkeyKing,Rumble · 화면의 오공·럼블 기준입니다.", calls: [] },
  { name: "VS 화면 둘 + \"두 챔피언\" 은 규칙 문서가 아니라 나란히", question: "두 챔피언에 대해 스킬 쿨타임도 알려줘", screen: ["MonkeyKing", "Rumble"], want: "card compare MonkeyKing,Rumble · 화면의 오공·럼블 기준입니다.", calls: [] },
  { name: "모델이 있어도 \"두 챔피언\" 은 검색 벡터를 건너뛴다", question: "두 챔피언에 대해 스킬 쿨타임도 알려줘", model: true, search: [{ id: "mech:챔피언-분류-—-두-외부-출처를-함께-쓴다", score: 0.9 }], screen: ["MonkeyKing", "Rumble"], want: "card compare MonkeyKing,Rumble · 화면의 오공·럼블 기준입니다.", calls: ["judge kind (refused)"] },
  { name: "둘을 다룬 뒤의 스킬 쿨타임은 둘의 표(한쪽만 주면 나머지를 되물어야 한다)", question: "스킬 쿨타임", turns: answered({ kind: "compare", cards: [card("ko_KR", "Garen"), card("ko_KR", "Darius")], rows: [] }), want: "card compare Garen,Darius · 앞서 말한 가렌·다리우스 기준입니다.", calls: [] },
  { name: "대화 챔피언이 화면보다 먼저", question: "E 는?", turns: championTurns("Garen"), screen: ["Malphite"], want: "card spell Garen E · 앞서 말한 가렌 기준입니다.", calls: [] },
  { name: "챔피언 스킬 하나", question: "가렌 Q", want: "card spell Garen Q", calls: [] },
  { name: "패시브와 스킬 전체는 스킬 소개", question: "가렌 패시브와 네 가지 스킬을 각각 설명해줘", want: "card champion Garen view=skills notes=both 3/3 \"Q 결정타는 걸려 있는\"", calls: [] },
  { name: "효과 태그 예/아니오", question: "가렌 둔화 있어?", want: "code text \"아니요. 가렌에게는 둔화 스킬이 없습니다.\n\"", calls: [] },
  { name: "스킬 소개", question: "말파이트 스킬 설명해줘", want: "card champion Malphite view=skills notes=both 3/3 \"말파이트에게 방어력은 \"", calls: [] },
  { name: "스킬 사실 하나를 다섯 칸으로", question: "말파이트 스킬 쿨타임", want: "card champion Malphite focus=cooldown", calls: [] },
  { name: "챔피언 공략", question: "말파이트 어떻게 해", want: "card champion Malphite notes=both 3/3 \"말파이트에게 방어력은 \"", calls: [] },
  { name: "두 챔피언 비교", question: "가렌 다리우스 누가 체력 높아", want: "card compare Garen,Darius", calls: [] },
  { name: "이름 없는 질문은 모델 없으면 모델에게(동의 전 문구)", question: "갱킹 타이밍", want: "respond", calls: [] },
  { name: "영어 상성", question: "how do I play Yasuo into Malphite?", lang: "en_US", want: "matchup Yasuo>Malphite", calls: [] },

  // --- 판정기·검색 벡터 ---
  { name: "잡담은 상성 대화 중에도 먼저", question: "고마워 덕분에 이겼다", model: true, judge: { kind: "chat", act: "followup" }, turns: matchupTurns("Garen", "Darius"), want: "code copy.smallTalk", calls: [] },
  { name: "도우미 자신", question: "너는 누구야?", model: true, want: "code copy.identity", calls: [] },
  { name: "갈래 판정 + 주제 판정(이름 하나)", question: "말파이트 어떻게 해", model: true, judge: { kind: "guide", topic: "laning" }, want: "card champion Malphite notes=both 3/3 \"라인전은 Q로 갉고 화\"", calls: ["judge kind", "judge topic"] },
  { name: "주제 낱말이 있으면 주제 판정을 부르지 않는다", question: "말파이트 한타 어떻게 해", model: true, judge: { kind: "guide" }, want: "card champion Malphite notes=both 3/3 \"한타는 R을 어디에 박\"", calls: ["judge kind"] },
  { name: "이름 둘: 갈래 + 내 챔피언, 조사가 확실하면 조사", question: "오공으로 럼블 너무 어려운데 팁 없나?", model: true, judge: { kind: "matchup", mine: "럼블", topic: "general" }, want: "matchup MonkeyKing>Rumble focus=general", calls: ["judge kind+mine"] },
  { name: "이름 둘: 조사가 없으면 판정기의 내 챔피언", question: "오공 럼블 라인전", model: true, judge: { kind: "matchup", mine: "럼블" }, want: "matchup Rumble>MonkeyKing focus=laning", calls: ["judge kind+mine"] },
  { name: "판정기가 상성이 아니라 하면 비교·공략 길", question: "오공 럼블 라인전", model: true, judge: { kind: "guide", mine: "오공" }, want: "card compare MonkeyKing,Rumble", calls: ["judge kind+mine"] },
  { name: "판정기가 스킬 갈래면 스킬 소개", question: "말파이트 알려줘", model: true, judge: { kind: "skills", topic: "general" }, want: "card champion Malphite view=skills notes=both 3/3 \"말파이트에게 방어력은 \"", calls: ["judge kind", "judge topic"] },
  { name: "판정 실패는 낱말 규칙으로", question: "말파이트 알려줘", model: true, want: "card champion Malphite notes=both 3/3 \"말파이트에게 방어력은 \"", calls: ["judge kind (refused)", "judge topic (refused)"] },
  { name: "챔피언 하나 + 판정 게임 규칙이면 게임 메타", question: "킨드레드 하는 중인데 첫 바론 몇 분에 나와", model: true, judge: { kind: "game", topic: "general" }, want: "code text \"내셔 남작은 20분에 나오고, 잡히면 6분 \"", calls: ["judge kind"] },
  { name: "이름 없는 질문: 벡터가 답을 고른다", question: "점화 쿨타임 얼마야", model: true, judge: { kind: "spell" }, search: [{ id: "rule:점화", score: 0.7 }, { id: "meta:surrender", score: 0.3 }], want: "card rule 점화 highlighted=0", calls: ["judge kind", "search"] },
  { name: "이름 없는 질문: 문턱 사이면 가까운 자료", question: "그거 언제 나와", model: true, judge: { kind: "game" }, search: [{ id: "meta:dragon", score: 0.4 }, { id: "meta:elder", score: 0.38 }, { id: "meta:voidgrubs", score: 0.36 }], want: "code copy.relatedPrompt related=[meta:dragon,meta:elder,meta:voidgrubs]", calls: ["judge kind", "search"] },
  { name: "이름 없는 질문: 다 낮으면 자료 없음", question: "그거 언제 나와", model: true, judge: { kind: "game" }, search: [{ id: "meta:dragon", score: 0.2 }], want: "code copy.noLiteAnswer", calls: ["judge kind", "search"] },
  { name: "이름 없는 질문: 검색 실패면 낱말 길", question: "항복 몇 분부터 돼?", model: true, judge: { kind: "game" }, search: "fail", want: "code text \"소환사의 협곡에서는 15분부터 항복 투표를 \"", calls: ["judge kind", "search", "warn"] },
  { name: "검색 벡터 가지가 없으면 낱말 길: 게임 갈래 + 낱말 검색 빈손", question: "랭크 승급전 몇 판이야", model: true, noRetrieval: true, judge: { kind: "game" }, want: "code copy.noGameData", calls: ["judge kind"] },
  { name: "검색 벡터 가지가 없으면 낱말 길: 자료 문장 그대로", question: "시야 장악 어떻게 해", model: true, noRetrieval: true, judge: { kind: "other" }, want: "code notes \"**시야 점수**\n[시야 점수] 전투와 무관\"", calls: ["judge kind"] },
  { name: "검색 벡터 가지가 없으면 낱말 길: 걸린 것이 없으면 자료 없음", question: "갱킹 타이밍", model: true, noRetrieval: true, judge: { kind: "other" }, want: "code copy.noLiteAnswer", calls: ["judge kind"] },
  { name: "오타 후보가 있으면 벡터 검색을 하지 않는다", question: "럼미 E", model: true, judge: { kind: "skills" }, screen: ["Malphite"], want: "retry \"럼블 E\" · 럼블로 이해했습니다.", calls: ["judge kind"] },
  { name: "상성 대화: 판정기 흐름(새 상대)", question: "피오라는 어때", model: true, judge: { kind: "guide", act: "enemy", topic: "general" }, turns: matchupTurns("Garen", "Darius"), want: "matchup Garen>Fiora focus=general · 앞서 말한 가렌 vs 피오라 기준입니다.", calls: ["judge kind", "judge act", "judge topic"] },
  { name: "상성 대화: 판정기의 new 는 따르지 않는다", question: "정글이 자꾸 탑으로 오는데 그럴 땐?", model: true, judge: { kind: "guide", act: "new", topic: "phase" }, turns: matchupTurns("Garen", "Darius"), search: [{ id: "meta:dragon", score: 0.3 }], want: "matchup Garen>Darius focus=phase · 앞서 말한 가렌 vs 다리우스 기준입니다.", calls: ["judge kind", "judge act", "search", "judge topic"] },
  { name: "상성 대화: 벡터가 뚜렷하면 새 질문", question: "대룡 먹으면 버프 얼마나 가?", model: true, judge: { kind: "game" }, turns: matchupTurns("Garen", "Darius"), search: [{ id: "meta:elder", score: 0.6 }], want: "code text \"한 팀이 원소 드래곤 네 마리를 잡아 드래곤\"", calls: ["judge kind", "judge act (refused)", "search"] },
  { name: "상성 대화: 판정기 잡담 + 조언 요청 없음", question: "오늘 기분 좋다", model: true, judge: { kind: "chat" }, turns: matchupTurns("Garen", "Darius"), want: "code copy.noLiteAnswer", calls: ["judge kind", "judge act (refused)"] },
  { name: "상성 대화: 판정기 잡담이어도 조언 요청은 이어 묻기", question: "팁 좀 줘", model: true, judge: { kind: "chat", act: "followup", topic: "general" }, turns: matchupTurns("Garen", "Darius"), search: [], want: "matchup Garen>Darius focus=general · 앞서 말한 가렌 vs 다리우스 기준입니다.", calls: ["judge kind", "judge act", "search"] },
  { name: "상성 대화: 더 자세히는 주제 판정을 부르지 않는다", question: "좀 더 알려줘", model: true, judge: { kind: "guide", act: "more" }, turns: matchupTurns("Garen", "Darius", "teamfight"), search: [], want: "matchup Garen>Darius focus=teamfight more · 앞서 말한 가렌 vs 다리우스 기준입니다.", calls: ["judge kind", "judge act", "search"] },
  { name: "상성 대화: 새 챔피언 스킬 지목은 그 챔피언 스킬", question: "제드 궁 어떻게 피해", model: true, judge: { kind: "skills", act: "enemy", topic: "skill" }, turns: matchupTurns("Garen", "Darius"), want: "card spell Zed R focus=damage", calls: ["judge kind", "judge act"] },
  // 갈래는 하나(`Intent.ask`)다. 판정기가 가른 스킬 수치·스킬 소개는 이름이 없어도 상성 이어 묻기·검색 벡터보다 앞이다.
  { name: "상성 대화: 판정기가 스킬 수치라 하면 해설이 아니라 두 챔피언 표", question: "두 챔피언에 대해 스킬 쿨타임도 알려줘", model: true, judge: { kind: "spellStat", act: "followup" }, turns: matchupTurns("MonkeyKing", "Rumble"), want: "card compare MonkeyKing,Rumble · 앞서 말한 오공·럼블 기준입니다.", calls: ["judge kind"] },
  // "champions" 라 쓰면 게임 원리 "챔피언 분류" 절의 영어 검색어에 걸린다(색인은 미리 만든 자료라 여기서 못 고친다). 그 문제는 이 시험의 것이 아니다.
  { name: "상성 대화: 판정기가 스킬 수치라 하면(영어) 두 챔피언 표", question: "show me both champs' ability cooldowns", lang: "en_US", model: true, judge: { kind: "spellStat", act: "followup" }, turns: matchupTurns("MonkeyKing", "Rumble", undefined, "en_US"), want: "card compare MonkeyKing,Rumble · Using Wukong·Rumble from earlier in this chat.", calls: ["judge kind"] },
  // 흐름 판정기(ACT_HEAD)의 lookup: 갈래 판정기가 스킬 수치로 못 가른 말도 흐름이 "두 챔피언의 수치 조회" 면 해설이 아니라 둘의 표다
  { name: "상성 대화: 벡터가 문서를 골라도 흐름 판정 lookup 이 먼저(브라우저에서 '챔피언 분류' 절로 새던 길)", question: "두 챔피언에 대해 스킬 쿨타임도 알려줘", model: true, judge: { kind: "skills", act: "lookup" }, search: [{ id: "mech:스킬-가속", score: 0.9 }], turns: matchupTurns("MonkeyKing", "Rumble"), want: "card compare MonkeyKing,Rumble · 앞서 말한 오공·럼블 기준입니다.", calls: ["judge kind", "judge act"] },
  { name: "상성 대화 → 조회 표 → 그 다음 아이템 질문은 같은 상성의 이어 묻기(표가 상성 맥락을 끊지 않는다)", question: "어떤 템 가야 해?", turns: [...matchupTurns("MonkeyKing", "Rumble"), ...answered({ kind: "compare", cards: [card("ko_KR", "MonkeyKing"), card("ko_KR", "Rumble")], rows: [], inMatchup: true })], want: "matchup MonkeyKing>Rumble focus=situational-item · 앞서 말한 오공 vs 럼블 기준입니다.", calls: [] },
  { name: "상성 대화: 흐름 판정기가 lookup 이면 대화의 두 챔피언 표", question: "두 챔피언에 대해 스킬 쿨타임도 알려줘", model: true, judge: { kind: "guide", act: "lookup" }, turns: matchupTurns("MonkeyKing", "Rumble"), search: [], want: "card compare MonkeyKing,Rumble · 앞서 말한 오공·럼블 기준입니다.", calls: ["judge kind", "judge act"] },
  { name: "상성 대화: lookup + 스킬 슬롯은 그 슬롯의 표", question: "W 쿨타임 알려줘", model: true, judge: { kind: "guide", act: "lookup" }, turns: matchupTurns("MonkeyKing", "Rumble"), search: [], want: "card compare MonkeyKing,Rumble slot=W · 앞서 말한 오공·럼블 기준입니다.", calls: ["judge kind"] },
  { name: "상성 대화: 스킬 낱말이 있어도 흐름 판정기가 이어 묻기라 하면 상성", question: "궁 쿨 빠지면 들어가도 돼?", model: true, judge: { kind: "guide", act: "followup", topic: "skill" }, turns: matchupTurns("MonkeyKing", "Rumble"), search: [], want: "matchup MonkeyKing>Rumble focus=skill · 앞서 말한 오공 vs 럼블 기준입니다.", calls: ["judge kind", "judge act", "search", "judge topic"] },
  { name: "화면 챔피언 + 판정기 스킬 소개(영어)는 검색 벡터를 건너뛴다", question: "explain the abilities", lang: "en_US", model: true, judge: { kind: "skills", topic: "general" }, search: [{ id: "mech:스킬-가속", score: 0.9 }], screen: ["Malphite"], want: "card champion Malphite view=skills notes=both 3/3 \"For Malphite\" · Using Malphite from the current page.", calls: ["judge kind"] },
  { name: "판정기 없이 챔피언 하나 + 게임 메타 낱말은 게임 메타", question: "킨드레드 하는 중인데 첫 바론 몇 분에 나와", want: "code text \"내셔 남작은 20분에 나오고, 잡히면 6분 \"", calls: [] },
  { name: "재질문의 안내는 그대로 실린다", question: "럼블 E", notice: "럼블로 알아들었어요", screen: ["Malphite"], want: "card spell Rumble E · 럼블로 알아들었어요", calls: [] },
  { name: "영어 상성(판정기)", question: "how do I play Yasuo into Malphite?", lang: "en_US", model: true, judge: { kind: "matchup", mine: "Malphite", topic: "laning" }, want: "matchup Yasuo>Malphite focus=general", calls: ["judge kind+mine"] },

  // --- 오프라인 판정기(모델 없는 기기): 판정기는 부르되 동의·검색 벡터가 없다 ---
  { name: "오프라인: 갈래 + 주제 판정은 모델 판정기와 같은 길", question: "말파이트 어떻게 해", offline: true, judge: { kind: "guide", topic: "laning" }, want: "card champion Malphite notes=both 3/3 \"라인전은 Q로 갉고 화\"", calls: ["judge kind", "judge topic"] },
  { name: "오프라인: 판정 거절(파일 못 받음)은 낱말 규칙으로", question: "말파이트 알려줘", offline: true, want: "card champion Malphite notes=both 3/3 \"말파이트에게 방어력은 \"", calls: ["judge kind (refused)", "judge topic (refused)"] },
  { name: "오프라인: 이름 둘, 조사가 없으면 판정기의 내 챔피언", question: "오공 럼블 라인전", offline: true, judge: { kind: "matchup", mine: "럼블" }, want: "matchup Rumble>MonkeyKing focus=laning", calls: ["judge kind+mine"] },
  { name: "오프라인: 상성 대화 흐름(새 상대)은 검색 없이 판정기로", question: "피오라는 어때", offline: true, judge: { kind: "guide", act: "enemy", topic: "general" }, turns: matchupTurns("Garen", "Darius"), want: "matchup Garen>Fiora focus=general · 앞서 말한 가렌 vs 피오라 기준입니다.", calls: ["judge kind", "judge act", "judge topic"] },
  { name: "오프라인: 흐름 판정기의 lookup 은 두 챔피언 표", question: "두 챔피언에 대해 스킬 쿨타임도 알려줘", offline: true, judge: { kind: "guide", act: "lookup" }, turns: matchupTurns("MonkeyKing", "Rumble"), want: "card compare MonkeyKing,Rumble · 앞서 말한 오공·럼블 기준입니다.", calls: ["judge kind", "judge act"] },
  { name: "오프라인: 판정기의 new 는 따르지 않는다", question: "정글이 자꾸 탑으로 오는데 그럴 땐?", offline: true, judge: { kind: "guide", act: "new", topic: "phase" }, turns: matchupTurns("Garen", "Darius"), want: "matchup Garen>Darius focus=phase · 앞서 말한 가렌 vs 다리우스 기준입니다.", calls: ["judge kind", "judge act", "judge topic"] },
  { name: "오프라인: 판정기 잡담 + 조언 요청 없음은 자료 없음", question: "오늘 기분 좋다", offline: true, judge: { kind: "chat" }, turns: matchupTurns("Garen", "Darius"), want: "code copy.noLiteAnswer", calls: ["judge kind", "judge act (refused)"] },
  // 갈래 판정기가 있어도 이름 없는 질문은 동의 전이면 모델에게(동의 전 문구) — 낱말 검색 답은 동의한 기기의 것이다
  { name: "오프라인: 이름 없는 질문은 동의 전 문구", question: "갱킹 타이밍", offline: true, judge: { kind: "other" }, want: "respond", calls: ["judge kind"] },
  { name: "오프라인: 영어 상성은 문형 보정이 판정기보다 먼저", question: "how do I play Yasuo into Malphite?", lang: "en_US", offline: true, judge: { kind: "matchup", mine: "Malphite", topic: "laning" }, want: "matchup Yasuo>Malphite focus=general", calls: ["judge kind+mine"] },
];

test("자료가 없으면 모델에게", async () => {
  const noData = await planAnswer("가렌 Q", { data: null, lang: "ko_KR", copy: koKRTranslations.advisor, turns: [], championIds: [], consented: false, canUseModel: false, retrieval: false, judge: "none" }, {
    judge: () => Promise.reject(new Error("부르면 안 된다")),
    search: () => Promise.reject(new Error("부르면 안 된다")),
  });
  assert.equal(noData.type, "respond", "자료가 없으면 모델에게");
});

const record = Boolean(process.env.RECORD);
for (const c of CASES) {
  test(c.name, async () => {
    const got = await run(c);
    if (record) {
      console.log(`  ${c.name}: ${JSON.stringify(got.want)}, ${JSON.stringify(got.calls)}`);
      return;
    }
    assert.equal(got.want, c.want, `${c.name}: ${c.question}`);
    assert.deepEqual(got.calls, c.calls, `${c.name}: 판정기·검색 호출`);
  });
}
