/**
 * 질문 입력줄. Enter 로 보내고 Shift+Enter 로 줄을 바꾼다. 답을 쓰는 중에는 멈춤 단추가 된다.
 *
 * 쓰던 글은 부르는 쪽이 든다. 기록·저장 공간 화면을 다녀와도 남아 있어야 한다.
 */
import { Send, Square } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { useTranslation } from "@/shared/i18n";

interface AdvisorComposerProps {
  draft: string;
  onDraftChange: (draft: string) => void;
  busy: boolean;
  restoringHistory: boolean;
  restoreError?: boolean;
  /** 답을 쓰는 중에 보내려 했다. 조용히 먹히면 고장으로 보여서 한 줄 알린다. */
  showBusyHint: boolean;
  placeholder: string;
  onSubmit: () => void;
  onStop: () => void;
}

export function AdvisorComposer({ draft, onDraftChange, busy, restoringHistory, restoreError, showBusyHint, placeholder, onSubmit, onStop }: AdvisorComposerProps) {
  const { t } = useTranslation();
  const copy = t.advisor;
  return (
    <footer className="flex shrink-0 flex-col gap-1.5 border-t bg-background p-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:pb-3">
      {restoringHistory && !restoreError && <p role="status" className="px-1 text-xs text-muted-foreground">{copy.history.loading}</p>}
      {showBusyHint && (
        <p className="px-1 text-[11px] leading-4 text-muted-foreground">{copy.busyHint}</p>
      )}
      <div className="flex items-end gap-2">
      <textarea
        aria-label={copy.questionLabel}
        name="advisor-question"
        autoComplete="off"
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={(event) => {
          // 한글 조합 중의 Enter 는 조합 확정용이다. 여기서 보내고 비우면 확정된 마지막 글자("줘")가 입력칸에 남는다.
          // Safari 는 확정 뒤 isComposing 없이 keyCode 229 로 한 번 더 보낸다.
          if (event.nativeEvent.isComposing || event.keyCode === 229) return;
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSubmit();
          }
        }}
        rows={1}
        placeholder={placeholder}
        className="max-h-32 min-h-11 flex-1 resize-none rounded-md border bg-transparent px-3 py-2 text-base md:text-sm outline-hidden transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
      />
      {busy ? (
        <Button size="icon" className="h-11 w-11 touch-manipulation" variant="outline" onClick={onStop} aria-label={copy.stop}>
          <Square className="h-4 w-4" />
        </Button>
      ) : (
        <Button size="icon" className="h-11 w-11 touch-manipulation" onClick={onSubmit} disabled={restoringHistory || !draft.trim()} aria-label={copy.send}>
          <Send className="h-4 w-4" />
        </Button>
      )}
      </div>
    </footer>
  );
}
