import type { ChampionPassive, ChampionSpell } from "@/types";
import { spellIconUrl } from "@/data/assets/riotAssetUrls";
import { SKILL_LETTERS } from "./constants";
import { SafeBlockHtml } from "@/components/ui/safe-html";
import { AbilityStructuredDetails } from "./AbilityStructuredDetails";

interface SkillTooltipContentProps {
  skill?: ChampionSpell;
  skillIdx: number;
  ddragonVersion: string;
  passive?: ChampionPassive;
  cooldownText: string | null;
  costText: string | null;
  mobile: boolean;
}

function PassiveContent(props: SkillTooltipContentProps) {
  const { passive } = props;
  if (!passive) return null;
  return (
    <>
      {passive.name && (
        <div className={`font-semibold text-sm ${props.mobile ? "pr-10" : ""}`}>
          {passive.name}
        </div>
      )}
      {passive.description && (
        <SafeBlockHtml
          className="text-xs leading-relaxed"
          html={passive.description}
        />
      )}
      <AbilityStructuredDetails
        rankValues={passive.rankValues}
        scalings={passive.scalings}
        conditions={passive.conditions}
        diagnostics={passive.tooltipDiagnostics}
        simulation={passive.simulation}
      />
    </>
  );
}

function CooldownText({ value }: { value: string }) {
  if (!value.includes(" (")) {
    return <>{value}</>;
  }
  const [cooldown, detail] = value.split(" (");
  return (
    <>
      {cooldown}
      <br />({detail}
    </>
  );
}

function ActiveSkillHeader(props: SkillTooltipContentProps & { skill: ChampionSpell }) {
  const letter = SKILL_LETTERS[props.skillIdx];
  return (
    <div className="flex items-start gap-3 border-b pb-3 pr-6">
      <img
        src={spellIconUrl(props.ddragonVersion, props.skill.id)}
        alt={letter}
        width={48}
        height={48}
        className="w-12 h-12 min-w-12 min-h-12 rounded shrink-0"
      />
      <div className="flex-1 min-w-0">
        {props.skill.name && (
          <div className="font-semibold text-sm">
            [{letter}] {props.skill.name}
          </div>
        )}
      </div>
      <div className="text-right shrink-0">
        {props.cooldownText && (
          <div className="text-xs text-muted-foreground">
            <CooldownText value={props.cooldownText} />
          </div>
        )}
        {props.costText && (
          <div className="text-xs text-muted-foreground mt-1 whitespace-nowrap">
            {props.costText}
          </div>
        )}
      </div>
    </div>
  );
}

function ActiveSkillContent(props: SkillTooltipContentProps) {
  const { skill } = props;
  if (!skill) return null;
  return (
    <>
      <ActiveSkillHeader {...props} skill={skill} />
      {skill.description && (
        <SafeBlockHtml
          className="text-xs leading-relaxed"
          html={skill.description}
        />
      )}
      {skill.tooltip && (
        <SafeBlockHtml
          className="text-xs text-muted-foreground leading-relaxed"
          html={skill.tooltip}
        />
      )}
      <AbilityStructuredDetails
        rankValues={skill.rankValues}
        scalings={skill.scalings}
        conditions={skill.conditions}
        diagnostics={skill.tooltipDiagnostics}
        simulation={skill.simulation}
      />
    </>
  );
}

export function SkillTooltipContent(props: SkillTooltipContentProps) {
  return props.passive
    ? <PassiveContent {...props} />
    : <ActiveSkillContent {...props} />;
}
