import type { PatchNotesIndex } from "@/domain/game/contracts/patchNotes";
import type { Language } from "@/shared/i18n";
import { patchNotesLabels } from "./labels";

interface PatchHistoryProps {
  index: PatchNotesIndex; selected: string; language: Language; onSelect: (patch: string) => void;
}

export function PatchVersionSelect({ index, selected, language, onSelect }: PatchHistoryProps) {
  const labels = patchNotesLabels[language];
  return <select aria-label={labels.records} value={selected} onChange={event => onSelect(event.target.value)}
    className="h-9 rounded-md border border-border/70 bg-background px-2 text-sm font-semibold tabular-nums focus-visible:outline-2 focus-visible:outline-ring">
    {index.patches.filter(patch => patch.previousPatchVersion !== null).map(patch =>
      <option key={patch.patchVersion} value={patch.patchVersion}>
        {patch.patchVersion}{patch.patchVersion === index.latest ? ` · ${labels.current}` : ""}
      </option>)}
  </select>;
}

export function PatchHistory({ index, selected, language, onSelect }: PatchHistoryProps) {
  const labels = patchNotesLabels[language];
  return <aside className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
    <h3 className="mb-2 text-xs font-medium text-muted-foreground">{labels.records}</h3>
    <nav aria-label={labels.records} className="max-h-[calc(100dvh-200px)] overflow-y-auto overscroll-contain pr-1">
      <div className="space-y-0.5">
        {index.patches.filter(patch => patch.previousPatchVersion !== null).map(patch =>
          <button type="button" key={patch.patchVersion} onClick={() => onSelect(patch.patchVersion)}
            aria-pressed={patch.patchVersion === selected}
            className={`flex min-h-9 w-full items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-left text-sm ${patch.patchVersion === selected ? "border-primary/20 bg-primary/5 text-foreground" : "border-transparent text-muted-foreground hover:bg-muted/50"}`}>
            <span className="font-mono font-medium">{patch.patchVersion}</span>
            {patch.patchVersion === index.latest && <span className="text-[10px]">{labels.current}</span>}
          </button>)}
      </div>
    </nav>
  </aside>;
}
