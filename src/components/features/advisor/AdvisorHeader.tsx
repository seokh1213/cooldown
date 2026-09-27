/**
 * 도우미 서랍의 머리 — 지금 화면의 이름과 자료·새 대화·기록·저장 공간·닫기 단추.
 */
import { Bot, ChevronLeft, History, Loader2, MessageSquarePlus, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n";
import type { AdvisorAnswer } from "@/lib/advisor/answer";
import { referenceTitle } from "./AdvisorReference";

export type AdvisorView = "chat" | "storage" | "history" | "card";

interface AdvisorHeaderProps {
  view: AdvisorView;
  onViewChange: (view: AdvisorView) => void;
  busy: boolean;
  showingConsent: boolean;
  /** 카드 화면이 보이는 답 */
  cardAnswer: AdvisorAnswer | undefined;
  hasReferences: boolean;
  hasTurns: boolean;
  /** 넓은 화면이라 자료 패널이 대화 옆에 붙는가 */
  wide: boolean;
  referenceOpen: boolean;
  onToggleReference: () => void;
  onNewChat: () => void;
  onClose: () => void;
}

export function AdvisorHeader(props: AdvisorHeaderProps) {
  const { view, onViewChange, busy, showingConsent, cardAnswer, wide, referenceOpen, onToggleReference, onClose } = props;
  const { t, lang } = useTranslation();
  const copy = t.advisor;
  return (
    <header className="flex items-center justify-between border-b px-4 py-3">
      <div className="flex items-center gap-2">
        {view !== "chat" && (
          <Button variant="ghost" size="icon" className="-ml-2 h-7 w-7 text-muted-foreground" onClick={() => onViewChange("chat")} aria-label={copy.storage.back}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}
        <span className="shrink-0 text-sm font-semibold">
          {view === "storage" ? copy.storage.title : view === "history" ? copy.history.title : view === "card" ? copy.card.reference : copy.title}
        </span>
        {/* 카드 화면은 대화를 덮으므로 지금 무엇을 보고 있는지 머리에 적는다. */}
        {view === "card" && cardAnswer && (
          <span className="min-w-0 truncate text-xs font-normal text-muted-foreground">
            › {referenceTitle(cardAnswer, copy, lang).title} · {referenceTitle(cardAnswer, copy, lang).kind}
          </span>
        )}
        {view === "chat" && busy && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            {copy.status.generating}
          </span>
        )}
      </div>
      {view === "chat" && !showingConsent && (
        <div className="flex items-center gap-1">
          {/*
            자료. 넓은 화면에서는 왼쪽 패널을 접고 펴고, 좁은 화면에서는 카드 화면을 연다.
            대화 안의 칩을 찾지 않고도 자료로 바로 가는 길이다.
          */}
          {props.hasReferences && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => (wide ? onToggleReference() : onViewChange("card"))}
              aria-label={copy.card.toggleReference}
              aria-pressed={wide ? referenceOpen : undefined}
              /*
                눌린 상태를 강조색으로 칠하면 머리에서 이 단추 하나만 결이 달라진다.
                옆의 넷은 전부 무채색 ghost 다. 눌림은 채도가 아니라 명도로 — 바탕을
                한 단 올리고 글자를 진하게 한다.
              */
              className={wide && referenceOpen ? "bg-muted text-foreground hover:bg-muted" : "text-muted-foreground"}
            >
              {wide && referenceOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
            </Button>
          )}
          {/* 대화는 지우는 것이 아니라 새로 시작한다. 지난 대화는 기록에 남아 다시 열 수 있다. */}
          {props.hasTurns && (
            <Button variant="ghost" size="icon" disabled={busy} onClick={props.onNewChat} aria-label={copy.history.newChat} className="text-muted-foreground">
              <MessageSquarePlus className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="text-muted-foreground" onClick={() => onViewChange("history")} aria-label={copy.history.open}>
            <History className="h-4 w-4" />
          </Button>
          {/* 모델(570MB)은 받아 두면 계속 남는다. 지울 길을 눈에 보이는 곳에 둔다. */}
          <Button variant="ghost" size="icon" className="text-muted-foreground" onClick={() => onViewChange("storage")} aria-label={copy.storage.open}>
            <Bot className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="text-muted-foreground" onClick={onClose} aria-label={copy.close}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
      {(view !== "chat" || showingConsent) && (
        <Button variant="ghost" size="icon" className="text-muted-foreground" onClick={onClose} aria-label={copy.close}>
          <X className="h-4 w-4" />
        </Button>
      )}
    </header>
  );
}
