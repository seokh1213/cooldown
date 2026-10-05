import { AbilityIcon } from "@/components/ui/ability-icon";
import { SkillTooltip } from "@/components/features/ChampionComparison/SkillTooltip";
import type { SpellFact } from "@/lib/knowledge/facts";
import type { ChampionPassive, ChampionSpell } from "@/types";
import { TooltipProvider } from "@/components/ui/tooltip";

/** 카드의 검증된 본문을 기존 호버·터치 상세창으로 보여준다. */
export function AdvisorSkillTrigger({ championId, championName, spell, skill: fullSkill, passive, resource, patch, ddragonVersion }: {
  championId: string; championName: string; spell: SpellFact; skill?: ChampionSpell;
  passive?: ChampionPassive; resource?: string; patch: string; ddragonVersion: string;
}) {
  const icon = (size: string) => <AbilityIcon championId={championId} slot={spell.slot}
    ddragonVersion={ddragonVersion} alt={`${championName} ${spell.slot} ${spell.name}`} className={`block shrink-0 rounded ${size}`} />;
  const cooldown = spell.cooldown?.split("/").map(Number).filter(Number.isFinite) ?? [];
  const skill: ChampionSpell | undefined = fullSkill ? { ...fullSkill, costType: resource ?? fullSkill.costType, resource: resource ?? fullSkill.resource } : spell.slot === "P" ? undefined : {
    id: `${championId}${spell.slot}`, name: spell.name, maxrank: Math.max(1, cooldown.length),
    cooldown, description: spell.summary, tooltip: spell.text,
  };
  return <TooltipProvider delayDuration={0} skipDelayDuration={150}><SkillTooltip skill={skill} passive={passive ?? (spell.slot === "P" ? {
    name: spell.name, description: spell.text, image: { full: "" },
  } : undefined)} skillIdx={["Q", "W", "E", "R"].indexOf(spell.slot)}
    patchVersion={patch} ddragonVersion={ddragonVersion} headerIcon={icon("size-12")} dialogClassName="h-auto max-h-[70dvh]"
    triggerClassName="min-h-11 flex-row gap-2 rounded-md text-left focus-visible:outline-2 focus-visible:outline-ring">
    {icon("size-8")}<span className="min-w-0 leading-snug">{spell.slot} {spell.name}</span>
  </SkillTooltip></TooltipProvider>;
}
