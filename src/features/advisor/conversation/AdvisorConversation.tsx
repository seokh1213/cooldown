/**
 * 대화 목록 — 빈 대화의 예시, 말풍선들, 오류 한 줄.
 *
 * 스크롤 자리(`scrollRef`·`lastTurnRef`)는 패널이 든다. 새 답이 올 때만 맞추고, 기록·저장 공간 화면을 다녀올 때는 건드리지 않는다.
 */
import { useTranslation } from "@/shared/i18n";
import type { PageContext } from "@/features/advisor/conversation/pageContext";
import type { AdvisorTurn } from "@/features/advisor/session/useAdvisorTurns";
import type { ChampionCard } from "@/domain/knowledge/facts";
import { AdvisorEmptyState } from "./AdvisorEmptyState";
import { AdvisorTurnView } from "./AdvisorTurnView";
import { HistoryReference } from "../history/HistoryReference";

type TurnHandlers = Pick<
  React.ComponentProps<typeof AdvisorTurnView>,
  "onShowReference" | "onAskPerspective" | "onShowDoc" | "onPickChampion" | "onNavigate"
>;

interface AdvisorConversationProps extends TurnHandlers {
  scrollRef: React.Ref<HTMLDivElement>;
  lastTurnRef: React.Ref<HTMLDivElement>;
  turns: AdvisorTurn[];
  error: string | null;
  /** 모델을 올리는 중이면 빈 대화 예시를 감춘다(진행률이 대신 보인다) */
  loading: boolean;
  busy: boolean;
  contextCards: ChampionCard[];
  context: Pick<PageContext, "route" | "tab">;
  isReference: (turn: AdvisorTurn) => boolean;
  /** 자료 패널이 지금 보이는 답 */
  shownReferenceId: number | undefined;
  shownReferenceKey?: string;
  lastAssistantId: number | undefined;
  ddragonVersion: string;
  patch: string;
  onAsk: (question: string) => void;
}

export function AdvisorConversation({ scrollRef, lastTurnRef, turns, error, loading, busy, contextCards, context, ddragonVersion, patch, onAsk, ...props }: AdvisorConversationProps) {
  const { t } = useTranslation();
  const copy = t.advisor;

  return (
    <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto overscroll-contain p-4 text-sm">
      {turns.length === 0 && !loading && (
        <AdvisorEmptyState contextCards={contextCards} context={context} ddragonVersion={ddragonVersion} onAsk={onAsk} />
      )}
      {turns.map((turn, index) => (
        <HistoryReference key={turn.id} turn={turn}>
        <AdvisorTurnView
          ref={index === turns.length - 1 ? lastTurnRef : undefined}
          turn={turn}
          index={index}
          previousTurn={turns
            .slice(0, index)
            .reverse()
            .find((entry) => entry.role === "assistant" && entry.answer)}
          asReference={props.isReference(turn)}
          shownInReference={props.shownReferenceId === turn.id}
          shownReferenceKey={props.shownReferenceKey}
          answering={busy && turn.id === props.lastAssistantId}
          busy={busy}
          ddragonVersion={ddragonVersion}
          patch={patch}
          onShowReference={props.onShowReference}
          onAskPerspective={props.onAskPerspective}
          onShowDoc={props.onShowDoc}
          onPickChampion={props.onPickChampion}
          onNavigate={props.onNavigate}
        />
        </HistoryReference>
      ))}
      {error && (
        <p className="text-destructive">
          {copy.errorPrefix}: {error}
        </p>
      )}
    </div>
  );
}
