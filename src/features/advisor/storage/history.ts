/** 대화와 카드 원본을 이 기기에 저장한다. 과거 카드를 현재 자료로 다시 채우지 않는다. */
import type { AdvisorAnswer, CompareRow, Fact, ItemEffect, ItemVerdict } from "../answers/answer";
import type { SpellFocus } from "../understanding/spellFocus";
import type { AdvisorData } from "../conversation/context";
import type { NotePerspective } from "../retrieval/noteSelect";
import type { AdvisorTurn } from "@/features/advisor/session/useAdvisorTurns";
import type { DialogueMemory } from "../conversation/dialogueState";
import type { ChampionStatQuery } from "../understanding/statQuery";
import type { DialogueTrace } from "../contracts/requestContract";
import { isStoredAnswer, isStoredTurn, validStoredTurns } from "./historyValidation";
import { isHistorySource, isSnapshotAnswer, type HistorySource } from "./historySnapshot";
import { reviveChampionDetails } from "../answers/championDetail";
import type { ChampionDetailV2 } from "@/domain/game/contracts/championData";

export const CONVERSATIONS_KEY = "cooldown.advisor.conversations.v1";
/** 남기는 대화 수. 넘으면 오래된 것부터 버린다. */
export const CONVERSATION_LIMIT = 20;
/** 대화 하나에 남기는 발화 수. */
export const TURN_LIMIT = 80;
const TITLE_LENGTH = 40;

type StoredAnswerReference =
  | {
      kind: "spell";
      championId: string;
      slot: string;
      focus?: SpellFocus;
      headline?: Fact;
      facts: Fact[];
      highlighted: string[];
    }
  | {
      kind: "champion";
      cardId: string;
      statQuery?: ChampionStatQuery;
      headline?: Fact;
      focus?: SpellFocus;
      view?: "skills" | "overview";
      /**
       * `perspective` 는 나중에 생긴 값이라 옛 대화에는 없다. 되살릴 때 채운다.
       * 저장된 것을 고쳐 쓰지 않는 이유는, 옛 기록이 그때 무엇을 보여 줬는지가
       * 남아야 하기 때문이다. 없으면 예전 순서("플레이할 때" 먼저)가 된다.
       */
      notes?: { playing: string[]; against: string[]; perspective?: NotePerspective; detail?: "full"; topic?: "combo"; sources?: string[]; unavailable?: string[] };
    }
  | { kind: "rule"; ruleName: string; highlighted: string[]; rest: string[]; focus?: SpellFocus }
  | { kind: "suggestion"; original: string; candidateIds: string[]; reason?: "typo" | "ambiguous" }
  | {
      kind: "compare";
      cardIds: string[];
      statQuery?: ChampionStatQuery;
      level?: 1 | 6 | 11 | 18;
      slot?: string;
      focus?: SpellFocus;
      rows: CompareRow[];
      headline?: Fact;
      headlines?: Fact[];
      matchup?: boolean;
      notes?: { mine: string[]; enemy: string[] };
    }
  | {
      kind: "item";
      itemId: string;
      itemName: string;
      price?: number;
      stats: Fact[];
      effects: ItemEffect[];
      verdicts: ItemVerdict[];
    }
  | { kind: "text"; text: string };

export type StoredAnswer = StoredAnswerReference & { snapshot?: AdvisorAnswer };

export interface StoredTurn {
  source?: HistorySource;
  details?: Record<string, ChampionDetailV2>;
  id: number;
  role: "user" | "assistant";
  content: string;
  stats?: { tokens: number; seconds: number };
  rating?: "up" | "down";
  sources?: string[];
  notice?: string;
  /**
   * 코드가 쓴 답인가. 이것을 빼먹으면 되살린 대화에서 코드 답문이 모델 해설로
   * 둔갑해 "AI 해설" 딱지가 붙고, 근거 검사까지 돌아 숫자가 든 문장이 잘려 나간다.
   */
  byCode?: boolean;
  answer?: StoredAnswer;
  answers?: StoredAnswer[];
  memory?: DialogueMemory;
  trace?: DialogueTrace;
}

export interface Conversation {
  id: string;
  /** 첫 질문. 목록에 보이는 이름이다. */
  title: string;
  createdAt: string;
  updatedAt: string;
  turns: StoredTurn[];
}

function answerReference(answer: AdvisorAnswer): StoredAnswerReference {
  switch (answer.kind) {
    case "spell":
      return {
        kind: "spell",
        championId: answer.championId,
        slot: answer.spell.slot,
        focus: answer.focus,
        headline: answer.headline,
        facts: answer.facts,
        highlighted: answer.highlighted,
      };
    case "champion":
      return { kind: "champion", cardId: answer.card.id, focus: answer.focus, view: answer.view, notes: answer.notes, statQuery: answer.statQuery, headline: answer.headline };
    case "rule":
      return { kind: "rule", ruleName: answer.rule.name, highlighted: answer.highlighted, rest: answer.rest, focus: answer.focus };
    case "suggestion":
      return {
        kind: "suggestion",
        original: answer.original,
        candidateIds: answer.candidates.map((card) => card.id),
        reason: answer.reason,
      };
    case "compare":
      return {
        kind: "compare",
        cardIds: answer.cards.map((card) => card.id),
        statQuery: answer.statQuery,
        level: answer.level,
        slot: answer.slot,
        focus: answer.focus,
        rows: answer.rows,
        headline: answer.headline,
        headlines: answer.headlines,
        matchup: answer.matchup,
        notes: answer.notes,
      };
    case "item":
      return {
        kind: "item",
        itemId: answer.itemId,
        itemName: answer.itemName,
        price: answer.price,
        stats: answer.stats,
        effects: answer.effects,
        verdicts: answer.verdicts,
      };
    case "text":
      return { kind: "text", text: answer.text };
  }
}

export function dehydrateAnswer(answer: AdvisorAnswer): StoredAnswer {
  return structuredClone({ ...answerReference(answer), snapshot: answer });
}

function snapshotMatches(stored: StoredAnswer, answer: AdvisorAnswer): boolean {
  if (stored.kind !== answer.kind) return false;
  switch (stored.kind) {
    case "champion": return answer.kind === "champion" && stored.cardId === answer.card.id;
    case "spell": return answer.kind === "spell" && stored.championId === answer.championId && stored.slot === answer.spell.slot;
    case "rule": return answer.kind === "rule" && stored.ruleName === answer.rule.name;
    case "compare": return answer.kind === "compare" && JSON.stringify(stored.cardIds) === JSON.stringify(answer.cards.map(card => card.id));
    case "suggestion": return answer.kind === "suggestion" && JSON.stringify(stored.candidateIds) === JSON.stringify(answer.candidates.map(card => card.id));
    default: return true;
  }
}

/** 카드 원본이 없는 기존 기록은 현재 카드로 대체하지 않는다. */
export function reviveAnswer(stored: unknown, _data?: Pick<AdvisorData, "patch">): AdvisorAnswer | undefined {
  if (!isStoredAnswer(stored)) return undefined;
  if (isSnapshotAnswer(stored.snapshot) && snapshotMatches(stored, stored.snapshot)) {
    const answer = structuredClone(stored.snapshot);
    if (answer.kind === "champion" && answer.notes) answer.notes.perspective ??= "both";
    return answer;
  }
  if (stored.kind === "item" || stored.kind === "text") {
    const { snapshot: _snapshot, ...answer } = stored;
    return structuredClone(answer);
  }
  return undefined;
}

export function dehydrateTurn(turn: AdvisorTurn): StoredTurn {
  // 복원 과정에서 못 읽은 카드나 다른 패치의 기억도 저장 원문에 남긴다.
  if (turn.historical) return structuredClone({ ...turn.historical, rating: turn.rating });
  const stored: StoredTurn = { id: turn.id, role: turn.role === "user" ? "user" : "assistant", content: turn.content };
  if (turn.source) stored.source = structuredClone(turn.source);
  if (turn.details) stored.details = structuredClone(turn.details);
  if (turn.stats) stored.stats = turn.stats;
  if (turn.rating) stored.rating = turn.rating;
  if (turn.sources) stored.sources = turn.sources;
  if (turn.notice) stored.notice = turn.notice;
  if (turn.byCode) stored.byCode = true;
  if (turn.answer) stored.answer = dehydrateAnswer(turn.answer);
  if (turn.answers) stored.answers = turn.answers.map(dehydrateAnswer);
  if (turn.memory) stored.memory = structuredClone(turn.memory);
  if (turn.trace) stored.trace = structuredClone(turn.trace);
  return stored;
}

/** 카드 복원에 실패해도 당시 질문과 답문은 남긴다. 진행 중 상태는 되살리지 않는다. */
export function reviveTurn(stored: unknown, data: Pick<AdvisorData, "patch">): AdvisorTurn | undefined {
  if (!isStoredTurn(stored)) return undefined;
  const turn: AdvisorTurn = { id: stored.id, role: stored.role, content: stored.content, historical: structuredClone(stored) };
  if (stored.stats) turn.stats = stored.stats;
  if (stored.rating) turn.rating = stored.rating;
  if (stored.sources) turn.sources = stored.sources;
  if (stored.notice) turn.notice = stored.notice;
  if (stored.byCode) turn.byCode = true;
  if (isHistorySource(stored.source)) {
    turn.source = structuredClone(stored.source);
    turn.details = reviveChampionDetails(stored.details, stored.source);
  }
  if (stored.memory?.patch === data.patch) turn.memory = structuredClone(stored.memory);
  if (stored.trace) turn.trace = structuredClone(stored.trace);
  if (stored.answer) {
    turn.answer = reviveAnswer(stored.answer);
    if (!turn.answer) turn.referenceUnavailable = true;
  }
  if (stored.answers) {
    const answers = stored.answers.map(answer => reviveAnswer(answer));
    turn.answers = answers.filter((answer): answer is AdvisorAnswer => answer !== undefined);
    if (turn.answers.length !== answers.length) turn.referenceUnavailable = true;
  }
  return turn;
}

export function reviveTurns(stored: unknown, data: Pick<AdvisorData, "patch">): AdvisorTurn[] {
  if (!Array.isArray(stored)) return [];
  return validStoredTurns(stored).map(entry => reviveTurn(entry, data)).filter((turn): turn is AdvisorTurn => turn !== undefined);
}

export function conversationTitle(turns: readonly { role: string; content: string }[]): string {
  const first = turns.find((turn) => turn.role === "user")?.content.trim() ?? "";
  return first.length > TITLE_LENGTH ? `${first.slice(0, TITLE_LENGTH)}…` : first;
}

export function newConversationId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStorage(): StorageLike | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function isConversation(value: unknown): value is Conversation {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Partial<Conversation>;
  return typeof c.id === "string" && typeof c.title === "string" && Array.isArray(c.turns)
    && (c.createdAt === undefined || typeof c.createdAt === "string")
    && (c.updatedAt === undefined || typeof c.updatedAt === "string");
}

export function readConversations(storage: StorageLike | undefined = browserStorage()): Conversation[] {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(CONVERSATIONS_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter(isConversation).map(conversation => ({ ...conversation, turns: validStoredTurns(conversation.turns) }))
      : [];
  } catch {
    return [];
  }
}

export function writeConversations(list: Conversation[], storage: StorageLike | undefined = browserStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(CONVERSATIONS_KEY, JSON.stringify(list.slice(0, CONVERSATION_LIMIT)));
    return true;
  } catch {
    return false;
  }
}

/** 대화를 갈아 넣거나 앞에 붙인다. 최근 것이 앞이다. */
export function upsertConversation(list: Conversation[], conversation: Conversation): Conversation[] {
  const rest = list.filter((entry) => entry.id !== conversation.id);
  return [conversation, ...rest].slice(0, CONVERSATION_LIMIT);
}
