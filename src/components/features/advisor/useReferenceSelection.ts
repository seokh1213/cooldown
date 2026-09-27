/**
 * 자료 패널이 보여 주는 답. 비우면 최신 답을 따라가고, 칩·탭을 누르면 그 답에 고정된다. 새 답이 오면 고정을 푼다.
 */
import { useEffect, useState } from "react";
import type { AdvisorTurn } from "@/hooks/useAdvisorTurns";

export function useReferenceSelection(turns: AdvisorTurn[], wide: boolean) {
  const [refTurnId, setRefTurnId] = useState<number | undefined>(undefined);
  const lastAssistantId = [...turns].reverse().find((turn) => turn.role === "assistant")?.id;

  // 자료 패널에 올릴 답. 카드로 그릴 만한 종류(스킬·챔피언·비교)만. 규칙은 짧아 대화 안에 둔다.
  /**
   * 카드를 자료 패널로 보낼 답인가.
   *
   * **자료 패널이 있을 때만** 참이다. 좁은 화면에는 패널이 없어서, 참으로 두면
   * 대화에 칩 하나만 남고 화면이 텅 빈다. 실제로 모바일에서 "말파이트 설명해줘" 에
   * 칩 한 줄만 오고 나머지가 빈 공간이었다. 패널이 없으면 카드를 대화 안에 그린다.
   */
  const isReference = (turn: AdvisorTurn): boolean =>
    wide &&
    turn.role === "assistant" &&
    !!turn.answer &&
    (turn.answer.kind === "spell" ||
      turn.answer.kind === "champion" ||
      turn.answer.kind === "compare" ||
      turn.answer.kind === "item");
  const referenceTurns = turns.filter(isReference);
  const latestReference = referenceTurns[referenceTurns.length - 1];
  const refTurn = referenceTurns.find((turn) => turn.id === refTurnId) ?? latestReference;
  // 새 답이 오면 고정을 풀어 최신 답을 따라간다.
  useEffect(() => {
    setRefTurnId(undefined);
  }, [lastAssistantId]);

  return { isReference, referenceTurns, refTurn, selectReference: setRefTurnId, lastAssistantId };
}
