import { useCallback, useMemo, useRef, useState } from "react";
import { type AdvisorAnswer } from "@/lib/advisor/answer";
import { dialogueAnswerText, type AnswerDelivery } from "@/lib/advisor/dialogueReply";
import type { DialogueMemory } from "@/lib/advisor/dialogueState";
import type { DialogueTrace } from "@/lib/advisor/requestContract";
import type { Language } from "@/i18n";
import type { AdvisorChatMessage, AdvisorResponse } from "@/lib/advisor/protocol";
import type { HistorySource } from "@/lib/advisor/historySnapshot";
import type { StoredTurn } from "@/lib/advisor/history";
import type { ChampionDetailV2 } from "@/data/contracts/championData";
import { decodeChampionDetail } from "@/data/contracts/championDataDecoder";
import { matchesDetailSource } from "@/lib/advisor/championDetail";
import { advisorReferenceChampionIds } from "./useAdvisorHistoryDetails";
import { useRevealText } from "./useRevealText";

export interface AdvisorTurn extends AdvisorChatMessage {
  id: number;
  source?: HistorySource;
  details?: Record<string, ChampionDetailV2>;
  historical?: StoredTurn;
  referenceUnavailable?: boolean;
  /** 생성이 끝난 뒤 붙는 실측치 */
  /** ttft 는 프롬프트를 읽는 데 쓴 시간이다. 나머지가 글을 쓰는 시간이다. */
  stats?: { tokens: number; seconds: number; ttft?: number; promptTokens?: number };
  /** 사용자가 남긴 평가 */
  rating?: "up" | "down";
  /**
   * 지금 무엇을 하는 중인지. 답이 나오면 지운다.
   *
   * 검색 폴백은 모델을 두 번 부르고 그 사이에 코드가 찾는다. 그동안 화면에는
   * 도는 점만 있어서 멈춘 것처럼 보였다. 무슨 일이 도는지 한 줄로 알린다.
   */
  activity?: string;
  /**
   * 답의 근거가 된 자료 이름.
   *
   * "자료에 있는 것만 답한다" 가 설계인데 어느 자료인지 안 보이면 사용자가
   * 맞는지 가릴 수 없다. 틀린 자료를 물어 온 경우에도 그 사실이 드러나야 한다.
   */
  sources?: string[];
  /**
   * 코드가 만든 구조화된 답. 화면이 종류별 카드로 그린다.
   * 이것이 있으면 `content` 는 카드 위에 놓이는 모델 해설이다.
   */
  answer?: AdvisorAnswer;
  answers?: AdvisorAnswer[];
  /** 답 위에 작게 붙는 알림. "럼블로 이해했습니다" 같은 것. */
  notice?: string;
  /** "혹시 이 자료를 찾으셨나요?" 에 붙는 자료 버튼. 검색이 확신하지 못했을 때만. 누르면 그 자료를 보인다. */
  related?: Array<{ id: string; title: string }>;
  /**
   * `content` 를 코드가 썼는가.
   *
   * 모델이 쓴 글은 카드 위에 얹히는 **해설**이라 "해설" 딱지와 세로줄을 달고 나간다.
   * 코드가 쓴 글은 해설이 아니라 **답 자체**라 그 딱지를 달면 거짓말이 된다.
   * 근거 검사도 모델이 쓴 글에만 돌린다 — 코드가 쓴 글은 카드에서 옮긴 값이다.
   */
  byCode?: boolean;
  /** 이 답이 확정한 대화 대상·사용자 조건. 기록을 복원하면 함께 되살린다. */
  memory?: DialogueMemory;
  trace?: DialogueTrace;
}

type DoneMessage = Extract<AdvisorResponse, { type: "done" }>;

export function useAdvisorTurns(lang: Language, setError: (error: string | null) => void, source?: HistorySource) {
  const [turns, setTurns] = useState<AdvisorTurn[]>([]);
  const nextId = useRef(1);
  const patch = source?.patch;
  const locale = source?.locale;
  const ddragonVersion = source?.ddragonVersion;
  const currentSource = useMemo(() => patch === undefined || locale === undefined || ddragonVersion === undefined
    ? undefined : { patch, locale, ddragonVersion }, [patch, locale, ddragonVersion]);
  /** `begin` 이 띄운 자리. 답이 채우면 비운다. */
  const pendingRef = useRef<{ userId: number; replyId: number; source?: HistorySource } | null>(null);
  const [thinking, setThinking] = useState(false);
  const writeContent = useCallback((id: number, content: string) => {
    setTurns((prev) => prev.map((turn) => (turn.id === id ? { ...turn, content } : turn)));
  }, []);
  const { reveal, finishReveal, revealing } = useRevealText(writeContent);

  const takeId = useCallback(() => nextId.current++, []);

  const begin = useCallback((question: string, label: string) => {
    const trimmed = question.trim();
    if (!trimmed || pendingRef.current) return;
    const userId = nextId.current++;
    const replyId = nextId.current++;
    const startedSource = currentSource ? structuredClone(currentSource) : undefined;
    pendingRef.current = { userId, replyId, source: startedSource };
    setError(null);
    setThinking(true);
    setTurns((prev) => [
      ...prev,
      { id: userId, role: "user", content: trimmed, source: startedSource },
      { id: replyId, role: "assistant", content: "", activity: label, source: startedSource },
    ]);
  }, [setError, currentSource]);

  /** 답 자리를 연다. `begin` 이 띄운 자리가 있으면 그것을 채우고, 없으면 새로 붙인다. 답의 id 를 돌려준다. */
  const place = useCallback((question: string, reply: Omit<AdvisorTurn, "id">): number => {
    const pending = pendingRef.current;
    const startedSource = pending ? pending.source : currentSource ? structuredClone(currentSource) : undefined;
    const assistant = { ...reply, source: startedSource };
    pendingRef.current = null;
    setThinking(false);
    if (pending) {
      setTurns((prev) =>
        prev.map((turn) =>
          turn.id === pending.userId ? { ...turn, content: question } : turn.id === pending.replyId ? { id: pending.replyId, ...assistant } : turn,
        ),
      );
      return pending.replyId;
    }
    const userId = nextId.current++;
    const replyId = nextId.current++;
    setTurns((prev) => [...prev, { id: userId, role: "user", content: question, source: startedSource }, { id: replyId, ...assistant }]);
    return replyId;
  }, [currentSource]);

  const attachReferenceDetail = useCallback((turnId: number, raw: ChampionDetailV2) => {
    let detail: ChampionDetailV2;
    try {
      detail = decodeChampionDetail(raw);
    } catch {
      return;
    }
    const id = detail.champion.id;
    setTurns(prev => {
      const index = prev.findIndex(turn => turn.id === turnId);
      const turn = prev[index];
      if (!turn || turn.role !== "assistant" || turn.historical || !turn.source || turn.details?.[id]
        || !advisorReferenceChampionIds(turn).includes(id) || !matchesDetailSource(detail, turn.source, id)) return prev;
      const next = [...prev];
      next[index] = { ...turn, details: { ...turn.details, [id]: structuredClone(detail) } };
      return next;
    });
  }, []);

  const settle = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    setThinking(false);
    setTurns((prev) => prev.filter((turn) => turn.id !== pending.userId && turn.id !== pending.replyId));
  }, []);

  const appendChunk = useCallback((id: number, text: string) => {
    setTurns((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.role === "assistant" && last.id === id) {
        next[next.length - 1] = { ...last, content: last.content + text };
      }
      return next;
    });
  }, []);

  const completeReply = useCallback((message: DoneMessage) => {
    setTurns((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.role === "assistant" && last.id === message.id) {
        next[next.length - 1] = {
          ...last,
          content: message.text || last.content,
          stats: {
            tokens: message.tokens,
            seconds: message.seconds,
            ttft: message.ttftSeconds,
            promptTokens: message.promptTokens,
          },
        };
      }
      return next;
    });
  }, []);

  /**
   * 모델을 부르지 않고 답을 얹는다.
   *
   * 코드 전용 답변은 평가에서 적중 63/66 으로 모델(64/66)과 거의 같았다.
   * 모델(570MB)을 받지 않은 사용자에게도 이 답은 줄 수 있어야 한다.
   *
   * 카드만 얹으면 대화에는 칩 하나만 남아 답을 못 받은 화면이 된다. 그래서
   * `answerProse` 로 **카드 안의 값을 문장으로도** 적는다. 모델이 쓰는 글이 아니라
   * 카드에 이미 있는 값을 옮기는 것이라 틀릴 자리가 없다.
   */
  const answerWithoutModel = useCallback(
    (question: string, answer: AnswerDelivery, notice?: string, related?: AdvisorTurn["related"]) => {
      setError(null);
      // 카드는 바로, 글은 흘려서 보인다(`reveal`)
      const full = typeof answer === "string" ? answer : "answers" in answer ? answer.text : dialogueAnswerText(answer, lang);
      const id =
        typeof answer === "string"
          ? place(question, { role: "assistant", content: "", notice, related, byCode: true })
          : "answers" in answer
            ? place(question, { role: "assistant", content: "", answers: answer.answers, notice, related, byCode: true })
            : place(question, { role: "assistant", content: "", answer, notice, byCode: true });
      reveal(id, full);
    },
    [lang, place, reveal, setError],
  );

  const remember = useCallback((memory: DialogueMemory, trace?: DialogueTrace) => {
    setTurns(prev => {
      const last = prev[prev.length - 1];
      if (last?.role !== "assistant") return prev;
      return [...prev.slice(0, -1), { ...last, memory: structuredClone(memory), trace: trace ? structuredClone(trace) : undefined }];
    });
  }, []);

  const reset = useCallback(() => {
    finishReveal();
    pendingRef.current = null;
    setThinking(false);
    setTurns([]);
    setError(null);
  }, [finishReveal, setError]);

  const replaceTurns = useCallback((next: AdvisorTurn[]) => {
    finishReveal();
    pendingRef.current = null;
    setThinking(false);
    const maxId = next.reduce((max, turn) => Math.max(max, turn.id), 0);
    if (maxId >= nextId.current) nextId.current = maxId + 1;
    setTurns(next);
    setError(null);
  }, [finishReveal, setError]);

  return {
    turns,
    setTurns,
    takeId,
    begin,
    place,
    settle,
    reveal,
    finishReveal,
    working: thinking || revealing,
    appendChunk,
    completeReply,
    answerWithoutModel,
    remember,
    reset,
    replaceTurns,
    attachReferenceDetail,
  };
}
