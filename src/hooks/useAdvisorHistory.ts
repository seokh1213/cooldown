/**
 * 대화 기록을 localStorage 에 잇는다.
 *
 * 발화가 바뀌면 지금 대화를 저장하고(잠깐 모아서), 처음 열 때는 마지막 대화를 되살린다.
 * 새 대화·다른 대화 열기·삭제를 모델 저장 공간을 다루듯 제공한다.
 * 저장된 카드 원본으로 복원하므로 현재 자료를 기다리지 않는다.
 */
import { useCallback, useEffect, useRef, useState } from "react";
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
  saveFailed: boolean;
  retrySave: () => void;
  startNew: () => void;
  open: (id: string) => void;
  remove: (id: string) => void;
}

export function useAdvisorHistory(advisor: UseAdvisorResult, currentPatch: string): UseAdvisorHistoryResult {
  const [conversations, setConversations] = useState<Conversation[]>(readConversations);
  const conversationRef = useRef(conversations);
  const unsaved = useRef<Conversation[] | undefined>(undefined);
  const [saveFailed, setSaveFailed] = useState(false);
  const [currentId, setCurrentId] = useState(newConversationId);
  const [restoring, setRestoring] = useState(conversations.length > 0);
  const restored = useRef(false);
  const saveTimer = useRef<number | undefined>(undefined);
  const { turns, replaceTurns, reset } = advisor;
  const busy = advisor.status === "generating" || advisor.working;

  const persist = useCallback((next: Conversation[]) => {
    const saved = writeConversations(next);
    unsaved.current = saved ? undefined : next;
    conversationRef.current = next;
    setConversations(next);
    setSaveFailed(!saved);
  }, []);

  const retrySave = useCallback(() => persist(unsaved.current ?? conversationRef.current), [persist]);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    setRestoring(false);
    const latest = conversations[0];
    if (!latest || turns.length > 0) return;
    const revived = reviveTurns(latest.turns, { patch: currentPatch });
    if (revived.length === 0) return;
    setCurrentId(latest.id);
    replaceTurns(revived);
  }, [currentPatch, conversations, turns.length, replaceTurns]);

  // 완료된 답은 즉시 저장한다. 생성 중에만 모아서 쓰고, 페이지를 떠나면 남은 저장을 처리한다.
  useEffect(() => {
    if (restoring || turns.length === 0) return;
    window.clearTimeout(saveTimer.current);
    const save = () => {
      const previous = unsaved.current ?? readConversations();
      const existing = previous.find(entry => entry.id === currentId);
      const now = new Date().toISOString();
      const next = upsertConversation(previous, {
        id: currentId,
        title: conversationTitle(turns),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        turns: turns.slice(-TURN_LIMIT).map(dehydrateTurn),
      });
      persist(next);
    };
    if (busy) saveTimer.current = window.setTimeout(save, SAVE_DELAY_MS);
    else save();
    window.addEventListener("pagehide", save);
    return () => {
      window.clearTimeout(saveTimer.current);
      window.removeEventListener("pagehide", save);
    };
  }, [turns, currentId, busy, restoring, persist]);

  const startNew = useCallback(() => {
    restored.current = true;
    setRestoring(false);
    window.clearTimeout(saveTimer.current);
    reset();
    setCurrentId(newConversationId());
  }, [reset]);

  const open = useCallback(
    (id: string) => {
      const target = conversations.find((entry) => entry.id === id);
      if (!target) return;
      window.clearTimeout(saveTimer.current);
      setCurrentId(id);
      replaceTurns(reviveTurns(target.turns, { patch: currentPatch }));
    },
    [conversations, currentPatch, replaceTurns],
  );

  const remove = useCallback(
    (id: string) => {
      persist(conversationRef.current.filter((entry) => entry.id !== id));
      if (id === currentId) startNew();
    },
    [currentId, startNew, persist],
  );

  return { conversations, currentId, restoring, saveFailed, retrySave, startNew, open, remove };
}
