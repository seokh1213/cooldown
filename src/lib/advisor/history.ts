/**
 * 대화 기록. 이 기기의 localStorage 에만 남는다.
 *
 * 답 카드는 챔피언 카드(수 KB)를 통째로 들고 있어 그대로 저장하면 대화 스무 개에
 * 수백 KB 가 된다. 카드는 id 로만 남기고(dehydrate) 불러올 때 자료에서 다시 채운다(revive).
 * 자료가 바뀌어 id 가 사라진 답은 조용히 버린다 — 낡은 카드를 현재값처럼 보이는 것이 최악이다.
 */
import type { AdvisorAnswer, CompareRow, Fact, SpellFocus } from "./answer";
import type { AdvisorData } from "./context";
import type { AdvisorTurn } from "@/hooks/useAdvisor";

export const CONVERSATIONS_KEY = "cooldown.advisor.conversations.v1";
/** 남기는 대화 수. 넘으면 오래된 것부터 버린다. */
export const CONVERSATION_LIMIT = 20;
/** 대화 하나에 남기는 발화 수. */
export const TURN_LIMIT = 80;
const TITLE_LENGTH = 40;

export type StoredAnswer =
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
      focus?: SpellFocus;
      view?: "skills";
      notes?: { playing: string[]; against: string[] };
    }
  | { kind: "rule"; ruleName: string; highlighted: string[]; rest: string[] }
  | { kind: "suggestion"; original: string; candidateIds: string[]; reason?: "typo" | "ambiguous" }
  | {
      kind: "compare";
      cardIds: string[];
      level?: 1 | 6 | 11 | 18;
      slot?: string;
      rows: CompareRow[];
      headline?: Fact;
      matchup?: boolean;
      notes?: { mine: string[]; enemy: string[] };
    }
  | { kind: "item"; itemId: string; itemName: string; text: string }
  | { kind: "text"; text: string };

export interface StoredTurn {
  id: number;
  role: "user" | "assistant";
  content: string;
  stats?: { tokens: number; seconds: number };
  rating?: "up" | "down";
  sources?: string[];
  notice?: string;
  answer?: StoredAnswer;
}

export interface Conversation {
  id: string;
  /** 첫 질문. 목록에 보이는 이름이다. */
  title: string;
  createdAt: string;
  updatedAt: string;
  turns: StoredTurn[];
}

export function dehydrateAnswer(answer: AdvisorAnswer): StoredAnswer {
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
      return { kind: "champion", cardId: answer.card.id, focus: answer.focus, view: answer.view, notes: answer.notes };
    case "rule":
      return { kind: "rule", ruleName: answer.rule.name, highlighted: answer.highlighted, rest: answer.rest };
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
        level: answer.level,
        slot: answer.slot,
        rows: answer.rows,
        headline: answer.headline,
        matchup: answer.matchup,
        notes: answer.notes,
      };
    case "item":
      return { kind: "item", itemId: answer.itemId, itemName: answer.itemName, text: answer.text };
    case "text":
      return { kind: "text", text: answer.text };
  }
}

/** 자료에서 카드를 다시 채운다. 없어진 챔피언·규칙이면 undefined. */
export function reviveAnswer(stored: StoredAnswer, data: AdvisorData): AdvisorAnswer | undefined {
  switch (stored.kind) {
    case "spell": {
      const card = data.cardById.get(stored.championId);
      const spell = card?.spells.find((entry) => entry.slot === stored.slot);
      if (!card || !spell) return undefined;
      return {
        kind: "spell",
        championId: card.id,
        championName: card.name,
        spell,
        focus: stored.focus,
        headline: stored.headline,
        facts: stored.facts,
        highlighted: stored.highlighted,
      };
    }
    case "champion": {
      const card = data.cardById.get(stored.cardId);
      return card ? { kind: "champion", card, focus: stored.focus, view: stored.view, notes: stored.notes } : undefined;
    }
    case "rule": {
      const rule = data.ruleIndex.get(stored.ruleName);
      return rule ? { kind: "rule", rule, highlighted: stored.highlighted, rest: stored.rest } : undefined;
    }
    case "suggestion": {
      const candidates = stored.candidateIds
        .map((id) => data.cardById.get(id))
        .filter((card): card is NonNullable<typeof card> => Boolean(card));
      return candidates.length ? { kind: "suggestion", original: stored.original, candidates, reason: stored.reason } : undefined;
    }
    case "compare": {
      const cards = stored.cardIds.map((id) => data.cardById.get(id));
      if (cards.some((card) => !card)) return undefined;
      return {
        kind: "compare",
        cards: cards as NonNullable<(typeof cards)[number]>[],
        level: stored.level,
        slot: stored.slot,
        rows: stored.rows,
        headline: stored.headline,
        matchup: stored.matchup,
        notes: stored.notes,
      };
    }
    case "item":
      return { kind: "item", itemId: stored.itemId, itemName: stored.itemName, text: stored.text };
    case "text":
      return { kind: "text", text: stored.text };
  }
}

export function dehydrateTurn(turn: AdvisorTurn): StoredTurn {
  // 화면 발화는 사용자·도우미 둘뿐이다. system 은 프롬프트라 대화에 오지 않는다.
  const stored: StoredTurn = { id: turn.id, role: turn.role === "user" ? "user" : "assistant", content: turn.content };
  if (turn.stats) stored.stats = turn.stats;
  if (turn.rating) stored.rating = turn.rating;
  if (turn.sources) stored.sources = turn.sources;
  if (turn.notice) stored.notice = turn.notice;
  if (turn.answer) stored.answer = dehydrateAnswer(turn.answer);
  return stored;
}

/**
 * 발화를 되살린다. 카드가 있었는데 못 채우면 그 답은 버린다.
 * 진행 중 표시(activity)는 저장하지 않는다 — 불러온 대화에서 도는 점이 남으면 안 된다.
 */
export function reviveTurn(stored: StoredTurn, data: AdvisorData): AdvisorTurn | undefined {
  const turn: AdvisorTurn = { id: stored.id, role: stored.role, content: stored.content };
  if (stored.stats) turn.stats = stored.stats;
  if (stored.rating) turn.rating = stored.rating;
  if (stored.sources) turn.sources = stored.sources;
  if (stored.notice) turn.notice = stored.notice;
  if (stored.answer) {
    const answer = reviveAnswer(stored.answer, data);
    if (!answer) return undefined;
    turn.answer = answer;
  }
  return turn;
}

/** 저장된 대화에서 발화를 되살린다. 답이 사라진 질문은 질문까지 함께 빼서 짝을 맞춘다. */
export function reviveTurns(stored: StoredTurn[], data: AdvisorData): AdvisorTurn[] {
  const out: AdvisorTurn[] = [];
  for (let i = 0; i < stored.length; i += 1) {
    const turn = reviveTurn(stored[i], data);
    if (turn) {
      out.push(turn);
      continue;
    }
    // 답을 버렸으면 바로 앞의 질문도 버린다.
    if (out.length && out[out.length - 1].role === "user" && stored[i].role === "assistant") out.pop();
  }
  return out;
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
  return typeof c.id === "string" && typeof c.title === "string" && Array.isArray(c.turns);
}

export function readConversations(storage: StorageLike | undefined = browserStorage()): Conversation[] {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(CONVERSATIONS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isConversation) : [];
  } catch {
    return [];
  }
}

export function writeConversations(list: Conversation[], storage: StorageLike | undefined = browserStorage()): void {
  try {
    storage?.setItem(CONVERSATIONS_KEY, JSON.stringify(list.slice(0, CONVERSATION_LIMIT)));
  } catch {
    // 저장 공간이 막혀도 이번 세션의 대화는 화면에 있다.
  }
}

/** 대화를 갈아 넣거나 앞에 붙인다. 최근 것이 앞이다. */
export function upsertConversation(list: Conversation[], conversation: Conversation): Conversation[] {
  const rest = list.filter((entry) => entry.id !== conversation.id);
  return [conversation, ...rest].slice(0, CONVERSATION_LIMIT);
}
