import { useState } from "react";
import { useLocation } from "react-router-dom";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PatchEntry } from "./PatchEntry";
import { PatchHistory, PatchVersionSelect } from "./PatchHistory";
import { PatchHighlights } from "./PatchHighlights";
import { PatchFilters, type PatchFiltersValue } from "./PatchFilters";
import { patchNotesLabels } from "./labels";
import { filterPatchEntries, patchReportCounts } from "./model";
import { usePatchNotes } from "./usePatchNotes";
import { usePatchSkills } from "./usePatchSkills";
import { usePatchFragment } from "./usePatchFragment";

const EMPTY_FILTERS: PatchFiltersValue = { query: "", impact: "all", kind: "all" };

export default function PatchNotesPage() {
  const { lang } = useTranslation();
  const labels = patchNotesLabels[lang];
  const { index, patch, report, failed, selectPatch, retry } = usePatchNotes();
  const skills = usePatchSkills(report, lang);
  usePatchFragment(!!report && (!!skills.archive || !!skills.failed));
  const { key } = useLocation();
  const [filterState, setFilterState] = useState({ key, value: EMPTY_FILTERS });
  if (filterState.key !== key) setFilterState({ key, value: EMPTY_FILTERS });
  const filters = filterState.key === key ? filterState.value : EMPTY_FILTERS;
  const setFilters = (value: PatchFiltersValue) => setFilterState({ key, value });
  const entries = filterPatchEntries(report?.entries ?? [], filters);
  const counts = report ? patchReportCounts(report) : undefined;
  const resetFilters = () => setFilters(EMPTY_FILTERS);
  const onSelect = (version: string) => { resetFilters(); selectPatch(version); };

  return (
    <div className="mx-auto grid max-w-[1240px] gap-x-8 gap-y-4 px-4 py-5 sm:px-6 sm:py-6 lg:grid-cols-[minmax(0,1fr)_180px] lg:px-7">
        <header className="lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight sm:text-2xl"><span className="hidden sm:inline">{patch?.patchVersion} </span>{labels.title}</h2>
            {index && patch && <div className="lg:hidden"><PatchVersionSelect index={index} selected={patch.patchVersion} language={lang} onSelect={onSelect} /></div>}
            <a href={report?.officialSource?.urls[lang] ?? "https://www.leagueoflegends.com/ko-kr/news/game-updates/"}
              target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              {labels.official}<ArrowUpRight aria-hidden="true" className="size-3" />
            </a>
          </div>
          {report && counts && <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5 tabular-nums">{report.previousPatchVersion}<ArrowRight aria-hidden="true" className="size-3" />{report.patchVersion}</span>
            <span>{labels.champions} <strong className="font-medium text-foreground">{counts.champions}</strong></span>
            <span>{labels.items} <strong className="font-medium text-foreground">{counts.items}</strong></span>
            {counts.systems > 0 && <span>{labels.systems} <strong className="font-medium text-foreground">{counts.systems}</strong></span>}
            <span>{labels.changes} <strong className="font-medium text-foreground">{counts.changes}</strong></span>
          </div>}
        </header>
      <div className="min-w-0">
        {failed ? <div role="alert" className="py-8 text-sm text-muted-foreground">{labels.error}<Button onClick={retry} variant="outline" className="ml-3">{labels.retry}</Button></div>
          : !report ? <p role="status" className="py-8 text-sm text-muted-foreground">{labels.loading}</p>
            : <>
              <PatchHighlights report={report} language={lang} onJump={resetFilters} />
              <PatchFilters value={filters} onChange={setFilters} language={lang} />
              {skills.failed && <p role="alert" className="flex items-center gap-2 py-2 text-xs text-muted-foreground">{labels.skillError}<Button variant="ghost" size="sm" onClick={skills.retry}>{labels.retry}</Button></p>}
              <TooltipProvider delayDuration={0} skipDelayDuration={150}>
              <div aria-live="polite">
                {entries.map(entry => <PatchEntry key={`${report.patchVersion}:${lang}:${entry.id}`} entry={entry} language={lang}
                  report={report} skills={skills.archive?.champions[entry.id]} />)}
                {!entries.length && <div className="py-8 text-center text-sm text-muted-foreground">
                  <p>{report.entries.length ? labels.noResults : labels.empty}</p>
                  {report.entries.length > 0 && <Button variant="ghost" onClick={resetFilters} className="mt-2">{labels.reset}</Button>}
                </div>}
              </div>
              </TooltipProvider>
              <footer className="mt-4 text-[10px] leading-5 text-muted-foreground">
                <p>{report.officialSource ? labels.officialSourceNote : labels.sourceNote}</p>
                {report.officialSource?.note && <p>{report.officialSource.note[lang]}</p>}
              </footer>
            </>}
      </div>
      {index && patch && <PatchHistory index={index} selected={patch.patchVersion} language={lang} onSelect={onSelect} />}
    </div>
  );
}
