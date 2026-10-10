import { SkillTooltip } from "@/features/champions/comparison/SkillTooltip";
import type { PatchNotesReport } from "@/domain/game/contracts/patchNotes";
import type { PatchSkillInfo } from "@/domain/game/contracts/patchSkills";
import { PatchSkillIcon } from "./PatchSkillIcon";

export function PatchSkillTitle({ championId, section, title, info, report }: {
  championId: string; section: string; title: string; info?: PatchSkillInfo; report: PatchNotesReport;
}) {
  const content = <>
    <PatchSkillIcon championId={championId} section={section} info={info} className="size-6" />
    <span className="font-mono text-xs text-muted-foreground">{section}</span>
    <span>{title}</span>
  </>;
  return <h4 className="mb-1.5 text-sm font-medium">
    {info ? <SkillTooltip skill={info.skill} passive={info.passive} skillIdx={["Q", "W", "E", "R"].indexOf(section)}
      patchVersion={report.patchVersion} ddragonVersion={report.sources.ddragon}
      headerIcon={<PatchSkillIcon championId={championId} section={section} info={info} className="size-12" />}
      triggerClassName="min-h-11 flex-row gap-2 rounded text-left focus-visible:outline-2 focus-visible:outline-ring sm:min-h-8">
      {content}
    </SkillTooltip> : <span className="flex min-h-9 items-center gap-2 sm:min-h-6">{content}</span>}
  </h4>;
}
