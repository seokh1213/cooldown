import { ArrowRight } from "lucide-react";
import { useTranslation } from "@/i18n";
import type { AdvisorAnswer } from "@/lib/advisor/answer";
import { AnswerIcons, referenceTitle } from "./AdvisorReference";
import { useHistoryReference } from "./HistoryReference";

interface ReferenceChipProps {
  answer: AdvisorAnswer;
  active: boolean;
  sameAsPrevious: boolean;
  ddragonVersion: string;
  onClick: () => void;
}

export function ReferenceChip({ answer, active, sameAsPrevious, ddragonVersion, onClick }: ReferenceChipProps) {
  const { t } = useTranslation();
  const copy = t.advisor;
  const { title, kind } = referenceTitle(answer, copy);
  const turn = useHistoryReference();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={copy.card.openCard}
      title={turn?.source ? `${title} · ${turn.source.patch} · ${turn.source.locale}` : undefined}
      className={`flex min-w-0 max-w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted hover:text-foreground ${
        active ? "border-primary bg-primary/5" : "bg-background"
      } ${sameAsPrevious ? "text-muted-foreground" : ""}`}
    >
      <span className="flex shrink-0 -space-x-1.5">
        <AnswerIcons answer={answer} ddragonVersion={ddragonVersion} className="h-[18px] w-[18px] rounded ring-1 ring-background" />
      </span>
      <span className="truncate font-medium">{title}</span>
      <span className="shrink-0 text-muted-foreground">{sameAsPrevious ? copy.card.sameReference : kind}</span>
      <ArrowRight className="h-3 w-3 shrink-0 text-primary" />
    </button>
  );
}
