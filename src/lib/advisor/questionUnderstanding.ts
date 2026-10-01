/** 질문의 이름·갈래·최근 대상을 한 번 읽고, 필요한 주제 판정은 지연한다. */
import { buildItemCard, type AdvisorData } from "./context";
import { answerChampionIds } from "./answer";
import { askFromWords } from "./askWords";
import { matchupSidesByPhrase } from "./matchupSides";
import { resolveQuestion, type QuestionInput } from "./resolvedQuestion";
import { JUDGE_KIND9_CRITERIA, JUDGE_KIND_INSTRUCTIONS, JUDGE_MINE_INSTRUCTIONS, judgeRouteState, routeFromKind9, type AskRoute } from "./routeAsk";
import { topicFromJudge, topicFromWords, topicQuestions } from "./topicJudge";
import { gameMetaAnswer } from "./gameMeta";
import { matchupStateOf } from "./conversation";
import { askedRules } from "./questionDocs";
import type { ChampionCard } from "@/lib/knowledge/facts";
import { type PlanTurn, type PlanContext, type PlanDeps, type Intent } from "./planTypes";
import { ROUTE_HEAD, TOPIC_HEAD } from "./judgeHeads";

/** 질문에 적힌 이름, 갈래(판정기 또는 낱말)·주제, 대화가 남긴 맥락을 모은다. 판정기는 여기서 한 번(이름이 있으면 두 번) 부른다. */
export async function understand(input: QuestionInput, ctx: PlanContext, data: AdvisorData, deps: PlanDeps): Promise<Intent> {
  const { text: question, champions, slot } = resolveQuestion(input, data);
  // 판정기가 어느 단계든(모델·오프라인) 있으면 부른다. 없으면(`none`) 낱말 규칙뿐이다.
  const judging = ctx.judge !== "none";
  const route = judging ? await judgeRoute(question, data, champions, deps) : undefined;
  const lastItem = recentItem(ctx.turns);
  // 낱말 규칙에는 자료 이름(룬·주문 규칙, 아이템, 게임 메타)이 걸렸는지만 넘긴다. 낱말 목록은 `askWords.ts` 에 있다.
  const ask =
    route?.kind ??
    askFromWords(question, {
      champions: champions.length,
      rule: askedRules(data, question)[0]?.subject,
      item: Boolean(buildItemCard(data, question, lastItem)),
      game: Boolean(gameMetaAnswer(question, ctx.lang)),
    });
  let topic: Promise<ReturnType<typeof topicFromJudge> | undefined> | undefined;
  return {
    question,
    ctx,
    data,
    ask,
    route,
    topic: () => (topic ??= judging ? judgeTopic(question, data, champions, deps) : Promise.resolve(undefined)),
    champions,
    matchup: matchupStateOf(ctx.turns.map((turn) => (turn.role === "assistant" ? turn.answer : undefined))),
    recent: recentChampions(data, ctx.turns),
    recentItem: lastItem,
    slot,
  };
}

/*
 * 질문이 무엇을 묻는지 **모델에게** 가리게 한다.
 *
 * 단계들의 규칙은 전부 한국어 낱말 목록이다. 세 언어로 재 보니 한국어 5/6,
 * 영어 1/6, 중국어 1/6 이었다 — 영어·중국어 사용자에게는 거의 아무것도 못 가린다.
 * 같은 문항을 모델에 물으니 4B 가 17/18 이다.
 *
 * 실패하거나 판정기가 없으면 `undefined` 로 두고 낱말 규칙(`askFromWords`)이 갈래를 낸다. 낱말 목록을
 * 지우지 않는 까닭이 이것이다 — 모델을 안 받은 사용자는 오프라인 판정기(`JudgeTier` offline)가 받지만, 그 파일마저
 * 못 받은 기기에도 답은 나와야 한다.
 */
async function judgeRoute(question: string, data: AdvisorData, named: ChampionCard[], deps: PlanDeps): Promise<AskRoute | undefined> {
  const names = named.map((card) => card.name);
  // 374문항에서 0.8B 가 글로 가르면 183, 옛 헤드(route-v2) 322, 4B 가 글로 가르면 310, kev 헤드 331 이었다.
  return deps
    .judge(ROUTE_HEAD, judgeRouteState(question, names), [
      { instructions: JUDGE_KIND_INSTRUCTIONS, options: Object.entries(JUDGE_KIND9_CRITERIA).map(([name, description]) => ({ name, description })) },
      ...(named.length >= 2 ? [{ instructions: JUDGE_MINE_INSTRUCTIONS, options: names.map((name) => ({ name })) }] : []),
    ])
    .then(([kind, mine]) => {
      const route = routeFromKind9(kind, mine, named);
      if (route.kind !== "matchup" || named.length < 2) return route;
      // 영어·중국어 문형이 시점을 정해 주면 그것을 따른다. 판정기가 가장 약한 자리다.
      const phrased = matchupSidesByPhrase(question, [named[0], named[1]], (card) => [card.name, ...(data.aliases.get(card.id) ?? [])]);
      return phrased ? { ...route, mine: phrased } : route;
    })
    .catch(() => undefined);
}

/*
 * 무엇을 묻는지(주제)도 판정기로 가른다. 노트 고르기와 요약의 칸 순서가 이것을
 * 따른다. 시험 72문항에서 낱말 표 25, 판정기 64 였다(영어·중국어 3 → 22·21).
 * 관점은 여전히 낱말 표가 가른다 — 까닭은 `topicQuestions` 에 있다.
 */
async function judgeTopic(question: string, data: AdvisorData, named: ChampionCard[], deps: PlanDeps): Promise<ReturnType<typeof topicFromJudge> | undefined> {
  if (!named.length) return undefined;
  const names = named.map((card) => card.name);
  // 갈래를 못 박는 낱말("한타", "라인전", "피오라 W")이 있으면 판정기보다 먼저다.
  // 상성 문항 24개에서 판정기 14, 낱말 먼저 24. 까닭은 `topicFromWords` 에 있다.
  const worded = topicFromWords(question, [...names, ...named.flatMap((card) => data.aliases.get(card.id) ?? [])]);
  if (worded) return { topic: worded };
  return deps
    .judge(TOPIC_HEAD, judgeRouteState(question, names), topicQuestions(named.length))
    .then(([topic]) => topicFromJudge(topic))
    .catch(() => undefined);
}

/** 대화에서 가장 최근에 다룬 챔피언. 이름을 생략한 다음 질문의 맥락이다. */
function recentChampions(data: AdvisorData, turns: readonly PlanTurn[]): ChampionCard[] {
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const turn = turns[i];
    if (turn.role !== "assistant" || !turn.answer) continue;
    const ids = answerChampionIds(turn.answer);
    if (ids.length) return ids.map((id) => data.cardById.get(id)).filter((card): card is ChampionCard => Boolean(card));
  }
  return [];
}

/** 대화에서 가장 최근에 다룬 아이템. "쇼진의 창 효과" 다음의 "거기 둔화 있어?" 가 여기 기댄다. */
function recentItem(turns: readonly PlanTurn[]): string | undefined {
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const answer = turns[i].answer;
    if (answer?.kind === "item") return answer.itemId;
  }
  return undefined;
}
