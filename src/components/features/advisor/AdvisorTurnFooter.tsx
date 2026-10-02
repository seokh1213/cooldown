/** 평가 버튼과 생성 정보를 대화 턴 아래에 표시한다. */
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useTranslation } from "@/i18n";
import type { AdvisorTurn } from "@/hooks/useAdvisorTurns";
import type { UseAdvisorResult } from "@/hooks/useAdvisor";

export function AdvisorTurnFooter({ turn, patch, onRate }: { turn: AdvisorTurn; patch: string; onRate: UseAdvisorResult["rate"] }) {
  const { t } = useTranslation();
  const copy = t.advisor;
  return (
    <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
      {turn.stats && (
        <span>
          {turn.stats.tokens} tok · {turn.stats.seconds.toFixed(1)}s
          {turn.stats.ttft !== undefined && (
            <>
              {" "}
              (읽기 {turn.stats.ttft.toFixed(1)}s
              {turn.stats.promptTokens ? ` · 프롬프트 ${turn.stats.promptTokens} tok` : ""})
            </>
          )}
        </span>
      )}
      {/* 평가는 기기 안에만 쌓인다. 서버로 보내지 않는다. */}
      <button
        type="button"
        aria-label={copy.rateUp}
        aria-pressed={turn.rating === "up"}
        onClick={() => onRate(turn.id, "up", patch)}
        className={
          turn.rating === "up"
            ? "text-emerald-400"
            : "text-muted-foreground transition-colors hover:text-foreground"
        }
      >
        <ThumbsUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        aria-label={copy.rateDown}
        aria-pressed={turn.rating === "down"}
        onClick={() => onRate(turn.id, "down", patch)}
        className={
          turn.rating === "down"
            ? "text-destructive"
            : "text-muted-foreground transition-colors hover:text-foreground"
        }
      >
        <ThumbsDown className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
