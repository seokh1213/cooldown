import { Select } from "@/components/ui/select";
import { SafeBlockHtml } from "@/components/ui/safe-html";
import type { ChampionDetailV2 } from "@/data/contracts/championData";
import { spellIconUrl } from "@/data/assets/riotAssetUrls";
import { useTranslation } from "@/i18n";
import type { Champion } from "@/types";
import {
  evaluateAbilitySimulationDetails,
  type SimpleStats,
  type SkillSummary,
} from "./SimulationPage.damageUtils";
import type { ActiveSkillSlot, SkillRanks } from "./simulationState";

interface SimulationSkillsProps {
  champion: Champion | null;
  detail: ChampionDetailV2 | null;
  ddragonVersion: string;
  finalStats: SimpleStats | null;
  targetStats: SimpleStats | null;
  skillSummaries: SkillSummary[];
  ranks: SkillRanks;
  onRankChange: (slot: ActiveSkillSlot, rank: number) => void;
}

const ACTIVE_SLOTS = ["Q", "W", "E", "R"] as const;

export function SimulationSkills({
  champion,
  detail,
  ddragonVersion,
  finalStats,
  targetStats,
  skillSummaries,
  ranks,
  onRankChange,
}: SimulationSkillsProps) {
  const { t } = useTranslation();

  const statLabel = (stat: string) => {
    const labels: Record<string, string> = {
      abilityPower: t.stats.abilityPower,
      totalAttackDamage: t.stats.attackDamage,
      baseAttackDamage: t.pages.simulation.baseAttackDamage,
      bonusAttackDamage: t.stats.bonusAttackDamage,
      maxHealth: t.stats.health,
      bonusHealth: t.stats.bonusHealth,
      armor: t.stats.armor,
      bonusArmor: t.stats.bonusArmor,
      magicResist: t.stats.magicResist,
      bonusMagicResist: t.stats.bonusMagicResist,
      maxMana: t.stats.mana,
      bonusMana: t.pages.simulation.bonusMana,
      attackSpeed: t.stats.attackspeed,
      bonusAttackSpeed: t.pages.simulation.bonusAttackSpeed,
      moveSpeed: t.stats.movespeed,
      critChance: t.stats.crit,
      critDamage: t.pages.simulation.critDamage,
      bonusCritDamage: t.pages.simulation.bonusCritDamage,
      lifeSteal: t.stats.lifesteal,
      lethality: t.pages.simulation.lethality,
    };
    return labels[stat] ?? stat;
  };

  return (
    <section className="mt-8 border-t border-border/70 pt-5">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          {t.pages.simulation.skillsTitle}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t.pages.simulation.skillRankHelp}</p>
        </div>
      </div>
      <div className="divide-y divide-border/60 border-y border-border/60">
        {ACTIVE_SLOTS.map((slot, index) => {
          const spell = champion?.spells?.[index];
          const summary = skillSummaries[index];
          const ability = detail?.champion.abilities[slot];
          const rank = ranks[slot];
          const targetHealth = targetStats
            ? { currentHealth: targetStats.health, maxHealth: targetStats.health }
            : undefined;
          const details = finalStats && rank > 0
            ? evaluateAbilitySimulationDetails(
                ability?.simulation,
                rank,
                finalStats,
                targetHealth,
              )
            : null;
          const cooldown = summary?.cooldownsWithAbilityHaste[rank - 1];

          return (
            <div
              key={slot}
              className="grid gap-3 py-4 sm:grid-cols-[40px_minmax(0,1fr)_9rem] sm:items-start"
            >
              {spell ? (
                <img
                  src={spellIconUrl(ddragonVersion, spell.id)}
                  alt=""
                  aria-hidden="true"
                  width={32}
                  height={32}
                  loading="lazy"
                  className="size-10 rounded-md border border-border/70 bg-slate-900 object-cover"
                />
              ) : (
                <div className="size-10 rounded-md border border-border/70 bg-slate-900 flex items-center justify-center text-xs font-bold text-amber-300">
                  {slot}
                </div>
              )}
              <div className="min-w-0 space-y-1.5">
                <div className="text-sm font-semibold">
                  {slot}: {spell?.name ?? t.pages.simulation.skillPlaceholderTitle}
                </div>
                {spell ? (
                  <SafeBlockHtml
                    html={ability?.bodyHtml || spell.tooltip || spell.description || ""}
                    className="text-xs leading-relaxed text-muted-foreground [&_img]:mx-0.5 [&_img]:inline-block [&_img]:size-3.5 [&_img]:align-[-0.15em]"
                  />
                ) : (
                  <div className="text-xs leading-relaxed text-muted-foreground">
                    {t.pages.simulation.skillPlaceholderDescription}
                  </div>
                )}
                {details && (
                  <div className="mt-3 border-t border-border/50 pt-3">
                    <div className="rounded-md bg-muted/45 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
                      <span className="font-sans font-medium text-foreground">{t.pages.simulation.formulaLabel}</span>{" "}
                      {details.base.toFixed(1)}
                      {details.terms.map((term) => (
                        <span key={term.stat}> + {statLabel(term.stat)} {term.statValue.toFixed(1)} × {term.coefficient.toFixed(2)}</span>
                      ))}
                      {details.targetHealthMultiplier !== undefined && (
                        <span> × {details.targetHealthMultiplier.toFixed(1)}</span>
                      )}
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400"> = {details.total.toFixed(1)}</span>
                    </div>
                  </div>
                )}
                {!details && ability?.simulation.status !== "complete" && (
                  <div className="text-[10px] text-muted-foreground">{t.pages.simulation.unsupportedFormula}</div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-1">
                <label className="text-[10px] text-muted-foreground">
                  <span className="mb-1 block">{t.pages.simulation.skillRankLabel}</span>
                  <Select
                    aria-label={`${slot} ${t.pages.simulation.skillRankLabel}`}
                    value={String(rank)}
                    onChange={(event) => onRankChange(slot, Number(event.target.value))}
                    disabled={!ability}
                    className="h-9 w-full"
                  >
                    <option value="0">0</option>
                    {Array.from({ length: ability?.maxRank ?? 0 }, (_, value) => value + 1).map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </Select>
                </label>
                <div className="text-[10px] text-muted-foreground sm:text-right">
                  <span className="mb-1 block">{t.common.cooldown}</span>
                  <strong className="text-sm font-semibold text-foreground tabular-nums">
                    {Number.isFinite(cooldown) ? `${cooldown!.toFixed(1)}s` : "—"}
                  </strong>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
