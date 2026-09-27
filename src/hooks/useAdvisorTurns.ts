import { useCallback, useRef, useState } from "react";
import { answerChampionIds, type AdvisorAnswer } from "@/lib/advisor/answer";
import { matchupStateOf } from "@/lib/advisor/conversation";
import { appendFeedback } from "@/lib/advisor/feedback";
import { answerProse } from "@/lib/advisor/prose";
import type { Language } from "@/i18n";
import type { AdvisorChatMessage, AdvisorResponse } from "@/lib/advisor/protocol";
import { useRevealText } from "./useRevealText";

export interface AdvisorTurn extends AdvisorChatMessage {
  id: number;
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
}

type DoneMessage = Extract<AdvisorResponse, { type: "done" }>;

export function useAdvisorTurns(lang: Language, setError: (error: string | null) => void) {
  const [turns, setTurns] = useState<AdvisorTurn[]>([]);
  const nextId = useRef(1);
  /** `begin` 이 띄운 자리. 답이 채우면 비운다. */
  const pendingRef = useRef<{ userId: number; replyId: number } | null>(null);
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
    pendingRef.current = { userId, replyId };
    setError(null);
    setThinking(true);
    setTurns((prev) => [
      ...prev,
      { id: userId, role: "user", content: trimmed },
      { id: replyId, role: "assistant", content: "", activity: label },
    ]);
  }, [setError]);

  /** 답 자리를 연다. `begin` 이 띄운 자리가 있으면 그것을 채우고, 없으면 새로 붙인다. 답의 id 를 돌려준다. */
  const place = useCallback((question: string, reply: Omit<AdvisorTurn, "id">): number => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    setThinking(false);
    if (pending) {
      setTurns((prev) =>
        prev.map((turn) =>
          turn.id === pending.userId ? { ...turn, content: question } : turn.id === pending.replyId ? { id: pending.replyId, ...reply } : turn,
        ),
      );
      return pending.replyId;
    }
    const userId = nextId.current++;
    const replyId = nextId.current++;
    setTurns((prev) => [...prev, { id: userId, role: "user", content: question }, { id: replyId, ...reply }]);
    return replyId;
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
    (question: string, answer: string | AdvisorAnswer, notice?: string, related?: AdvisorTurn["related"]) => {
      setError(null);
      // 카드는 바로, 글은 흘려서 보인다(`reveal`)
      const full = typeof answer === "string" ? answer : answerProse(answer, lang);
      const id =
        typeof answer === "string"
          ? place(question, { role: "assistant", content: "", notice, related })
          : place(question, { role: "assistant", content: "", answer, notice, byCode: true });
      reveal(id, full);
    },
    [lang, place, reveal, setError],
  );

  /*
   * 기록은 상태 갱신 함수 밖에서 남긴다. 갱신 함수 안에서 남기면 개발 모드(StrictMode)가 갱신 함수를 두 번 불러
   * 같은 평가가 두 번 쌓였다.
   */
  const rate = useCallback((turnId: number, rating: "up" | "down", patch: string) => {
    const index = turns.findIndex((t) => t.id === turnId);
    if (index < 0) return;
    // 같은 버튼을 다시 누르면 평가를 물린다
    const next = turns[index].rating === rating ? undefined : rating;
    setTurns((prev) => prev.map((t) => (t.id === turnId ? { ...t, rating: next } : t)));
    if (!next) return;
    // 바로 앞 사용자 발화가 이 답의 질문이다
    const before = turns.slice(0, index);
    const question = [...before].reverse().find((t) => t.role === "user");
    const questionAt = question ? before.lastIndexOf(question) : -1;
    const previousQuestion = [...before.slice(0, Math.max(0, questionAt))].reverse().find((t) => t.role === "user");
    const state = matchupStateOf(before.slice(0, Math.max(0, questionAt)).map((t) => (t.role === "assistant" ? t.answer : undefined)));
    const answer = turns[index].answer;
    try {
      appendFeedback({
        at: new Date().toISOString(),
        question: question?.content ?? "",
        answer: turns[index].content,
        rating,
        patch,
        lang,
        previousQuestion: previousQuestion?.content,
        previousMatchup: state ? { mine: state.mine.id, enemy: state.enemy.id } : undefined,
        answerKind: answer?.kind,
        champions: answer ? answerChampionIds(answer) : undefined,
      });
    } catch {
      // 저장에 실패해도 화면 표시는 유지한다
    }
  }, [turns, lang]);

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
    rate,
    reset,
    replaceTurns,
  };
}
