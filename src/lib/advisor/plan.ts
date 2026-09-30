/**
 * 질문 하나를 어떻게 답할지 정한다. 화면·모델·저장은 건드리지 않고 값(`AnswerPlan`)만 돌려준다.
 *
 * 판정기(`judge`)와 검색 벡터(`search`)는 인자로 받는다. 답을 내는 일은 부르는 쪽(`AdvisorPanel`)이 한다.
 * 먼저 질문을 읽고(`understand`), 단계를 차례로 돌려 처음 답한 단계의 답을 쓴다. 순서가 곧 우선순위다.
 *
 * 질문이 **무엇을 묻는지**(갈래, `Intent.ask`)는 `understand` 가 한 번만 정한다 — 판정기가 있으면 판정기, 없으면 낱말(`askFromWords`).
 * 단계는 그 갈래를 읽을 뿐 갈래를 따로 가르지 않는다. 단계에 남은 정규식은 갈래가 아닌 것(누가 내 챔피언인가, 어느 수치인가,
 * 앞 상성을 떠나는가, 둘을 견주는가)을 가른다.
 *
 * 판정기는 세 단계다(`PlanContext.judge`). 모델 판정기(0.8B 속내 + 헤드) → 오프라인 판정기(글자 n-gram, `offlineJudge.ts`) → 낱말 규칙.
 * 어느 판정기를 `deps.judge` 에 끼웠는지는 부르는 쪽이 정하고 여기서는 "판정기가 있는가" 만 본다. 판정이 거절되면 낱말 규칙이 받는다.
 */
import type { Language } from "@/i18n";
import type { Translations } from "@/i18n/translations";
import { fill } from "@/i18n/fill";
import { advisorSystemPrompt } from "./persona";
import { championNotes } from "./playbookNotes";
import { buildItemCard, buildTagAnswer, buildMechanicsAnswer, detectSlot, type AdvisorData } from "./context";
import {
  answerChampionIds,
  buildCompareAnswer as buildCompareCard,
  buildRuleAnswer as buildRuleCard,
  buildSpellAnswer as buildSpellCard,
  type AdvisorAnswer,
} from "./answer";
import { askFromWords, asksComparison, asksGuide, asksMatchup, asksWholeKit, looksChampionDirected, refersToContextChampions } from "./askWords";
import { detectSpellFocus } from "./spellFocus";
import { suggestChampions } from "./championTypo";
import { matchupPair, matchupSides, matchupSidesByPhrase, matchupSidesDetailed } from "./matchupSides";
import { asksAboutHelper, detectChampions, isSmallTalk, nicknames } from "./intent";
import {
  JUDGE_KIND9_CRITERIA,
  JUDGE_KIND_INSTRUCTIONS,
  JUDGE_MINE_INSTRUCTIONS,
  judgeRouteState,
  routeFromKind9,
  type AskKind,
  type AskRoute,
} from "./routeAsk";
import { topicFromJudge, topicFromWords, topicQuestions } from "./topicJudge";
import { championPriceAnswer, gameMetaAnswer } from "./gameMeta";
import {
  actFromProbs,
  actFromWords,
  actQuestion,
  actState,
  matchupStateOf,
  planTurn,
  sideOfNewName,
  type MatchupState,
} from "./conversation";
import { buildSearchCorpus, hitsToAnswer, buildRetrievalDocs, hybridSearch, lexicalSearch } from "./searchFallback";
import { questionLanguage } from "./questionLanguage";
import type { JudgeQuestion } from "./judge";
import { askedRules, docAnswer, isGameWord, lexicalHit, searchesByVector } from "./questionDocs";
import { josa } from "@/lib/knowledge/text";
import type { RuleNotes } from "@/lib/knowledge/rules";
import type { ChampionCard } from "@/lib/knowledge/facts";

/*
 * 판정 헤드(`public/models/judge/<이름>.{json,bin}`). 판정마다 헤드가 다르다.
 *
 * 처음엔 kev-b3e 하나가 갈래(아홉 칸)·주제·대화 흐름을 다 골랐다. 대화 흐름에 lookup 칸을 더하며 그 한 헤드를 다시 배우게 했더니
 * 손대지 않은 주제 판정이 흔들렸다 — 대화 270턴 A 가 240 → 234. 판정마다 헤드를 따로 두니 237(흐름은 새 문구로, 갈래·주제는 제
 * 자료 그대로). 헤드 파일이 없으면 `judge` 가 거절하고 오프라인 판정기(`useAskAdvisor`)가 받는다. 오프라인 판정기는 헤드 이름을 보지 않는다.
 */
/** 갈래(아홉 칸)와 내 챔피언(`judgeRoute`) */
export const ROUTE_HEAD = "kev-b3e-route";
/** 주제와 관점(`judgeTopic`·`matchupTopic`) */
export const TOPIC_HEAD = "kev-b3e-topic";
/** 상성 대화의 흐름(일곱 칸, lookup 포함 — `continueMatchup`) */
export const ACT_HEAD = "kev-b3e-act";
/** 세 판정을 한 헤드로 하던 때의 이름. 앱은 더 쓰지 않고 옛 측정 도구(`scripts/llm/kev-agent/eval-b3.ts`)가 기본값으로 남겨 둔다 */
export const KEV_HEAD = "kev-b3e";
/** 상성 대화에서 소환사 주문의 쓰임새를 묻는 말(규칙 카드가 아니라 이어 묻기) */
const SPELL_USE_IN_MATCHUP = /대신|빠지|빠졌|없(을|으면|는데|을\s*때)|instead|\bis\s+down\b|\bdown\b|without|没了|没有|不带|换成/i;
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

/** 답하는 길. 부르는 쪽이 `switch` 로 하나씩 받는다. */
export type AnswerPlan =
  /** 코드가 만든 카드(`deliver`) */
  | { type: "card"; answer: AdvisorAnswer; notice?: string }
  /** 상성 카드 + 미리 써 둔 답(`deliverMatchup`) */
  | { type: "matchup"; mine: ChampionCard; enemy: ChampionCard; notice?: string; focus?: string; more?: boolean }
  /**
   * 코드가 쓴 답을 그대로(`answerWithoutModel`). `related` 는 "혹시 이 자료를?" 에 걸 자료.
   * `pending` 이면 오타 후보를 물은 것이라 고르면 이 질문을 고쳐 다시 묻는다.
   */
  | { type: "code"; answer: AdvisorAnswer | string; notice?: string; related?: Array<{ id: string; title: string }>; pending?: true }
  /** 오타 하나를 고쳐 다시 묻는다 */
  | { type: "retry"; question: string; notice: string }
  /** 모델에게 넘긴다(`respond`) */
  | { type: "respond"; plan: { system: string; withoutConsent: string } };

/** 대화에서 답을 고르는 데 쓰는 것만 */
export interface PlanTurn {
  role: "user" | "assistant" | "system";
  answer?: AdvisorAnswer;
}

/**
 * `deps.judge` 에 끼운 판정기.
 *
 * - `model`: 모델(0.8B)의 속내에 판정 헤드를 얹는다. 모델을 받아 동의한 기기.
 * - `offline`: 글자 n-gram 분류기(`offlineJudge.ts`, 정적 파일 0.8MB). 모델이 없거나 동의 전이거나 모델 판정이 거절된 기기.
 *   동의가 필요 없다 — 기기 밖으로 나가는 것이 없다. 대화 270턴에서 낱말 규칙 114, 오프라인 221, 모델 240.
 * - `none`: 판정기 없음. 낱말 규칙만으로 답한다(측정의 기준선, 오프라인 파일도 못 받은 기기).
 */
export type JudgeTier = "model" | "offline" | "none";

/** 질문을 받은 그 순간의 화면·대화 */
export interface PlanContext {
  /** 챔피언·규칙 자료. 아직 없으면 모델만으로 답한다. */
  data: AdvisorData | null;
  lang: Language;
  copy: Translations["advisor"];
  turns: readonly PlanTurn[];
  /** 지금 화면에 떠 있는 챔피언 */
  championIds: readonly string[];
  /** 모델 내려받기에 동의했는가. 모델이 글을 쓰는 길(`respond`)과 낱말 검색 답의 갈림이다 — 판정기와는 무관하다. */
  consented: boolean;
  canUseModel: boolean;
  /** 지금 모델에 검색 벡터 가지가 있는가(`model.retrieval`) */
  retrieval: boolean;
  /** `deps.judge` 가 어느 판정기인가. `none` 이면 판정기를 부르지 않는다. */
  judge: JudgeTier;
  /** 말풍선에 붙일 안내. 오타를 고쳐 다시 물을 때 온다. */
  notice?: string;
}

export interface PlanDeps {
  /** 판정기(`ctx.judge` 단계의 것). 거절하면(모델 없음·파일 못 받음) 부르는 단계가 낱말 규칙으로 간다. */
  judge: (headName: string, state: string, questions: JudgeQuestion[]) => Promise<number[][]>;
  search: (question: string, lang: string) => Promise<Array<{ id: string; score: number }>>;
}

/** 질문을 읽은 것. 단계들이 함께 본다. */
export interface Intent {
  question: string;
  ctx: PlanContext;
  data: AdvisorData;
  /**
   * 질문이 무엇을 묻는지. 판정기가 가른 갈래(`route.kind`), 판정기가 없거나 실패하면 낱말 규칙(`askFromWords`).
   * 단계들은 이것 하나를 읽는다 — 단계마다 제 낱말로 갈래를 다시 가르지 않는다.
   */
  ask: AskKind;
  /** 판정기가 가른 갈래와 내 챔피언. 모델이 없거나 판정이 실패하면 없다. 갈래는 `ask` 로 읽고, 여기서는 `mine` 만 쓴다. */
  route?: AskRoute;
  /**
   * 판정기(또는 갈래를 못 박는 낱말)가 가른 주제. 이름이 있을 때만. 쓰는 단계가 처음 부를 때 한 번만 판정한다 —
   * 미리 부르면 상성 이어 묻기(주제를 두 챔피언으로 다시 가른다)에서 판정 한 번을 버렸다.
   */
  topic: () => Promise<ReturnType<typeof topicFromJudge> | undefined>;
  /** 질문에 적힌 챔피언 */
  champions: ChampionCard[];
  /** 방금 답한 상성. 대화에서 가장 최근의 챔피언 답이 상성 답일 때만. */
  matchup?: MatchupState;
  /** 대화에서 가장 최근에 다룬 챔피언 */
  recent: ChampionCard[];
  /** 대화에서 가장 최근에 다룬 아이템 */
  recentItem?: string;
  slot?: string;
}

type Step = (intent: Intent, deps: PlanDeps) => AnswerPlan | undefined | Promise<AnswerPlan | undefined>;

/** 질문 하나를 푼다. */
export async function planAnswer(question: string, ctx: PlanContext, deps: PlanDeps): Promise<AnswerPlan> {
  const { data, copy } = ctx;
  if (!data) return { type: "respond", plan: { system: advisorSystemPrompt(ctx.lang), withoutConsent: copy.noModel } };

  // 잡담·도우미 자신은 자료로 답할 것이 아니다. 상성 대화 중이어도 먼저 받는다("고마워 덕분에 이겼다" 가 상성 이어 묻기로 갔다).
  if (isSmallTalk(question)) return { type: "code", answer: copy.smallTalk };
  /*
    도우미 자신을 묻는 말을 검색으로 흘려보냈더니 모델이 아무 검색어나 만들어 내고 화면에 "찾은 자료: 와드"
    가 붙었다. 우리가 답을 아는 질문이라 모델을 부르지 않는다. 작은 모델은 페르소나를
    무시하고 "저는 Google AI입니다" 라고 답한 적이 있고, 큰 모델이라 해도
    이 답은 기다릴 이유가 없다. 화면 곳곳에 적어 둔 말과 어긋나서도 안 된다.
  */
  if (asksAboutHelper(question)) return { type: "code", answer: copy.identity };

  const intent = await understand(question, ctx, data, deps);
  const steps: Step[] = [
    answerByVector,
    answerRuleQuestion,
    fixChampionTypo,
    answerGameFact,
    continueMatchup,
    answerMatchupWithRecent,
    answerMatchupOfMany,
    answerMatchupOfTwo,
    answerItemOrMechanics,
    answerChampion,
    answerFromNotes,
  ];
  for (const step of steps) {
    const plan = await step(intent, deps);
    if (plan) return plan;
  }
  return { type: "respond", plan: { system: advisorSystemPrompt(ctx.lang), withoutConsent: copy.noModel } };
}

/** 질문에 적힌 이름, 갈래(판정기 또는 낱말)·주제, 대화가 남긴 맥락을 모은다. 판정기는 여기서 한 번(이름이 있으면 두 번) 부른다. */
export async function understand(question: string, ctx: PlanContext, data: AdvisorData, deps: PlanDeps): Promise<Intent> {
  const champions = detectChampions(data, question);
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
    slot: detectSlot(question),
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

/*
 * 이름 없는 질문은 검색 LoRA 벡터로 찾는다(`model.retrieval`). 챔피언·아이템 이름이 없고, 이어 묻는 상성 대화도 아니고,
 * 도우미 자신·챔피언 가격 단계를 묻는 것도 아닐 때. 낱말(룬·주문 이름 → 게임 메타 → 게임 원리 → 낱말 검색)보다 먼저 쓴다 —
 * 낱말이 먼저 답하면 그 틀린 답이 그대로 남았다(시험 절반: 낱말 먼저 226 · 31, 벡터만 288 · 31).
 * 챔피언 이름 오타 후보가 있어도 찾지 않는다 — "럼미 E" 는 럼블 질문이다(오타 단계가 고친다).
 * 검색이 실패하면(그래프·파일) 아래 낱말 길이 처음부터 그대로 돈다.
 */
async function answerByVector({ question, ctx, data, ask, recentItem, matchup, recent }: Intent, deps: PlanDeps): Promise<AnswerPlan | undefined> {
  /*
   * "두 챔피언에 대해 스킬 쿨타임도" — 가리키는 챔피언이 화면·대화에 있으면 문서 검색이 아니다. 검색은 "챔피언 분류" 절을 골랐다.
   * 갈래가 스킬 소개·스킬 수치여도 같다: 이름 없이 스킬을 묻는데 챔피언이 눈앞에 있으면 그 챔피언이 답이다(`answerChampion` 이 붙인다).
   * 잘못 가른 룬·게임 메타 질문은 아래 낱말 길(룬·주문 → 게임 메타 → 아이템·원리)이 그대로 받는다.
   */
  if ((refersToContextChampions(question) || ask === "spellStat" || ask === "skills" || ask === "guide" || Boolean(topicFromWords(question)) || (ask === "item" && !buildItemCard(data, question, recentItem))) && (recent.length > 0 || ctx.championIds.length > 0)) return undefined;
  if (!(ctx.canUseModel && ctx.consented && ctx.retrieval && searchesByVector(data, question, recentItem, Boolean(matchup)))) return undefined;
  const top = await deps.search(question, ctx.lang).catch((error: unknown) => {
    console.warn("[advisor] 검색 벡터 실패 — 낱말 검색으로", error);
    return null;
  });
  // null: 검색 실패 — 아래 낱말 길로 내려간다
  if (top === null) return undefined;
  // 벡터 점수와 낱말 점수(BM25 · 룬·주문 이름·은어 → 게임 메타 → 게임 원리 적중)를 합친다. 까닭과 수치는 `hybridSearch`
  const asked = questionLanguage(question) ?? ctx.lang;
  const bm25 = lexicalSearch(buildRetrievalDocs(data, asked, true), question, 100);
  const found = hybridSearch(top, bm25, lexicalHit(data, question));
  const answer = found.answer ? docAnswer(data, ctx.lang, found.answer, question) : undefined;
  if (typeof answer === "string") return { type: "code", answer, notice: ctx.notice };
  if (answer) return { type: "card", answer, notice: ctx.notice };
  if (found.related?.length) {
    // 확신이 없으면 "자료 없음" 대신 가까운 자료 셋을 고르게 한다. 누르면 그 자료를 보인다(`showDoc`).
    const titles = new Map(buildRetrievalDocs(data, ctx.lang).map((doc) => [doc.id, doc.title]));
    return { type: "code", answer: ctx.copy.card.relatedPrompt, related: found.related.map((id) => ({ id, title: titles.get(id) ?? id })) };
  }
  return { type: "code", answer: ctx.copy.noLiteAnswer };
}

/**
 * 룬·주문 판정. 함께 나온 다른 규칙 이름이 든 문장이 답이다.
 * "정복자에 점화 들어가?" 는 점화 규칙 9문장 중 "정복자" 가 든 한 문장.
 *
 * 이런 질문은 툴팁만 보면 틀린다. 실제로 그렇게 틀렸다. 그래서 문장에서 룬·주문 이름을 찾아
 * 위키에서 모은 판정 규칙으로 답한다.
 */
function answerRuleQuestion({ question, ctx, data, matchup }: Intent): AnswerPlan | undefined {
  const named = askedRules(data, question);
  /*
   * 상성 대화 중에 소환사 주문을 **어떻게 쓰느냐**를 물으면("점멸 빠지면 물어도 돼?", "점멸 대신 방어막 들어도 돼?") 규칙 카드가 아니라
   * 그 상성의 이어 묻기다. 대화 흐름 시험에서 이름이 든 이어 묻기 9개가 모두 이 꼴이었고, 새 질문 3개는 룬 자체의 속성("감전 쿨타임")이었다.
   */
  const spellInMatchup =
    named.length > 0 && named.every((rule) => rule.subject === "summoner") && SPELL_USE_IN_MATCHUP.test(question) && Boolean(matchup);
  if (!named.length || spellInMatchup) return undefined;
  const names = named.map((rule) => rule.name);
  // 소환사 주문의 재사용 대기시간을 물으면 자료(summoner-normalized)의 값을 첫 줄로. 협곡(CLASSIC) 판을 고른다 — 아레나 점멸은 0.25초다.
  const cooldownOf = (rule: RuleNotes): number | undefined => {
    if (rule.subject !== "summoner" || detectSpellFocus(question)?.focus !== "cooldown") return undefined;
    // 자료의 이름은 화면 언어라 규칙의 세 언어 이름 중 하나와 맞춘다
    const names = new Set([rule.name, rule.nameEn, rule.nameZh].filter(Boolean));
    const spell = data.summoners.find((entry) => names.has(entry.name) && entry.modes?.includes("CLASSIC")) ?? data.summoners.find((entry) => names.has(entry.name) && !entry.modes?.includes("CHERRY"));
    return spell?.cooldown?.[0];
  };
  const cards = named.map((rule) => buildRuleCard(rule, names, ctx.lang, named, cooldownOf(rule)));
  const best = cards.find((card) => card.kind === "rule" && card.highlighted.length > 0) ?? cards[0];
  return { type: "card", answer: best, notice: ctx.notice };
}

/**
 * 챔피언 이름 오타. 한 글자 틀린 이름이 있으면 먼저 고친다 — 말파이트 표를 보며 "럼미 E" 라
 * 치면 럼블이지 말파이트가 아니고, "말파이트랑 럼베 중" 은 둘을 견주는 질문이다.
 * 후보가 하나면 바로 간다. 이미 찾은 챔피언은 오타 후보에서 뺀다.
 */
function fixChampionTypo({ question, ctx, data, champions, matchup }: Intent): AnswerPlan | undefined {
  const known = new Set(champions.map((card) => card.id));
  // 상성 대화를 이어 가는 중이면 두 글자 낱말은 오타로 보지 않는다(`suggestChampions` 의 minLength)
  const typo = suggestChampions(question, data.cards, nicknames(data.cards), known, matchup ? 3 : 1, (token) => isGameWord(data, token));
  if (typo?.candidates.length === 1) {
    const [card] = typo.candidates;
    return {
      type: "retry",
      question: question.replace(typo.original, card.name),
      notice: fill(ctx.copy.card.understoodAs, { name: card.name, nameWith: josa(card.name, "로/으로") }),
    };
  }
  if (typo && typo.candidates.length > 1) {
    return { type: "code", answer: { kind: "suggestion", original: typo.original, candidates: typo.candidates }, pending: true };
  }
  return undefined;
}

/*
 * 게임 규칙·메타(항복·다시하기·오브젝트 시간·챔피언 가격·닷지 …). 공식 위키에서 옮긴 사실로 답한다(`gameMeta.ts`).
 * 이름이 없으면 낱말로, 챔피언 하나가 곁들여졌으면 갈래가 게임 규칙일 때만("킨드레드 하는 중인데
 * 첫 바론 몇 분에 나와"). 상성 대화 중이어도 새 질문이다.
 */
function answerGameFact({ question, ctx, data, champions, ask }: Intent): AnswerPlan | undefined {
  if (champions.length === 1) {
    const price = championPriceAnswer(question, champions[0], ctx.lang);
    // "피오라 굶주린 히드라 가격" 은 아이템 가격이다 — 아이템 이름이 있으면 챔피언 가격 대신 아이템 카드로 답한다
    if (price) return { type: "code", answer: buildItemCard(data, question, undefined) ?? price, notice: ctx.notice };
  }
  if (champions.length === 0 || (champions.length === 1 && ask === "game")) {
    const fact = gameMetaAnswer(question, ctx.lang);
    if (fact) return { type: "code", answer: fact, notice: ctx.notice };
  }
  return undefined;
}

/*
 * 방금 답한 상성에 이어 묻는가. "그럼 아이템은?", "다리우스는?", "피오라 입장에서는?", "왜?"
 *
 * 대화 이력을 모델에 넣지 않는다 — 0.8B 는 맥락을 못 쥔다(이력을 넣은 판정 10점 환산 1.0~1.3).
 * 상성(내 챔피언·상대)은 코드가 들고, 새 말이 그 상성과 어떤 관계인지만 판정기가 고른다.
 * 판정기가 없으면 규칙: 아이템·게임 규칙 이름이 있으면 새 질문, 없으면 이어 묻기(3.8 → 7.0).
 * 까닭과 측정은 `conversation.ts`.
 */
async function continueMatchup(intent: Intent, deps: PlanDeps): Promise<AnswerPlan | undefined> {
  const { question, ctx, data, champions, matchup: state, ask } = intent;
  if (!state || champions.length > 1) return undefined;
  /*
   * 이름 없이 스킬 수치를 찾으면 해설이 아니라 두 챔피언의 표다(`answerChampion` 이 대화의 두 챔피언을 붙인다).
   * 이 단계가 갈래를 안 보던 때 "두 챔피언에 대해 스킬 쿨타임도 알려줘" 가 한타·아이템 해설로 나갔다.
   */
  if (champions.length === 0 && ask === "spellStat") return undefined;
  /*
   * 아이템 이름·게임 규칙 문서가 걸리면 새 질문이다.
   *
   * 다만 게임 규칙 문서는 낱말 하나("쿨감", "cdr", "冷却缩减")로도 걸리므로, 상성의 갈래를 못 박는 낱말(아이템·한타·라인전 …)이
   * 함께 있으면 그 갈래의 이어 묻기다 — "쿨감 템 먼저 가는 게 나아?", "should I rush a cdr item?", "先出冷却缩减装备好吗" 가
   * "스킬 가속" 절 원문으로 답했다. 갈래 낱말이 없는 "쿨타임 감소 계산 어떻게 해?" 는 그대로 문서다.
   */
  const named =
    champions.length === 0 &&
    (Boolean(buildItemCard(data, question, intent.recentItem)) || (Boolean(buildMechanicsAnswer(data, question)) && !topicFromWords(question)));
  // 문형이 분명하면("입장에서는?", "왜?", "항복 몇 분부터") 판정기보다 먼저다. 판정기가 아예 없는 기기의 길이기도 하다.
  const worded = actFromWords(question);
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
  const topic = turn.act === "more" ? previousFocus(ctx.turns) : await matchupTopic(question, data, ctx, [turn.mine, turn.enemy], deps);
  const pairNotice = fill(ctx.copy.card.fromChat, { name: `${turn.mine.name} vs ${turn.enemy.name}` });
  return { type: "matchup", mine: turn.mine, enemy: turn.enemy, notice: ctx.notice ?? pairNotice, focus: topic, more: turn.act === "more" };
}

/** 이름 없는 말이 앞 상성을 떠나 다른 것을 묻는가 */
async function leaveMatchup({ question, ctx, data, ask }: Intent, deps: PlanDeps): Promise<AnswerPlan | undefined> {
  /*
   * 게임과 무관한 말("내일 날씨 어때?", "라면 맛있게 끓이는 법")은 앞 상성의 이어 묻기가 아니다. 갈래가 잡담이고,
   * 문형("왜?", "풀어서")·조언 요청("팁 좀", "any tips?")이 없을 때만. 대화 흐름 시험에서 이어 묻기 133 중 0 을 끊고
   * 답 없는 질문 119 중 무관한 것 9 를 잡았다. `OFF_TOPIC` 은 갈래와 상관없이 본다 — 판정기가 잡담으로 못 가른 것도 잡는다.
   */
  if (OFF_TOPIC.test(question) || (ask === "chat" && !actFromWords(question) && !FOLLOWUP_GUARD.test(question))) {
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
async function matchupTopic(question: string, data: AdvisorData, ctx: PlanContext, pair: ChampionCard[], deps: PlanDeps): Promise<string | undefined> {
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
async function answerMatchupWithRecent({ question, ctx, champions, ask, recent, topic }: Intent): Promise<AnswerPlan | undefined> {
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
async function answerMatchupOfMany({ question, ctx, data, champions, ask, topic }: Intent): Promise<AnswerPlan | undefined> {
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
async function answerMatchupOfTwo({ question, ctx, champions, ask, route, topic }: Intent): Promise<AnswerPlan | undefined> {
  if (champions.length !== 2 || ask !== "matchup") return undefined;
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

/**
 * 이름이 아예 없다. 아이템·게임 규칙 이름이면 그것이 답이다. 맥락 챔피언을 붙이기
 * 전에 본다 — 말파이트 표를 보며 "쇼진의 창 효과" 를 물으면 아이템 질문이다.
 */
function answerItemOrMechanics({ question, data, champions, recentItem }: Intent): AnswerPlan | undefined {
  if (champions.length !== 0) return undefined;
  const itemAnswer = buildItemCard(data, question, recentItem);
  if (itemAnswer) return { type: "code", answer: itemAnswer };
  const mechanicsAnswer = buildMechanicsAnswer(data, question);
  return mechanicsAnswer ? { type: "code", answer: mechanicsAnswer } : undefined;
}

/** 챔피언 질문. 이름이 없으면 대화·화면의 챔피언을 붙인다. */
async function answerChampion(intent: Intent): Promise<AnswerPlan | undefined> {
  const { question, ctx, champions, slot, ask } = intent;
  // 아이템 갈래인데 아이템 이름이 없으면("그럼 템은?") 대화·화면 챔피언의 아이템 노트를 묻는 것이다
  const itemWithoutName = ask === "item" && !buildItemCard(intent.data, question, intent.recentItem);
  // 챔피언 카드 뒤의 "그럼 한타 때는?", "라인전은?" — 이름 없는 공략 갈래나 주제 낱말은 대화·화면 챔피언의 그 주제 노트다(2026-09-30 브라우저 시험: "자료 없음" 으로 빠짐)
  const guideFollowup = ask === "guide" || Boolean(topicFromWords(question));
  const about = champions.length === 0 && (looksChampionDirected(question, slot, ask) || itemWithoutName || guideFollowup) ? championsFromContext(intent) : { champions, notice: ctx.notice };
  if ("type" in about) return about;
  if (about.champions.length === 0) return undefined;
  // 둘 이상을 견주는 질문은 코드가 표로 견준다. 모델이 도구로 수치를 꺼내 글로
  // 견주게 했을 때는 30초 걸리고 "665이고," 에서 끊기기도 했다.
  if (asksComparison(question, about.champions.length) || about.champions.length > 1) {
    // 여럿을 한데 묻는 말도 나란히 놓은 표로 답한다
    // 상성 대화 중의 조회 표는 상성 맥락을 잇는다(`matchupStateOf`)
    const card = buildCompareCard(about.champions, question, slot, { lang: ctx.lang });
    return { type: "card", answer: intent.matchup && card.kind === "compare" ? { ...card, inMatchup: true } : card, notice: about.notice };
  }
  return answerOneChampion(intent, about.champions[0], about.notice);
}

/**
 * 챔피언을 겨냥했는데 이름이 없으면 맥락에서 가져온다. 대화에서 방금 다룬 챔피언이
 * 먼저, 없으면 화면에 떠 있는 것 — 표를 보면서 "W 쿨타임" 이라 물으면 화면의 W 다.
 * 누구 것인지 정할 수 없으면 답(되묻기·나란히 놓기)을 돌려준다.
 */
function championsFromContext({ question, ctx, data, recent, slot, ask }: Intent): AnswerPlan | { champions: ChampionCard[]; notice?: string } {
  const onScreen = ctx.championIds.map((id) => data.cardById.get(id)).filter((card): card is ChampionCard => Boolean(card));
  const source = recent.length ? recent : onScreen;
  const fromWhere = recent.length ? ctx.copy.card.fromChat : ctx.copy.card.fromScreen;
  if (source.length === 1) return { champions: source, notice: ctx.notice ?? fill(fromWhere, { name: source[0].name }) };
  if (source.length === 0) return { champions: [], notice: ctx.notice };
  if (asksComparison(question, source.length)) return { champions: source, notice: ctx.notice ?? fill(fromWhere, { name: source.map((card) => card.name).join("·") }) };
  if (slot) {
    // VS 화면에 둘이 떠 있는데 "W 쿨타임" 이면 둘의 W 를 나란히 놓는다. 견주러 온
    // 화면에서 "누구 것?" 하고 되묻는 것보다 둘 다 보여 주는 쪽이 답이다.
    const names = source.map((card) => card.name).join("·");
    return { type: "card", answer: buildCompareCard(source, question, slot, { lang: ctx.lang }), notice: ctx.notice ?? fill(fromWhere, { name: names }) };
  }
  // 상성을 말한 뒤의 "스킬 쿨타임" 은 내 챔피언(앞쪽) 것이다.
  // 상성·비교 뒤의 스킬 수치 조회("list their ability cooldowns")는 둘의 표다. 한쪽만 주면 나머지를 되물어야 한다.
  if (recent.length === 2 && ask === "spellStat") return { champions: source, notice: ctx.notice ?? fill(fromWhere, { name: source.map((card) => card.name).join("·") }) };
  if (recent.length) return { champions: [source[0]], notice: ctx.notice ?? fill(fromWhere, { name: source[0].name }) };
  // 화면에 둘이 있는데 슬롯도 비교도 아니면 누구 것인지 묻는다.
  return { type: "code", answer: { kind: "suggestion", original: question, candidates: source, reason: "ambiguous" }, pending: true };
}

/**
 * 챔피언 한 명을 묻는 질문의 답.
 *
 * **모델을 거치지 않는다.** 자료를 붙여 모델에게 넘겼더니 받아 적기만 하다가
 * 900토큰에서 잘렸다. 럼블은 카드 본문만 2,654자라 끝까지 닿지 못했고,
 * 능력치 표를 통째로 빠뜨린 채 문장 중간에서 끊겼다.
 *
 * 자료가 곧 답인 질문이다. 코드가 내면 잘리지 않고, 빠뜨리지 않고, 즉시 나간다.
 *
 * 프롬프트가 아니므로 지식 카드를 자르지 않는다. (자료를 프롬프트에 붙이던 때) `buildChampionBrief` 가
 * 4건·3건으로 줄인 것은 프롬프트가 6천 자에 닿으면 브라우저 런타임이 죽기 때문이었는데,
 * 여기는 화면에 바로 나가는 글이라 그 제약이 없다.
 */
async function answerOneChampion({ question, ctx, data, ask, topic: judgeTopicOnce, slot }: Intent, card: ChampionCard, notice: string | undefined): Promise<AnswerPlan> {
  // "패시브와 네 가지 스킬을 각각" 은 패시브 한 칸이 아니라 스킬 전체 소개다
  const spell = slot && !asksWholeKit(question) ? card.spells.find((entry) => entry.slot === slot) : undefined;
  if (spell) return { type: "card", answer: buildSpellCard(card, spell, question, ctx.lang), notice };
  // 효과 태그 예/아니오는 코드가 바로 답한다. 태그가 없다는 사실을 근거로
  // "아니다" 라고 말하는 것을 모델이 못 한다.
  const tagAnswer = buildTagAnswer(data, card, question);
  if (tagAnswer) return { type: "code", answer: tagAnswer, notice };
  // "말파이트 스킬 설명해줘": 스킬 다섯 개의 요약 + 운용 노트. 능력치 표는 뺀다.
  if (ask === "skills" || asksWholeKit(question)) {
    return { type: "card", answer: { kind: "champion", card, view: "skills", notes: championNotes(data, card, question, undefined, await judgeTopicOnce()) }, notice };
  }
  // "말파이트 스킬 쿨타임": 슬롯 없이 사실 하나를 물으면 스킬 다섯 개의 그 사실을 표로.
  const focus = detectSpellFocus(question)?.focus;
  if (focus && focus !== "damage") {
    /*
     * 수치 하나를 물은 것이니 그 수치만 준다.
     *
     * 한때 표 밑에 운용 노트를 얹었다. 답이 대화에도 글로 적히니 카드는 더
     * 줘도 된다고 봤는데, "오공 스킬 쿨타임" 에 "오공을 상대할 때 · 플레이할
     * 때" 가 따라 나와 무엇을 답한 것인지 흐려졌다. 묻지 않은 것이다.
     */
    return { type: "card", answer: { kind: "champion", card, focus }, notice };
  }
  return { type: "card", answer: { kind: "champion", card, notes: championNotes(data, card, question, undefined, await judgeTopicOnce()) }, notice };
}

/** 어느 이름도 없고 벡터 검색도 답을 못 냈다. 질문 낱말로 찾는다. 동의 전이면 모델에게 넘긴다. */
function answerFromNotes({ question, ctx, data, ask }: Intent): AnswerPlan | undefined {
  if (!ctx.consented) return undefined;
  const corpus = buildSearchCorpus(data, ctx.lang);
  /*
   * 게임 규칙·메타(항복·오브젝트 시간·챔피언 가격·랭크)는 자료에 없는 것이 많다. 갈래가 게임 규칙인 질문이
   * 낱말 검색에도 안 걸리면 자료가 없다는 안내(`noGameData`)를 보인다.
   */
  if (ask === "game" && !lexicalSearch(corpus, question).length) return { type: "code", answer: ctx.copy.noGameData };
  // 모델은 카드 없는 답을 쓰지 않는다. 질문 낱말로 찾아 걸린 자료 문장을 그대로 보인다(`hitsToAnswer`). 없으면 자료가 없다고 말한다.
  const shown = hitsToAnswer(lexicalSearch(corpus, question), question);
  return { type: "code", answer: shown ? `${shown}\n\n${ctx.copy.fromNotes}` : ctx.copy.noLiteAnswer };
}
