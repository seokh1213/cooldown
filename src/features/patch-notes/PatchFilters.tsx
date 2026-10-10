import { Search, X } from "lucide-react";
import { Input } from "@/shared/ui/input";
import type { Language } from "@/shared/i18n";
import { patchNotesLabels } from "./labels";
import type { ImpactFilter, KindFilter } from "./model";

export interface PatchFiltersValue { query: string; impact: ImpactFilter; kind: KindFilter }

export function PatchFilters({ value, onChange, language }: {
  value: PatchFiltersValue; onChange: (filters: PatchFiltersValue) => void; language: Language;
}) {
  const labels = patchNotesLabels[language];
  return <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
    <div className="flex gap-3" role="group" aria-label={labels.category}>
      {(["all", "champion", "item", "system"] as const).map(kind => <button key={kind} type="button" aria-pressed={value.kind === kind}
        onClick={() => onChange({ ...value, kind })}
        className={`min-h-8 border-b-2 text-xs ${value.kind === kind ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
        {kind === "all" ? labels.all : kind === "champion" ? labels.champions : kind === "item" ? labels.items : labels.systems}
      </button>)}
    </div>
    <div className="flex gap-0.5 sm:border-l sm:border-border/70 sm:pl-4" role="group" aria-label={labels.direction}>
      {(["all", "buff", "nerf", "adjustment"] as const).map(impact => <button key={impact} type="button" aria-pressed={value.impact === impact}
        onClick={() => onChange({ ...value, impact })}
        className={`min-h-8 rounded px-2.5 text-xs ${value.impact === impact ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50"}`}>
        {labels[impact]}
      </button>)}
    </div>
    <div className="relative ml-auto w-full sm:w-52">
      <Search aria-hidden="true" className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
      <Input value={value.query} onChange={event => onChange({ ...value, query: event.target.value })}
        placeholder={labels.search} aria-label={labels.search} className="h-9 bg-transparent pl-8 pr-8 text-xs!" />
      {value.query && <button type="button" aria-label={labels.clearSearch} onClick={() => onChange({ ...value, query: "" })}
        className="absolute right-0.5 top-0.5 grid size-8 place-items-center"><X aria-hidden="true" className="size-3" /></button>}
    </div>
  </div>;
}
