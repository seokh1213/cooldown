/**
 * 대화 기록을 localStorage 에 잇는다.
 *
 * 발화가 바뀌면 지금 대화를 저장하고(잠깐 모아서), 처음 열 때는 마지막 대화를 되살린다.
 * 새 대화·다른 대화 열기·삭제를 모델 저장 공간을 다루듯 제공한다.
 * 카드는 id 로만 저장하므로 되살리려면 자료(data)가 있어야 한다.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { AdvisorData } from "@/lib/advisor/context";
import {
  conversationTitle,
  dehydrateTurn,
  newConversationId,
  readConversations,
  reviveTurns,
  upsertConversation,
  writeConversations,
  TURN_LIMIT,
  type Conversation,
} from "@/lib/advisor/history";
import type { UseAdvisorResult } from "./useAdvisor";

const SAVE_DELAY_MS = 400;

export interface UseAdvisorHistoryResult {
  conversations: Conversation[];
  currentId: string;
  restoring: boolean;
  startNew: () => void;
  open: (id: string) => void;
  remove: (id: string) => void;
}

export function useAdvisorHistory(advisor: UseAdvisorResult, data: AdvisorData | null): UseAdvisorHistoryResult {
  const [conversations, setConversations] = useState<Conversation[]>(readConversations);
  const [currentId, setCurrentId] = useState(newConversationId);
  const [restoring, setRestoring] = useState(conversations.length > 0);
  const restored = useRef(false);
  const saveTimer = useRef<number | undefined>(undefined);
  const { turns, replaceTurns, reset } = advisor;
  const busy = advisor.status === "generating" || advisor.working;

  // 처음 자료가 오면 마지막 대화를 이어 붙인다. 새로 고쳐도 대화가 끊기지 않는다.
  useEffect(() => {
    if (restored.current || !data) return;
    restored.current = true;
    setRestoring(false);
    const latest = conversations[0];
    if (!latest || turns.length > 0) return;
    const revived = reviveTurns(latest.turns, data);
    if (revived.length === 0) return;
    setCurrentId(latest.id);
    replaceTurns(revived);
  }, [data, conversations, turns.length, replaceTurns]);

  // 완료된 답은 즉시 저장한다. 생성 중에만 모아서 쓰고, 페이지를 떠나면 남은 저장을 처리한다.
  useEffect(() => {
    if (restoring || turns.length === 0) return;
    window.clearTimeout(saveTimer.current);
    const save = () => {
      const previous = readConversations();
      const existing = previous.find(entry => entry.id === currentId);
      const now = new Date().toISOString();
      const next = upsertConversation(previous, {
        id: currentId,
        title: conversationTitle(turns),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        turns: turns.slice(-TURN_LIMIT).map(dehydrateTurn),
      });
      writeConversations(next);
      setConversations(next);
    };
    if (busy) saveTimer.current = window.setTimeout(save, SAVE_DELAY_MS);
    else save();
    window.addEventListener("pagehide", save);
    return () => {
      window.clearTimeout(saveTimer.current);
      window.removeEventListener("pagehide", save);
    };
  }, [turns, currentId, busy, restoring]);

  const startNew = useCallback(() => {
    restored.current = true;
    setRestoring(false);
    window.clearTimeout(saveTimer.current);
    reset();
    setCurrentId(newConversationId());
  }, [reset]);

  const open = useCallback(
    (id: string) => {
      if (!data) return;
      const target = conversations.find((entry) => entry.id === id);
      if (!target) return;
      window.clearTimeout(saveTimer.current);
      setCurrentId(id);
      replaceTurns(reviveTurns(target.turns, data));
    },
    [conversations, data, replaceTurns],
  );

  const remove = useCallback(
    (id: string) => {
      setConversations((prev) => {
        const next = prev.filter((entry) => entry.id !== id);
        writeConversations(next);
        return next;
      });
      if (id === currentId) startNew();
    },
    [currentId, startNew],
  );

  return { conversations, currentId, restoring, startNew, open, remove };
}
