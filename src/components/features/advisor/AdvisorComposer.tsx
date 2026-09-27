/**
 * 질문 입력줄. Enter 로 보내고 Shift+Enter 로 줄을 바꾼다. 답을 쓰는 중에는 멈춤 단추가 된다.
 *
 * 쓰던 글은 부르는 쪽이 든다. 기록·저장 공간 화면을 다녀와도 남아 있어야 한다.
 */
import { Send, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n";

interface AdvisorComposerProps {
  draft: string;
  onDraftChange: (draft: string) => void;
  busy: boolean;
  /** 답을 쓰는 중에 보내려 했다. 조용히 먹히면 고장으로 보여서 한 줄 알린다. */
  showBusyHint: boolean;
  placeholder: string;
  onSubmit: () => void;
  onStop: () => void;
}

export function AdvisorComposer({ draft, onDraftChange, busy, showBusyHint, placeholder, onSubmit, onStop }: AdvisorComposerProps) {
  const { t } = useTranslation();
  const copy = t.advisor;
  return (
    <footer className="flex flex-col gap-1.5 border-t p-3">
      {showBusyHint && (
        <p className="px-1 text-[11px] leading-4 text-muted-foreground">{copy.busyHint}</p>
      )}
      <div className="flex items-end gap-2">
      <textarea
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSubmit();
          }
        }}
        rows={1}
        placeholder={placeholder}
        className="max-h-32 min-h-9 flex-1 resize-none rounded-md border bg-transparent px-3 py-2 text-base md:text-sm outline-hidden transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/40"
      />
      {busy ? (
        <Button size="icon" variant="outline" onClick={onStop} aria-label={copy.stop}>
          <Square className="h-4 w-4" />
        </Button>
      ) : (
        <Button size="icon" onClick={onSubmit} disabled={!draft.trim()} aria-label={copy.send}>
          <Send className="h-4 w-4" />
        </Button>
      )}
      </div>
    </footer>
  );
}
