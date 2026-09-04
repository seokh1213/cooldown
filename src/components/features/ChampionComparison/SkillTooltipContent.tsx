import { AlertTriangle } from "lucide-react";
import type { ChampionSpell } from "@/types";
import { spellIconUrl } from "@/data/assets/riotAssetUrls";
import { useTranslation } from "@/i18n";
import { SKILL_LETTERS } from "./constants";
import { SafeBlockHtml } from "@/components/ui/safe-html";

interface SkillTooltipContentProps {
  skill: ChampionSpell;
  skillIdx: number;
  ddragonVersion: string;
  passive: boolean;
  passiveName?: string;
  passiveDescription?: string;
  cooldownText: string | null;
  costText: string | null;
  mobile: boolean;
}

function PassiveContent(props: SkillTooltipContentProps) {
  const { t } = useTranslation();
  return (
    <>
      {props.passiveName && (
        <div className={`font-semibold text-sm ${props.mobile ? "pr-10" : ""}`}>
          {props.passiveName}
        </div>
      )}
      {props.passiveDescription && (
        <SafeBlockHtml
          className="text-xs leading-relaxed"
          html={props.passiveDescription}
        />
      )}
      <div className="text-xs text-muted-foreground/80 italic leading-relaxed border-t pt-3 mt-3 flex items-center gap-1.5">
        <AlertTriangle className="w-2.5 h-2.5 text-yellow-600 dark:text-yellow-500 shrink-0" />
        <span>{t.skillTooltip.warningPassive}</span>
      </div>
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

function ActiveSkillHeader(props: SkillTooltipContentProps) {
  const letter = SKILL_LETTERS[props.skillIdx];
  return (
    <div className="flex items-start gap-3 border-b pb-3 pr-6">
      <img
        src={spellIconUrl(props.ddragonVersion, props.skill.id)}
        alt={letter}
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
  const { t } = useTranslation();
  const { skill } = props;
  return (
    <>
      <ActiveSkillHeader {...props} />
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
      {skill.rankValues && skill.rankValues.length > 0 && (
        <div className="text-[11px] leading-relaxed text-muted-foreground border-t pt-3 mt-3">
          {skill.rankValues.map((rankValue) => (
            <div key={`${rankValue.label}:${rankValue.values}`}>
              {rankValue.label}: [{rankValue.values}]
            </div>
          ))}
        </div>
      )}
      <div className="text-xs text-muted-foreground/80 italic leading-relaxed border-t pt-3 mt-3 flex items-center gap-1.5">
        <AlertTriangle className="w-2.5 h-2.5 text-yellow-600 dark:text-yellow-500 shrink-0" />
        <span>{t.skillTooltip.warningSkill}</span>
      </div>
    </>
  );
}

export function SkillTooltipContent(props: SkillTooltipContentProps) {
  return props.passive
    ? <PassiveContent {...props} />
    : <ActiveSkillContent {...props} />;
}
