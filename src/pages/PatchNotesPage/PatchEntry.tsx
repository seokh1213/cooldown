import { ArrowRight } from "lucide-react";
import { ChampionIcon } from "@/components/ui/champion-icon";
import { ItemIcon } from "@/components/ui/item-icon";
import { IMAGE_VERSION } from "@/data/generated/assetVersion";
import type { PatchNoteEntry, PatchNotesReport } from "@/data/contracts/patchNotes";
import { patchSkillKey, type PatchSkillInfo } from "@/data/contracts/patchSkills";
import { STAT_ICON_CLASS, statIconUrl } from "@/lib/spellTooltipParser/statIcons";
import type { Language } from "@/i18n";
import { patchNotesLabels } from "./labels";
import { formatPatchValues, groupPatchChanges } from "./model";
import { PatchSkillTitle } from "./PatchSkillTitle";
import { patchStatGlyph } from "./statGlyph";

export const IMPACT_CLASSES = {
  buff: "text-emerald-700 dark:text-emerald-400",
  nerf: "text-rose-700 dark:text-rose-400",
  adjustment: "text-amber-700 dark:text-amber-400",
};

export function PatchEntry({ entry, language, report, skills }: {
  entry: PatchNoteEntry; language: Language; report: PatchNotesReport; skills?: Record<string, PatchSkillInfo>;
}) {
  const labels = patchNotesLabels[language];
  const Icon = entry.kind === "champion" ? ChampionIcon : ItemIcon;
  return (
    <article id={`patch-${entry.id}`} className="scroll-mt-20 border-b border-border/60 py-5">
      <header className="mb-3 flex items-center gap-2.5">
        {entry.kind !== "system" && <Icon id={entry.id} ddragonVersion={IMAGE_VERSION} className="block size-10 shrink-0 rounded-md shadow-none!" />}
        <h3 className="text-lg font-semibold tracking-tight">{entry.name[language]}</h3>
        <span className={`ml-auto text-xs font-medium ${IMPACT_CLASSES[entry.impact]}`}>{labels[entry.impact]}</span>
      </header>
      <div className="min-w-0 space-y-3 sm:pl-12">
        {groupPatchChanges(entry.changes, language).map(group => (
          <section key={`${group.section}:${group.title}`}>
            {group.section === "stats" ? <h4 className="mb-1.5 text-sm font-medium text-muted-foreground">{entry.kind === "champion" ? labels.stats : labels.changes}</h4> :
              <PatchSkillTitle championId={entry.id} section={group.section} title={group.title} report={report}
                info={skills?.[patchSkillKey(group.section, group.title)]} />}
            <dl className="space-y-1.5">
              {group.changes.map(change => {
                const glyph = patchStatGlyph(change);
                return (
                <div key={change.id} className="grid min-w-0 gap-x-4 gap-y-0.5 text-[13px] sm:grid-cols-[210px_minmax(0,1fr)] sm:text-sm">
                  <dt className="self-center leading-6 text-muted-foreground">
                    {glyph && <img src={statIconUrl(glyph)} alt="" decoding="async" className={STAT_ICON_CLASS} />}
                    {change.label[language]}
                  </dt>
                  <dd className="flex flex-wrap items-center gap-x-2 gap-y-0.5 leading-6 tabular-nums">
                    {formatPatchValues(change, "before", labels.seconds, language) && <>
                      <span className="text-muted-foreground"><span className="sr-only">{labels.before} </span>{formatPatchValues(change, "before", labels.seconds, language)}</span>
                      <ArrowRight aria-hidden="true" className="size-3 shrink-0 text-muted-foreground/60" />
                    </>}
                    <span className={`font-medium ${IMPACT_CLASSES[change.impact]}`}><span className="sr-only">{labels.after} </span>{formatPatchValues(change, "after", labels.seconds, language)}</span>
                  </dd>
                </div>
                );
              })}
            </dl>
          </section>
        ))}
      </div>
    </article>
  );
}
