/** 상성 조언 위에 두는 자료 카드. 카드 전체가 해당 1:1 화면으로 이어진다. */
import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { ChampionIcon } from "@/components/ui/champion-icon";
import { useTranslation } from "@/i18n";
import { fill } from "@/i18n/fill";
import type { AdvisorAnswer } from "@/lib/advisor/answer";
import { josa } from "@/lib/knowledge/text";
import { PatchLabel } from "./AnswerCardFrame";
import { useHistoryReference } from "./HistoryReference";

export function MatchupReferenceCard({ answer, ddragonVersion, patch, onNavigate }: {
  answer: Extract<AdvisorAnswer, { kind: "compare" }>;
  ddragonVersion: string;
  patch: string;
  onNavigate?: () => void;
}) {
  const { t } = useTranslation();
  const copy = t.advisor.card;
  const turn = useHistoryReference();
  const linkLabel = turn?.historical ? t.advisor.history.currentDataLink : copy.openInVs;
  const [mine, enemy] = answer.cards;
  if (!enemy) return null;
  return (
    <Link
      to={`/vs?a=${mine.id}&t=${enemy.id}`}
      onClick={onNavigate}
      aria-label={turn?.historical ? linkLabel : fill(copy.goVs, { a: mine.name, b: enemy.name })}
      title={turn?.historical ? linkLabel : undefined}
      className="group flex min-w-0 items-center gap-3 rounded-xl border bg-muted/20 px-3 py-3 text-sm transition-colors hover:border-primary/50 hover:bg-muted/60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring touch-manipulation motion-reduce:transition-none"
    >
      <div className="flex shrink-0 -space-x-2" aria-hidden="true">
        {answer.cards.map(card => (
          <ChampionIcon key={card.id} id={card.id} ddragonVersion={ddragonVersion} size={32} className="rounded-md ring-2 ring-background" />
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{mine.name} vs {enemy.name}</div>
        <div className="truncate text-xs text-muted-foreground">
          {fill(copy.matchup, { a: mine.name, aWith: josa(mine.name, "로/으로"), b: enemy.name })}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
          <span className="text-muted-foreground"><PatchLabel patch={patch} /></span>
          <span className="inline-flex items-center gap-1 font-medium text-primary group-hover:underline">
            {linkLabel}<ArrowUpRight className="h-3 w-3" aria-hidden="true" />
          </span>
        </div>
      </div>
    </Link>
  );
}
