/** 질문 계획의 입력과 출력. 화면 실행·모델 구현·저장과 분리된 계약. */
import type { Language } from "@/i18n";
import type { Translations } from "@/i18n/translations";
import { type AdvisorData } from "./context";
import { type AdvisorAnswer } from "./answer";
import { type AskKind, type AskRoute } from "./routeAsk";
import type { topicFromJudge } from "./topicJudge";
import { type MatchupState } from "./conversation";
import type { JudgeQuestion } from "./judge";
import type { ChampionCard } from "@/lib/knowledge/facts";
import type { DialogueHistoryTurn, DialogueMemory } from "./dialogueState";
import type { ResolvedQuestion } from "./resolvedQuestion";
import type { ChampionStatQuery } from "./statQuery";
import type { CrowdControlType } from "@/lib/knowledge/crowdControl";

/** 자료 조회·상성·확인·생성 중 질문 하나를 답할 계획. 조립 단계가 실행한다. */
export interface ControlContext { champions: string[]; slot?: string; types?: CrowdControlType[] }
export type AnswerPlan = (
  /** 코드가 만든 카드(`deliver`) */
  | { type: "card"; answer: AdvisorAnswer; notice?: string }
  /** 상성 카드 + 미리 써 둔 답(`deliverMatchup`) */
  | { type: "matchup"; mine: ChampionCard; enemy: ChampionCard; notice?: string; focus?: string; more?: boolean; continuation?: "explain" | "advance" }
  /**
   * 코드가 쓴 답을 그대로(`answerWithoutModel`). `related` 는 "혹시 이 자료를?" 에 걸 자료.
   * `pending` 이면 오타 후보를 물은 것이라 고르면 이 질문을 고쳐 다시 묻는다.
   * `knowledge` 는 본문 서식에 제목이 없어도 자료의 주제를 기억하는 데 쓴다.
   */
  | { type: "code"; answer: AdvisorAnswer | string; knowledge?: { id: string; title: string }; notice?: string; related?: Array<{ id: string; title: string }>; pending?: true }
  /** 오타 하나를 고쳐 다시 묻는다 */
  | { type: "retry"; question: string; notice?: string }
  /** 모델에게 넘긴다(`respond`) */
  | { type: "respond"; plan: { system: string; withoutConsent: string } }
) & { controlContext?: ControlContext };

/** 구조화된 답과 코드 기억을 함께 담는 대화 턴. */
export type PlanTurn = DialogueHistoryTurn;

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
  /** 실험용 능력치 판정. 명확한 규칙 조회가 실패한 경우에만 호출한다. */
  inferStatQuery?: (question: ResolvedQuestion, memory: DialogueMemory, ctx: PlanContext) => Promise<ChampionStatQuery | undefined>;
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

export type Step = (intent: Intent, deps: PlanDeps) => AnswerPlan | undefined | Promise<AnswerPlan | undefined>;
