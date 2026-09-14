/**
 * 저장된 대화 목록. 모델 저장 공간 화면과 같은 자리에서 새 대화·열기·삭제를 한다.
 */
import { MessageSquarePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n";
import type { Conversation } from "@/lib/advisor/history";

interface AdvisorHistoryProps {
  conversations: Conversation[];
  currentId: string;
  /** 답을 만드는 중에는 대화를 바꾸지 않는다. 바꾸면 스트리밍이 다른 대화에 쓰인다. */
  busy: boolean;
  onNew: () => void;
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
}

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}

function formatDate(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(locale, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function AdvisorHistory({ conversations, currentId, busy, onNew, onOpen, onRemove }: AdvisorHistoryProps) {
  const { t, lang } = useTranslation();
  const copy = t.advisor.history;
  const locale = lang.replace("_", "-");

  return (
    <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
      <Button variant="outline" size="sm" disabled={busy} onClick={onNew} className="w-full justify-start">
        <MessageSquarePlus className="mr-1.5 h-3.5 w-3.5" />
        {copy.newChat}
      </Button>

      {conversations.length === 0 ? (
        <p className="text-muted-foreground">{copy.empty}</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {conversations.map((conversation) => {
            const current = conversation.id === currentId;
            const questions = conversation.turns.filter((turn) => turn.role === "user").length;
            return (
              <li key={conversation.id} className="flex items-center gap-2 px-3 py-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onOpen(conversation.id)}
                  className="min-w-0 flex-1 text-left disabled:opacity-60"
                >
                  <div className={`truncate ${current ? "font-semibold" : ""}`}>{conversation.title || copy.untitled}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {fill(copy.questions, { n: questions })} · {formatDate(conversation.updatedAt, locale)}
                    {current && <span className="ml-1.5">· {copy.current}</span>}
                  </div>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={busy}
                  onClick={() => onRemove(conversation.id)}
                  aria-label={copy.remove}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="border-t pt-3 text-xs leading-relaxed text-muted-foreground">{copy.note}</p>
    </div>
  );
}
