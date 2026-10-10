/**
 * 자료 패널이 보여 주는 답. 비우면 최신 답을 따라가고, 칩·탭을 누르면 그 답에 고정된다. 새 답이 오면 고정을 푼다.
 */
import { useEffect, useState } from "react";
import type { AdvisorTurn } from "@/features/advisor/session/useAdvisorTurns";
import type { AdvisorAnswer } from "@/features/advisor/answers/answer";
import { groupReferenceAnswers, isReferenceAnswer } from "@/features/advisor/answers/references/referenceGroups";
import { referenceKey } from "@/features/advisor/answers/references/referenceIdentity";

export function useReferenceSelection(turns: AdvisorTurn[], wide: boolean) {
  const [selection, setSelection] = useState<{ turnId: number; key?: string }>();
  const lastAssistantId = [...turns].reverse().find((turn) => turn.role === "assistant")?.id;

  // 카드 화면의 자료는 모바일에도 유지한다. 일반 조회 카드는 좁은 화면에서 대화 안에 그린다.
  const answersOf = (turn: AdvisorTurn) => turn.answers?.length ? turn.answers : turn.answer ? [turn.answer] : [];
  const isCardTurn = (turn: AdvisorTurn): boolean => turn.role === "assistant" && answersOf(turn).some(isReferenceAnswer);
  const isReference = (turn: AdvisorTurn): boolean => isCardTurn(turn) &&
    (wide || turn.answer?.kind === "champion" && turn.answer.notes?.topic === "combo" && Boolean(turn.content));
  const referenceTurns = turns.filter(isCardTurn).flatMap(turn =>
    groupReferenceAnswers(answersOf(turn)).filter(group => isReferenceAnswer(group.answer))
      .map(group => ({ ...turn, answer: group.answer, answers: group.answers })));
  const latestReference = referenceTurns[referenceTurns.length - 1];
  const refTurn = referenceTurns.find(turn => turn.id === selection?.turnId
    && (!selection.key || referenceKey(turn.answer) === selection.key)) ?? latestReference;
  const selectReference = (turnId: number, answer?: AdvisorAnswer) => {
    setSelection({ turnId, key: answer ? referenceKey(answer) : undefined });
  };
  // 새 답이 오면 고정을 풀어 최신 답을 따라간다.
  useEffect(() => {
    setSelection(undefined);
  }, [lastAssistantId]);

  return { isReference, referenceTurns, refTurn, selectReference, lastAssistantId };
}
