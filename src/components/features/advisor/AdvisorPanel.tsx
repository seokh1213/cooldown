/**
 * 상성 코치 대화 패널
 *
 * 화면 오른쪽 아래에 떠 있고, 동의 전에는 동의 화면을, 그 뒤에는 대화를 보여 준다.
 * 모델 적재는 수십 초가 걸리므로 진행률을 파일 합계로 계속 보여 준다.
 */
import { useEffect, useRef, useState } from "react";
import { Loader2, Send, Square, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n";
import { advisorSystemPrompt } from "@/lib/advisor/persona";
import type { UseAdvisorResult } from "@/hooks/useAdvisor";
import { AdvisorConsent } from "./AdvisorConsent";

interface AdvisorPanelProps {
  advisor: UseAdvisorResult;
  onClose: () => void;
}

function formatMb(bytes: number): string {
  return (bytes / 1048576).toFixed(0);
}

export function AdvisorPanel({ advisor, onClose }: AdvisorPanelProps) {
  const { t, lang } = useTranslation();
  const copy = t.advisor;
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const busy = advisor.status === "generating";
  // 모델이 아직 안 올라왔으면 진행률을 계속 보여 준다.
  // 적재 중에 질문을 받으면 상태가 generating 으로 바뀌는데, 그때 진행률을 감추면
  // 사용자는 몇 분 동안 도는 점만 보게 된다.
  const loading =
    !advisor.modelReady &&
    advisor.consented &&
    advisor.status !== "idle" &&
    advisor.status !== "error";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [advisor.turns]);

  const submit = () => {
    if (busy || !draft.trim()) return;
    // 페르소나는 매 요청에 함께 보낸다. 대화 이력에 남기지 않으므로 언어를 바꾸면 곧바로 반영된다.
    advisor.send(draft, advisorSystemPrompt(lang));
    setDraft("");
  };

  const percent =
    advisor.progress.totalBytes > 0
      ? Math.min(100, Math.round((advisor.progress.loadedBytes / advisor.progress.totalBytes) * 100))
      : 0;

  return (
    <div
      role="dialog"
      aria-label={copy.title}
      className="fixed bottom-24 right-4 z-50 flex h-[min(600px,calc(100vh-8rem))] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl"
    >
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{copy.title}</span>
          {advisor.status === "generating" && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {copy.status.generating}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {advisor.turns.length > 0 && (
            <Button variant="ghost" size="icon" onClick={advisor.reset} aria-label={copy.reset}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={onClose} aria-label={copy.close}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {!advisor.consented ? (
        <AdvisorConsent
          webgpu={advisor.webgpu}
          storage={advisor.storage}
          onAccept={advisor.accept}
          onCancel={onClose}
        />
      ) : (
        <>
          {loading && (
            <div className="border-b px-4 py-3 text-xs text-muted-foreground">
              <div className="mb-2 flex items-center justify-between">
                <span>
                  {advisor.progress.totalBytes > 0 &&
                  advisor.progress.loadedBytes >= advisor.progress.totalBytes
                    ? copy.status.warming
                    : copy.status.downloading}
                </span>
                {advisor.progress.totalBytes > 0 && (
                  <span>
                    {formatMb(advisor.progress.loadedBytes)} / {formatMb(advisor.progress.totalBytes)} MB
                  </span>
                )}
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          )}

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
            {advisor.turns.length === 0 && !loading && (
              <p className="text-muted-foreground">{copy.emptyHint}</p>
            )}
            {advisor.turns.map((turn) => (
              <div
                key={turn.id}
                className={
                  turn.role === "user"
                    ? "ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-primary-foreground"
                    : "mr-auto w-fit max-w-[95%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-muted px-3 py-2"
                }
              >
                {turn.content || (turn.role === "assistant" && <Loader2 className="h-4 w-4 animate-spin" />)}
                {turn.stats && (
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {turn.stats.tokens} tok · {turn.stats.seconds.toFixed(1)}s
                  </div>
                )}
              </div>
            ))}
            {advisor.error && (
              <p className="text-destructive">
                {copy.errorPrefix}: {advisor.error}
              </p>
            )}
          </div>

          <footer className="flex items-end gap-2 border-t p-3">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
              rows={1}
              placeholder={copy.placeholder}
              className="max-h-32 min-h-9 flex-1 resize-none rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            {busy ? (
              <Button size="icon" variant="outline" onClick={advisor.stop} aria-label={copy.stop}>
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button size="icon" onClick={submit} disabled={!draft.trim()} aria-label={copy.send}>
                <Send className="h-4 w-4" />
              </Button>
            )}
          </footer>
        </>
      )}
    </div>
  );
}
