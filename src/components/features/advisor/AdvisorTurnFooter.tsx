/** 복사 버튼과 생성 정보를 대화 턴 아래에 표시한다. */
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { copyTextToClipboard } from "@/lib/clipboard";
import { useTranslation } from "@/i18n";
import type { AdvisorTurn } from "@/hooks/useAdvisorTurns";
import { publicAnswerText } from "@/lib/advisor/publicAnswerText";

export function AdvisorTurnFooter({ turn }: { turn: AdvisorTurn }) {
  const { t } = useTranslation();
  const copy = t.advisor;
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  async function copyAnswer() {
    const success = await copyTextToClipboard(publicAnswerText(turn.content));
    setCopyState(success ? "copied" : "failed");
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
      {turn.content && (
        <>
          <button type="button" aria-label={copy.copyAnswer} title={copy.copyAnswer} onClick={copyAnswer}
            className="flex h-11 w-11 items-center justify-center rounded-md touch-manipulation hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
            {copyState === "copied" ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          </button>
          <span role="status">{copyState === "copied" ? copy.answerCopied : copyState === "failed" ? copy.answerCopyFailed : ""}</span>
        </>
      )}
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
    </div>
  );
}
