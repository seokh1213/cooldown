import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { ChampionIcon } from "@/components/ui/champion-icon";
import { IMAGE_VERSION } from "@/data/generated/assetVersion";
import type { PatchImpact, PatchNotesReport } from "@/data/contracts/patchNotes";
import type { Language } from "@/i18n";
import { patchNotesLabels } from "./labels";
import { IMPACT_CLASSES } from "./PatchEntry";

export function PatchHighlights({ report, language, onJump }: { report: PatchNotesReport; language: Language; onJump: () => void }) {
  const labels = patchNotesLabels[language];
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  params.set("patch", report.patchVersion);
  const [expanded, setExpanded] = useState(false);
  const impacts: PatchImpact[] = ["buff", "nerf", "adjustment"];
  return (
    <section className="border-y border-border/60 py-1 sm:py-3" aria-label={labels.highlights}>
      <h3 className="mb-2 hidden text-xs font-medium text-muted-foreground sm:block">{labels.highlights}</h3>
      <button type="button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded}
        className="flex min-h-9 w-full items-center justify-between text-xs font-medium text-muted-foreground sm:hidden">
        {labels.highlights}<ChevronDown aria-hidden="true" className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      <div className={`space-y-2 pb-2 sm:pb-0 ${expanded ? "block" : "hidden sm:block"}`}>
        {impacts.map(impact => {
          const entries = report.entries.filter(entry => entry.kind === "champion" && entry.impact === impact);
          if (!entries.length) return null;
          return <div key={impact} className="flex items-start gap-3">
            <span className={`w-9 shrink-0 pt-2.5 text-xs font-medium ${IMPACT_CLASSES[impact]}`}>{labels[impact]}</span>
            <div className="flex flex-wrap gap-1.5">
              {entries.map(entry => <Link key={entry.id} to={{ search: `?${params}`, hash: `#patch-${entry.id}` }} onClick={onJump}
                title={entry.name[language]} aria-label={entry.name[language]}
                className="rounded-md transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring">
                <ChampionIcon id={entry.id} ddragonVersion={IMAGE_VERSION} className="block size-9 rounded-md shadow-none!" />
              </Link>)}
            </div>
          </div>;
        })}
      </div>
    </section>
  );
}
