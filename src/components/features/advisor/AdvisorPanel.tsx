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
import {
  buildChampionBrief,
  buildCounterBrief,
  buildMatchup,
  loadAdvisorData,
  type AdvisorData,
} from "@/lib/advisor/context";
import { asksForCounter, detectMatchup, detectSingleChampion } from "@/lib/advisor/intent";
import type { UseAdvisorResult } from "@/hooks/useAdvisor";
import { AdvisorConsent } from "./AdvisorConsent";

interface AdvisorPanelProps {
  advisor: UseAdvisorResult;
  patch: string;
  onClose: () => void;
}

function formatMb(bytes: number): string {
  return (bytes / 1048576).toFixed(0);
}

export function AdvisorPanel({ advisor, patch, onClose }: AdvisorPanelProps) {
  const { t, lang } = useTranslation();
  const copy = t.advisor;
  const [draft, setDraft] = useState("");
  const [data, setData] = useState<AdvisorData | null>(null);
  // 동의 화면을 건너뛰고 코드 답변만으로 써 보는 상태
  const [skippedModel, setSkippedModel] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 챔피언 자료는 모델과 별개로 받는다. 모델이 준비되기 전에 미리 받아 둔다.
  useEffect(() => {
    let alive = true;
    void loadAdvisorData(patch)
      .then((loaded) => {
        if (alive) setData(loaded);
      })
      .catch(() => {
        // 자료를 못 받아도 대화는 되게 둔다. 근거 없이 답하지 말라는 지시는 페르소나에 있다.
      });
    return () => {
      alive = false;
    };
  }, [patch]);

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

  /**
   * 질문에서 챔피언을 읽어 자료를 붙인다.
   *
   * 자료 없이 보내면 모델이 이름부터 지어낸다("오공(Dragon Knight)"). 그래서
   * 챔피언이 둘이면 상성 조언으로, 하나면 그 챔피언 자료를 실어 보낸다.
   */
  const submit = () => {
    const question = draft.trim();
    if (busy || !question) return;
    const system = advisorSystemPrompt(lang);

    if (data) {
      const matchup = detectMatchup(data, question);
      if (matchup) {
        const built = buildMatchup(data, matchup);
        // 모델이 없으면 코드 답변만으로 끝낸다. 평가에서 63/66 이라 쓸 만하다.
        if (!advisor.consented || advisor.webgpu?.supported === false) {
          advisor.answerWithoutModel(question, built.codeAnswer);
        } else {
          advisor.sendMatchup(
            question,
            built.decided,
            built.sections.map((section) => section.messages),
          );
        }
        setDraft("");
        return;
      }
      const single = detectSingleChampion(data, question);
      if (single) {
        // "카운터가 뭐야" 는 상성별 통계가 있어야 답할 수 있어 다른 자료를 붙인다
        const brief = asksForCounter(question)
          ? (buildCounterBrief(data, single) ?? buildChampionBrief(data, single))
          : buildChampionBrief(data, single);
        advisor.send(question, `${system}\n\n${brief}`);
        setDraft("");
        return;
      }
    }

    // 챔피언이 안 잡히면 페르소나만으로 답한다
    advisor.send(question, system);
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

      {!advisor.consented && !skippedModel ? (
        <AdvisorConsent
          webgpu={advisor.webgpu}
          storage={advisor.storage}
          onAccept={advisor.accept}
          onCancel={onClose}
          onSkip={() => setSkippedModel(true)}
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
