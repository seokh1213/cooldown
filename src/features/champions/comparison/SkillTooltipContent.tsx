import type { ChampionPassive, ChampionSpell } from "@/domain/game/types";
import type { ReactNode } from "react";
import { passiveIconUrl, spellIconUrl } from "@/infrastructure/assets/riotAssetUrls";
import { SKILL_LETTERS } from "./constants";
import { SafeBlockHtml } from "@/shared/ui/safe-html";
import { AbilityStructuredDetails } from "./AbilityStructuredDetails";
import { AbilityFormDetails } from "./AbilityFormDetails";

interface SkillTooltipContentProps {
  skill?: ChampionSpell;
  skillIdx: number;
  ddragonVersion: string;
  passive?: ChampionPassive;
  cooldownText: string | null;
  costText: string | null;
  mobile: boolean;
  headerIcon?: ReactNode;
}

/** 액티브 스킬 머리(`ActiveSkillHeader`)와 같은 꼴. 패시브만 아이콘 없이 이름 글자로 시작하던 것을 맞춘다. */
function PassiveHeader({ passive, ddragonVersion, headerIcon }: { passive: ChampionPassive; ddragonVersion: string; headerIcon?: ReactNode }) {
  return (
    <div className="flex items-start gap-3 border-b pb-3 pr-6">
      {headerIcon ?? <img
        src={passiveIconUrl(ddragonVersion, passive.image.full)}
        alt="P"
        width={48}
        height={48}
        className="w-12 h-12 min-w-12 min-h-12 rounded shrink-0"
      />}
      <div className="flex-1 min-w-0">
        {passive.name && (
          <div className="font-semibold text-sm">
            [P] {passive.name}
          </div>
        )}
      </div>
    </div>
  );
}

function PassiveContent(props: SkillTooltipContentProps) {
  const { passive } = props;
  if (!passive) return null;
  return (
    <>
      <PassiveHeader passive={passive} ddragonVersion={props.ddragonVersion} headerIcon={props.headerIcon} />
      {passive.description && (
        <SafeBlockHtml
          className="text-xs leading-relaxed"
          html={passive.description}
        />
      )}
      <AbilityStructuredDetails
        rankValues={passive.rankValues}
        levelValues={passive.levelValues}
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

function ActiveSkillNumbers(props: SkillTooltipContentProps) {
  return <div className={props.mobile ? "mt-1 text-left" : "shrink-0 text-right"}>
    {props.cooldownText && <div className="text-xs text-muted-foreground"><CooldownText value={props.cooldownText} /></div>}
    {props.costText && <div className="mt-1 text-xs text-muted-foreground">{props.costText}</div>}
  </div>;
}

function ActiveSkillHeader(props: SkillTooltipContentProps & { skill: ChampionSpell }) {
  const letter = SKILL_LETTERS[props.skillIdx];
  return (
    <div className="flex items-start gap-3 border-b pb-3 pr-6">
      {props.headerIcon ?? <img
        src={spellIconUrl(props.ddragonVersion, props.skill.id)}
        alt={letter}
        width={48}
        height={48}
        className="w-12 h-12 min-w-12 min-h-12 rounded shrink-0"
      />}
      <div className="flex-1 min-w-0">
        {props.skill.name && (
          <div className="font-semibold text-sm">
            [{letter}] {props.skill.name}
          </div>
        )}
        {props.mobile && <ActiveSkillNumbers {...props} />}
      </div>
      {!props.mobile && <ActiveSkillNumbers {...props} />}
    </div>
  );
}

function ActiveSkillContent(props: SkillTooltipContentProps) {
  const { skill } = props;
  if (!skill) return null;
  if (skill.forms) return <AbilityFormDetails forms={skill.forms} ddragonVersion={props.ddragonVersion} />;
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
        levelValues={skill.levelValues}
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
