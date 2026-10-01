/** 상성의 이어 묻기·관점·새 상대를 해석한다. 기존 판정 순서를 유지한다. */
import { fill } from "@/i18n/fill";
import { buildItemCard, buildMechanicsAnswer, type AdvisorData } from "./context";
import { buildCompareAnswer as buildCompareCard, detectStat, type AdvisorAnswer } from "./answer";
import { asksGenericAdvice, asksReason, asksComparison, asksGuide, asksMatchup, looksChampionDirected } from "./askWords";
import { matchupPair, matchupSides, matchupSidesByPhrase, matchupSidesDetailed } from "./matchupSides";
import { judgeRouteState, type AskRoute } from "./routeAsk";
import { topicFromJudge, topicFromWords, topicQuestions } from "./topicJudge";
import { actFromProbs, actFromWords, actQuestion, actState, planTurn, sideOfNewName } from "./conversation";
import { docAnswer } from "./questionDocs";
import type { ChampionCard } from "@/lib/knowledge/facts";
import { type AnswerPlan, type PlanTurn, type PlanContext, type PlanDeps, type Intent } from "./planTypes";
import { TOPIC_HEAD, ACT_HEAD } from "./judgeHeads";

/**
 * 게임과 무관한 주제 낱말(날씨·요리·영화·숙제·코딩 …). 판정기가 잡담으로 못 가른 것도 잡는다 — 대화 흐름 시험에서 판정기만 9, 이 낱말까지
 * 19 를 잡고 이어 묻기 133 은 하나도 끊지 않았다(낱말은 그 시험 문항을 보며 골라 조금 낙관적이다). 롤 속어와 겹치는 말(요리하다·cooked·
 * TP travel)은 넣지 않는다.
 */
const OFF_TOPIC =
  /날씨|기온|저녁|점심|레시피|끓이|맛집|영화|드라마|숙제|과제|이력서|자기소개서|코딩|파이썬|주식|여행|weather|recipe|dinner|lunch|movie|tv show|homework|resume|python|javascript|stock market|天气|菜谱|做饭|怎么做好吃|电影|电视剧|作业|简历|代码|股票|旅游|失眠|减肥/i;

/** 판정기가 잡담이라 해도 이어 묻기일 수 있는 말(조언 요청·되묻기) */
const FOLLOWUP_GUARD = /팁|조언|어떻게|방법|요령|왜|\btips?\b|\badvice\b|\bhow\b|\bwhy\b|建议|技巧|怎么|攻略|为啥|为什么/i;

/** 상성 대화 중 이름 없는 말을 새 질문으로 볼 검색 벡터 점수(낱말 가산점 없이) */
const CONVERSATION_NEW_QUESTION = 0.55;

/*
 * 방금 답한 상성에 이어 묻는가. "그럼 아이템은?", "다리우스는?", "피오라 입장에서는?", "왜?"
 *
 * 대화 이력을 모델에 넣지 않는다 — 0.8B 는 맥락을 못 쥔다(이력을 넣은 판정 10점 환산 1.0~1.3).
 * 상성(내 챔피언·상대)은 코드가 들고, 새 말이 그 상성과 어떤 관계인지만 판정기가 고른다.
 * 판정기가 없으면 규칙: 아이템·게임 규칙 이름이 있으면 새 질문, 없으면 이어 묻기(3.8 → 7.0).
 * 까닭과 측정은 `conversation.ts`.
 */
export async function continueMatchup(intent: Intent, deps: PlanDeps): Promise<AnswerPlan | undefined> {
  const { question, ctx, data, champions, matchup: state, ask } = intent;
  if (!state || champions.length > 1) return undefined;
  /*
   * 이름 없이 스킬 수치를 찾으면 해설이 아니라 두 챔피언의 표다(`answerChampion` 이 대화의 두 챔피언을 붙인다).
   * 이 단계가 갈래를 안 보던 때 "두 챔피언에 대해 스킬 쿨타임도 알려줘" 가 한타·아이템 해설로 나갔다.
   */
  // 이름 없이 슬롯만 던진 말("그럼 궁은?", "W 쿨")은 두 챔피언의 그 스킬 표다. 판정기가 잡담으로 갈라 자료 없음이 됐다(2026-10-01 브라우저 시험).
  if (champions.length === 0 && intent.slot && bareSlotAsk(question, undefined, data, intent.slot)) {
    return {
      type: "card",
      answer: { ...buildCompareCard([state.mine, state.enemy], question, intent.slot, { lang: ctx.lang }), inMatchup: true } as AdvisorAnswer,
      notice: ctx.notice ?? fill(ctx.copy.card.fromChat, { name: `${state.mine.name}·${state.enemy.name}` }),
    };
  }
  if (champions.length === 0 && ask === "spellStat") return undefined;
  /*
   * 아이템 이름·게임 규칙 문서가 걸리면 새 질문이다.
   *
   * 다만 게임 규칙 문서는 낱말 하나("쿨감", "cdr", "冷却缩减")로도 걸리므로, 상성의 갈래를 못 박는 낱말(아이템·한타·라인전 …)이
   * 함께 있으면 그 갈래의 이어 묻기다 — "쿨감 템 먼저 가는 게 나아?", "should I rush a cdr item?", "先出冷却缩减装备好吗" 가
   * "스킬 가속" 절 원문으로 답했다. 갈래 낱말이 없는 "쿨타임 감소 계산 어떻게 해?" 는 그대로 문서다.
   */
  /*
   * 같은 쌍의 이름 + 슬롯만 던진 말("럼블 E", "오공 궁 쿨")은 그 스킬 카드다. 상성 이어 묻기로 받으면 앞 답을 그대로 반복했다
   * (2026-10-01 브라우저 시험). "피오라 W 어떻게 빼" 처럼 운용을 묻는 말은 남는 낱말이 있어 종전대로 이어 묻기다.
   */
  if (champions.length === 1 && intent.slot && bareSlotAsk(question, champions[0], data, intent.slot)) return undefined;
  const named =
    champions.length === 0 &&
    (Boolean(buildItemCard(data, question, intent.recentItem)) || (Boolean(buildMechanicsAnswer(data, question)) && !topicFromWords(question)));
  // 문형이 분명하면("입장에서는?", "왜?", "항복 몇 분부터") 판정기보다 먼저다. 판정기가 아예 없는 기기의 길이기도 하다.
  const worded = actFromWords(question) ?? (champions.length === 0 && asksGenericAdvice(question) ? "more" : undefined);
  const act =
    worded ??
    (!named && ctx.judge !== "none"
      ? await deps
          .judge(ACT_HEAD, actState(state.mine.name, state.enemy.name, question, champions[0]?.name), [actQuestion(state.mine.name, state.enemy.name)])
          // lookup 에 확신 문턱을 두어 봤지만(0.5·0.7) 대화 270턴은 그대로고 새 시험만 잃어(37 → 35) 두지 않는다
          .then(([probs]) => actFromProbs(probs))
          .catch(() => undefined)
      : undefined);
  /*
   * 새 질문은 이름(아이템·게임 규칙 문서)과 문형(항복·닷지·가격 …)이 가른다. 판정기의 "new" 는 쓰지 않는다.
   * 갈래 판정기(sub-v1)의 게임 규칙·잡담을 판정기 둘이 동의할 때만 새 질문으로 쳐 봤는데, 이어 묻기를
   * 더 잃었다("How do I survive lane", "要出护甲吗"). 손 시험 60 + 대화 270턴 합계 236 → 뺀 판 240.
   */
  /*
   * 판정기의 "new" 는 kev LoRA 여도 믿지 않는다. 평균은 조금 올랐지만(대화 270턴 8.2, 손 시험 49 → 51) 틀리면
   * 이어 묻기("정글이 자꾸 탑으로 오는데 그럴 땐?")가 검색 길로 빠져 0.8B 가 자료 없이 글을 썼다. 새 질문 대부분은
   * 게임 규칙·메타 자료(`gameMeta.ts`)와 이름이 먼저 받으므로 믿어서 얻는 것이 거의 없다.
   */
  /*
   * 검색 벡터로 새 질문을 빼내는 검사(`leaveMatchup`)는 흐름 판정 뒤에 둔다. 앞에 두었더니 "두 챔피언에 대해 스킬 쿨타임도 알려줘" 가
   * lookup 으로 판정되기 전에 벡터가 고른 "챔피언 분류" 절 원문으로 나갔다. 검색 벡터는 브라우저에서만 돌아 Node 측정에는 잡히지 않았다.
   */
  if (!named && champions.length === 0 && act !== "lookup") {
    const left = await leaveMatchup(intent, deps);
    if (left) return left;
  }
  const entity = champions.length === 0 && (named || worded === "new");
  /*
   * 흐름 판정기가 "두 챔피언의 스킬 수치 조회"(lookup) 라 하면 해설이 아니라 그 둘의 표다. 갈래 판정기가 소환사 주문(spell)으로
   * 헷갈린 "궁 쿨 몇 초야" 같은 말도 여기서 받는다. 갈래가 스킬 수치(`ask === "spellStat"`)인 말은 이 단계 첫머리에서 이미
   * `answerChampion` 으로 넘어갔으니 여기는 흐름 판정기만 가른 것이다. 낱말 규칙(`asksSpellNumbers`)은 판정기가 없는 기기의
   * 갈래(`askFromWords`)일 뿐 판정기와 합치지(OR) 않는다 — 합치면 낱말이 판정기의 이어 묻기를 덮는다.
   */
  if (act === "lookup" && champions.length === 0) {
    const table = buildCompareCard([state.mine, state.enemy], question, intent.slot, { lang: ctx.lang });
    return {
      type: "card",
      answer: table.kind === "compare" ? { ...table, inMatchup: true } : table,
      notice: ctx.notice ?? fill(ctx.copy.card.fromChat, { name: `${state.mine.name}·${state.enemy.name}` }),
    };
  }
  // 새 이름이 내 자리인지 상대 자리인지 문형이 못 박으면 판정기보다 먼저다("오공으로 하면", "야스오 만나면")
  const side = champions.length === 1 ? sideOfNewName(question, [champions[0].name, ...(data.aliases.get(champions[0].id) ?? [])]) : undefined;
  // 새 챔피언 + 스킬 지목("제드 궁 어떻게 피해")은 상대를 바꾼 것이 아니라 그 챔피언의 스킬 질문이다
  const alone = champions.length === 1 && intent.slot ? "skills" : ask;
  const turn = planTurn(state, champions, entity, act, side, alone);
  if (turn.kind !== "matchup") return undefined;
  const topic = turn.act === "more" ? previousFocus(ctx.turns) ?? "general" : await matchupTopic(question, { data, ctx, pair: [turn.mine, turn.enemy] }, deps);
  const pairNotice = fill(ctx.copy.card.fromChat, { name: `${turn.mine.name} vs ${turn.enemy.name}` });
  return { type: "matchup", mine: turn.mine, enemy: turn.enemy, notice: ctx.notice ?? pairNotice, focus: topic, more: turn.act === "more", continuation: turn.act === "more" ? (asksReason(question) ? "explain" : "advance") : undefined };
}

/** 이름과 슬롯을 떼면 수치·설명 낱말만 남는가. "럼블 E", "럼블 E 쿨타임", "오공 궁 계수" 는 참, "피오라 W 어떻게 빼" 는 거짓. */
function bareSlotAsk(question: string, card: ChampionCard | undefined, data: AdvisorData, slot: string): boolean {
  let rest = question;
  for (const name of card ? [card.name, ...(data.aliases.get(card.id) ?? [])] : []) rest = rest.split(name).join(" ");
  rest = rest.replace(/그럼|그러면|그리고|근데|then|and|那/gi, " ");
  rest = rest.replace(/[QWER]|궁극기|궁|패시브|기본\s*지속\s*효과|ult(imate)?|passive|大招|被动/gi, " ");
  rest = rest.replace(/쿨타임|쿨다운|쿨|재사용\s*대기\s*시간|계수|마나|코스트|소모|사거리|범위|피해|데미지|효과|설명|뭐야|뭐|알려줘|얼마|몇\s*초|cooldown|cd|cost|mana|ratio|range|damage|effect|explain|冷却|耗蓝|加成|射程|伤害|效果/gi, " ");
  return rest.replace(/[\s?？!.,의은는이가을를도로]/g, "").length <= 1 && slot !== "";
}

/** 이름 없는 말이 앞 상성을 떠나 다른 것을 묻는가 */
async function leaveMatchup({ question, ctx, data, ask, slot }: Intent, deps: PlanDeps): Promise<AnswerPlan | undefined> {
  /*
   * 게임과 무관한 말("내일 날씨 어때?", "라면 맛있게 끓이는 법")은 앞 상성의 이어 묻기가 아니다. 갈래가 잡담이고,
   * 문형("왜?", "풀어서")·조언 요청("팁 좀", "any tips?")이 없을 때만. 대화 흐름 시험에서 이어 묻기 133 중 0 을 끊고
   * 답 없는 질문 119 중 무관한 것 9 를 잡았다. `OFF_TOPIC` 은 갈래와 상관없이 본다 — 판정기가 잡담으로 못 가른 것도 잡는다.
   */
  // 스킬 슬롯이나 챔피언 낱말이 든 말은 판정기가 잡담이라 해도 잡담이 아니다 — "그럼 궁은?" 이 자료 없음으로 갔다(2026-10-01 브라우저 시험)
  const championish = Boolean(slot) || looksChampionDirected(question, slot);
  if (OFF_TOPIC.test(question) || (ask === "chat" && !championish && !actFromWords(question) && !FOLLOWUP_GUARD.test(question))) {
    return { type: "code", answer: ctx.copy.noLiteAnswer };
  }
  /*
   * 이름이 없어도 검색 벡터가 자료 하나를 뚜렷이 가리키면 새 질문이다("대룡 먹으면 버프 얼마나 가?"). 대화 중에는 낱말 가산점을
   * 빼고 벡터 점수만 본다 — "점멸 빠지면 물어도 돼?" 는 상성 이어 묻기인데 소환사 주문 이름이 걸린다. 대화 흐름 시험에서 0.55 는
   * 이어 묻기 127문항을 하나도 끊지 않고 새 질문 24문항 중 6개를 빼냈다(research/llm-evals/vector-search/README.md).
   */
  if (!(ctx.canUseModel && ctx.consented && ctx.retrieval && !actFromWords(question))) return undefined;
  const top = await deps.search(question, ctx.lang).catch(() => null);
  const answer = top?.[0] && top[0].score >= CONVERSATION_NEW_QUESTION ? docAnswer(data, ctx.lang, top[0].id, question) : undefined;
  if (!answer) return undefined;
  return typeof answer === "string" ? { type: "code", answer, notice: ctx.notice } : { type: "card", answer, notice: ctx.notice };
}

/** "더 자세히" 는 앞 상성 답이 앞세운 칸을 잇는다 */
function previousFocus(turns: readonly PlanTurn[]): string | undefined {
  const last = [...turns].reverse().find((turn) => turn.answer?.kind === "compare" && turn.answer.matchup)?.answer;
  return last?.kind === "compare" ? last.notes?.plan?.focus : undefined;
}

/** 이어 묻는 상성의 주제. 갈래를 못 박는 낱말이 먼저, 없으면 판정기 */
async function matchupTopic(question: string, { data, ctx, pair }: { data: AdvisorData; ctx: PlanContext; pair: ChampionCard[] }, deps: PlanDeps): Promise<string | undefined> {
  const names = pair.map((card) => card.name);
  const worded = topicFromWords(question, [...names, ...pair.flatMap((card) => data.aliases.get(card.id) ?? [])]);
  if (worded || ctx.judge === "none") return worded;
  return deps
    .judge(TOPIC_HEAD, judgeRouteState(question, names), topicQuestions(2))
    .then(([probs]) => topicFromJudge(probs).topic)
    .catch(() => undefined);
}

/**
 * 대화 맥락의 상성. "말파이트 설명해줘" 다음의 "제이스랑 상대한다 생각하면" 은 말파이트로
 * 제이스를 상대하는 질문이다. 방금 다룬 챔피언이 내 챔피언, 새 이름이 상대.
 */
export async function answerMatchupWithRecent({ question, ctx, champions, ask, recent, topic }: Intent): Promise<AnswerPlan | undefined> {
  // "말파이트 상대법" 은 그 챔피언의 공략을 달라는 말이다(갈래 guide). 앞 대화에 다른 챔피언이
  // 있다고 짝을 지으면 묻지 않은 상성이 된다. 그때는 아래 챔피언 경로로 내려간다.
  // 판정기는 이름 하나를 상성으로 가르지 않고(`routeFromKind9`) 공략(guide)으로 준다. 그래서 "가렌 설명해줘" 뒤의
  // "제이스랑 상대한다 생각하면" 이 판정기가 있는 기기에서는 제이스 공략 카드로 갔다(2026-09-30 브라우저 시험). 공략 갈래여도
  // 상성 낱말("상대한다", "만나면")이 있고 공략 요청 낱말("상대법")이 없으면 앞 대화의 챔피언과 짝을 짓는다.
  const pairs = ask === "matchup" || (ask === "guide" && asksMatchup(question) && !asksGuide(question));
  if (champions.length !== 1 || !pairs) return undefined;
  const mine = recent.find((card) => card.id !== champions[0].id);
  return mine ? { type: "matchup", mine, enemy: champions[0], notice: ctx.notice, focus: (await topic())?.topic } : undefined;
}

/**
 * 이름이 셋 이상인 상성 질문. "오공으로 럼블 상대할 때 아이번 정글이면 아이템 뭐 가?" 는
 * 오공 vs 럼블 을 묻고 아이번은 곁들인 말이다. 예전에는 셋을 다 0.8B 에 실어 글을 쓰게 했고,
 * 프롬프트가 2,300토큰이 넘어 실행이 죽었다. 자리 낱말로 곁들인 이름을 빼고 둘로 답한다.
 * 시점은 판정기에 묻지 않는다 — 이름 둘로 배운 헤드라 셋 앞에서는 12문항 중 6개만 맞혔다.
 */
export async function answerMatchupOfMany({ question, ctx, data, champions, ask, topic }: Intent): Promise<AnswerPlan | undefined> {
  // 셋을 한꺼번에 견주는 질문("오공 럼블 아이번 중 누가 세?")은 아래 비교 표가 받는다
  if (champions.length < 3 || asksComparison(question, champions.length) || ask !== "matchup") return undefined;
  const aliasesOf = (card: ChampionCard) => [card.name, ...(data.aliases.get(card.id) ?? [])];
  const pair = matchupPair(question, champions, aliasesOf);
  if (!pair) return undefined;
  const phrased = matchupSidesByPhrase(question, pair, aliasesOf);
  const [mine, enemy] = phrased ? [phrased, pair.find((card) => card.id !== phrased.id) ?? pair[1]] : matchupSides(question, pair);
  const others = champions.filter((card) => !pair.includes(card)).map((card) => card.name).join(", ");
  const notice = ctx.notice ?? fill(ctx.copy.card.pairFromMany, { mine: mine.name, enemy: enemy.name, others });
  return { type: "matchup", mine, enemy, notice, focus: (await topic())?.topic };
}

/*
 * "오공이랑 말파이트랑 싸우면 누가 유리해?" — 둘을 다 말했고 싸움을 묻는다.
 * 능력치 비교표가 아니라 상성 카드와 시점 있는 해설, 그리고 VS 링크.
 *
 * 누가 내 챔피언인지는 **조사가** 가린다. 예전에는 먼저 말한 쪽으로 정했는데,
 * 상대를 먼저 말하면 통째로 뒤집혔다 — "럼블 상대로 오공 하는데" 가 럼블 시점이
 * 됐다. 열 문장으로 재 보니 어순은 4/10, 조사는 9/10 이다.
 */
export async function answerMatchupOfTwo({ question, ctx, champions, ask, route, topic }: Intent): Promise<AnswerPlan | undefined> {
  if (champions.length !== 2 || ask !== "matchup") return undefined;
  // "아리 vs 럼블 누가 더 빨라?" — 이름 둘에 비교 낱말과 능력치 낱말이 있으면 상성 해설이 아니라 능력치 표다(판정기는 이름 둘이면 상성으로 가른다)
  if (asksComparison(question, 2) && detectStat(question)) return undefined;
  const [mine, enemy] = pickMatchupSides(question, champions, route);
  return { type: "matchup", mine, enemy, notice: ctx.notice, focus: (await topic())?.topic };
}

/**
 * 이름 둘 상성의 내 챔피언·상대.
 *
 * 조사가 확실히 가르면("오공으로", "럼블 상대로") 그것이 먼저다. 판정기가 "오공으로 럼블 너무
 * 어려운데 팁 없나?" 를 럼블 시점으로 골랐다. 조사 규칙이 틀린 것은 모두 조사가 없어 어순으로
 * 떨어진 경우였다(`matchupSidesDetailed`). 그때만 판정기(영어·중국어는 문형 보정)를 따른다.
 */
export function pickMatchupSides(question: string, champions: ChampionCard[], route: AskRoute | undefined): [ChampionCard, ChampionCard] {
  const byJosa = matchupSidesDetailed(question, champions);
  const picked = !byJosa.confident && route?.mine && champions.includes(route.mine) ? route.mine : undefined;
  return picked ? [picked, champions.find((card) => card.id !== picked.id) ?? champions[1]] : byJosa.sides;
}
