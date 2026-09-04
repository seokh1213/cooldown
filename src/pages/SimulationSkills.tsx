import { Card } from "@/components/ui/card";
import type { ChampionDetailV2 } from "@/data/contracts/championData";
import { spellIconUrl } from "@/data/assets/riotAssetUrls";
import { useTranslation } from "@/i18n";
import { htmlToPlainText } from "@/lib/htmlText";
import type { Champion } from "@/types";
import {
  evaluateAbilitySimulation,
  type SimpleStats,
  type SkillSummary,
} from "./SimulationPage.damageUtils";

interface SimulationSkillsProps {
  champion: Champion | null;
  detail: ChampionDetailV2 | null;
  ddragonVersion: string;
  finalStats: SimpleStats | null;
  skillSummaries: SkillSummary[];
}

const ACTIVE_SLOTS = ["Q", "W", "E", "R"] as const;

export function SimulationSkills({
  champion,
  detail,
  ddragonVersion,
  finalStats,
  skillSummaries,
}: SimulationSkillsProps) {
  const { t } = useTranslation();

  return (
    <Card className="mt-6 bg-card/60 border-border/70">
      <div className="border-b border-border/70 px-4 py-3">
        <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          {t.pages.simulation.skillsTitle}
        </div>
      </div>
      <div className="px-4 py-4 space-y-3">
        {ACTIVE_SLOTS.map((slot, index) => {
          const spell = champion?.spells?.[index];
          const summary = skillSummaries[index];
          const ability = detail?.champion.abilities[slot];
          const damage = finalStats
            ? evaluateAbilitySimulation(
                ability?.simulation,
                summary?.maxrank ?? spell?.maxrank ?? 1,
                finalStats,
              )
            : null;

          return (
            <div
              key={slot}
              className="flex items-start gap-3 border border-border/50 rounded-md px-3 py-2 bg-background/40"
            >
              {spell ? (
                <img
                  src={spellIconUrl(ddragonVersion, spell.id)}
                  alt=""
                  aria-hidden="true"
                  width={32}
                  height={32}
                  loading="lazy"
                  className="w-8 h-8 rounded-sm border border-border/70 bg-slate-900 object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-sm border border-border/70 bg-slate-900 flex items-center justify-center text-xs font-bold text-amber-300">
                  {slot}
                </div>
              )}
              <div className="flex-1 space-y-1">
                <div className="text-[11px] font-semibold">
                  {slot}: {spell?.name ?? t.pages.simulation.skillPlaceholderTitle}
                </div>
                <div className="text-[11px] text-muted-foreground leading-snug">
                  {spell
                    ? htmlToPlainText(ability?.summary ?? spell.description ?? "")
                    : t.pages.simulation.skillPlaceholderDescription}
                </div>
                {damage != null && (
                  <div className="text-[10px] text-emerald-400 mt-1">
                    예상 피해 (아이템/레벨 반영): {damage.toFixed(1)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
