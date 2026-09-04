import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { championIconUrl, spellIconUrl } from "@/data/assets/riotAssetUrls";
import type { AbilitySlot, ChampionDetailV2 } from "@/data/contracts/championData";
import { useTranslation } from "@/i18n";
import type { Champion } from "@/types";
import {
  applyDamageMitigation,
  evaluateAbilitySimulation,
  type DamageType,
  type SimpleStats,
} from "./SimulationPage.damageUtils";

type ActiveSlot = Exclude<AbilitySlot, "P">;
type ActionKey = "AA" | ActiveSlot;

interface SimulationCombatPanelProps {
  attacker: Champion | null;
  attackerDetail: ChampionDetailV2 | null;
  attackerStats: SimpleStats | null;
  target: Champion | null;
  targetStats: SimpleStats | null;
  targetLevel: number;
  ddragonVersion: string;
  onOpenTargetSelector: () => void;
  onTargetLevelChange: (level: number) => void;
}

interface TargetDefense {
  health: number;
  armor: number;
  magicResist: number;
  damageReductionPercent: number;
}

interface ComboRow {
  key: ActionKey;
  name: string;
  rank: number;
  maxRank: number;
  count: number;
  rawDamage: number | null;
  appliedDamage: number | null;
  damageType: DamageType;
  iconId?: string;
}

const ACTIVE_SLOTS: ActiveSlot[] = ["Q", "W", "E", "R"];
const DEFAULT_RANKS: Record<ActiveSlot, number> = { Q: 1, W: 1, E: 1, R: 1 };
const DEFAULT_COUNTS: Record<ActionKey, number> = { AA: 1, Q: 1, W: 0, E: 1, R: 1 };

function NumberField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="space-y-1 text-[11px] text-muted-foreground">
      <span>{props.label}</span>
      <span className="flex items-center gap-1">
        <input
          type="number"
          min={props.min}
          max={props.max}
          value={Number.isFinite(props.value) ? props.value : 0}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (Number.isFinite(value)) {
              props.onChange(Math.min(Math.max(value, props.min), props.max));
            }
          }}
          className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
        />
        {props.suffix && <span>{props.suffix}</span>}
      </span>
    </label>
  );
}

function formatDamage(value: number | null): string {
  return value === null ? "—" : value.toFixed(1);
}

function useTargetDefense(targetStats: SimpleStats | null) {
  const [defense, setDefense] = useState<TargetDefense>({
    health: 0,
    armor: 0,
    magicResist: 0,
    damageReductionPercent: 0,
  });
  useEffect(() => {
    setDefense({
      health: Math.round(targetStats?.health ?? 0),
      armor: Math.round(targetStats?.armor ?? 0),
      magicResist: Math.round(targetStats?.magicResist ?? 0),
      damageReductionPercent: 0,
    });
  }, [targetStats]);
  const update = (key: keyof TargetDefense, value: number) => {
    setDefense((current) => ({ ...current, [key]: value }));
  };
  return { defense, update };
}

function damageTypeLabel(type: DamageType, labels: ReturnType<typeof useTranslation>["t"]["pages"]["simulation"]): string {
  if (type === "physical") return labels.physicalDamage;
  if (type === "magical") return labels.magicalDamage;
  if (type === "true") return labels.trueDamage;
  return labels.unknownDamage;
}

export function SimulationCombatPanel(props: SimulationCombatPanelProps) {
  const { t } = useTranslation();
  const { defense, update } = useTargetDefense(props.targetStats);
  const [ranks, setRanks] = useState(DEFAULT_RANKS);
  const [counts, setCounts] = useState(DEFAULT_COUNTS);

  useEffect(() => {
    if (!props.attackerDetail) return;
    setRanks(Object.fromEntries(ACTIVE_SLOTS.map((slot) => [
      slot,
      Math.max(props.attackerDetail!.champion.abilities[slot].maxRank, 1),
    ])) as Record<ActiveSlot, number>);
    setCounts({
      AA: 1,
      ...Object.fromEntries(ACTIVE_SLOTS.map((slot) => [
        slot,
        props.attackerDetail!.champion.abilities[slot].simulation.status === "complete" ? 1 : 0,
      ])),
    } as Record<ActionKey, number>);
  }, [props.attackerDetail]);

  const rows = useMemo<ComboRow[]>(() => {
    if (!props.attackerStats || !props.attackerDetail) return [];
    const target = defense;
    const basicRaw = props.attackerStats.attackDamage;
    const basicApplied = applyDamageMitigation(basicRaw, "physical", target);
    const abilityRows = ACTIVE_SLOTS.map((slot): ComboRow => {
      const ability = props.attackerDetail!.champion.abilities[slot];
      const rawDamage = evaluateAbilitySimulation(
        ability.simulation,
        ranks[slot],
        props.attackerStats!,
      );
      const damageType = ability.simulation.primary?.damageType ?? "unknown";
      return {
        key: slot,
        name: ability.name,
        rank: ranks[slot],
        maxRank: ability.maxRank,
        count: counts[slot],
        rawDamage,
        appliedDamage: rawDamage === null
          ? null
          : applyDamageMitigation(rawDamage, damageType, target),
        damageType,
        iconId: ability.id,
      };
    });
    return [{
      key: "AA",
      name: t.pages.simulation.basicAttack,
      rank: 1,
      maxRank: 1,
      count: counts.AA,
      rawDamage: basicRaw,
      appliedDamage: basicApplied,
      damageType: "physical",
    }, ...abilityRows];
  }, [counts, defense, props.attackerDetail, props.attackerStats, ranks, t]);

  const totalDamage = rows.reduce(
    (total, row) => total + (row.appliedDamage ?? 0) * row.count,
    0,
  );
  const remainingHealth = Math.max(defense.health - totalDamage, 0);
  const hasUnknownSelected = rows.some(
    (row) => row.count > 0 && row.rawDamage !== null && row.appliedDamage === null,
  );

  return (
    <Card className="mt-6 border-border/70 bg-card/60">
      <div className="border-b border-border/70 px-4 py-3">
        <h2 className="text-sm font-semibold">{t.pages.simulation.combatTitle}</h2>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{t.pages.simulation.combatDescription}</p>
      </div>
      <div className="grid gap-5 p-4 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.4fr)]">
        <section className="space-y-3" aria-label={t.pages.simulation.targetTitle}>
          <button
            type="button"
            aria-label={t.pages.simulation.selectTargetAria}
            onClick={props.onOpenTargetSelector}
            className="flex min-h-14 w-full items-center gap-3 rounded-md border border-border/70 bg-background/50 p-2 text-left transition-colors hover:bg-muted/60"
          >
            {props.target ? (
              <img src={championIconUrl(props.ddragonVersion, props.target.id)} alt="" className="size-10 rounded-full" />
            ) : <span className="size-10 rounded-full border border-dashed border-border" />}
            <span className="font-medium">{props.target?.name ?? t.pages.simulation.targetPlaceholder}</span>
          </button>
          <label className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>{t.common.level}</span>
            <Select
              value={String(props.targetLevel)}
              onChange={(event) => props.onTargetLevelChange(Number(event.target.value))}
              className="h-9 w-20"
            >
              {Array.from({ length: 18 }, (_, index) => index + 1).map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </Select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label={t.pages.simulation.targetHealth} value={defense.health} min={0} max={20000} onChange={(value) => update("health", value)} />
            <NumberField label={t.pages.simulation.targetArmor} value={defense.armor} min={-100} max={1000} onChange={(value) => update("armor", value)} />
            <NumberField label={t.pages.simulation.targetMagicResist} value={defense.magicResist} min={-100} max={1000} onChange={(value) => update("magicResist", value)} />
            <NumberField label={t.pages.simulation.targetDamageReduction} value={defense.damageReductionPercent} min={0} max={100} suffix="%" onChange={(value) => update("damageReductionPercent", value)} />
          </div>
        </section>

        <section className="min-w-0 space-y-3" aria-label={t.pages.simulation.comboTitle}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[540px] text-[11px]">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border/60 text-left">
                  <th className="pb-2 font-medium">{t.pages.simulation.comboTitle}</th>
                  <th className="pb-2 font-medium">{t.pages.simulation.rankLabel}</th>
                  <th className="pb-2 font-medium">{t.pages.simulation.castCountLabel}</th>
                  <th className="pb-2 text-right font-medium">{t.pages.simulation.rawDamageLabel}</th>
                  <th className="pb-2 text-right font-medium">{t.pages.simulation.mitigatedDamageLabel}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className="border-b border-border/40 last:border-0">
                    <td className="py-2">
                      <span className="flex items-center gap-2">
                        {row.iconId ? <img src={spellIconUrl(props.ddragonVersion, row.iconId)} alt="" className="size-7 rounded" /> : <span className="flex size-7 items-center justify-center rounded bg-muted font-semibold">AA</span>}
                        <span><strong>{row.key}</strong> {row.name}<small className="ml-1 text-muted-foreground">{damageTypeLabel(row.damageType, t.pages.simulation)}</small></span>
                      </span>
                    </td>
                    <td className="py-2">
                      {row.key === "AA" ? "—" : (
                        <Select value={String(row.rank)} onChange={(event) => setRanks((current) => ({ ...current, [row.key]: Number(event.target.value) }))} className="h-8 w-16">
                          {Array.from({ length: row.maxRank }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value}</option>)}
                        </Select>
                      )}
                    </td>
                    <td className="py-2"><input aria-label={`${row.name} ${t.pages.simulation.castCountLabel}`} type="number" min={0} max={10} value={row.count} onChange={(event) => setCounts((current) => ({ ...current, [row.key]: Math.min(Math.max(Number(event.target.value) || 0, 0), 10) }))} className="h-8 w-16 rounded-md border border-border bg-background px-2" /></td>
                    <td className="py-2 text-right tabular-nums">{formatDamage(row.rawDamage)}</td>
                    <td className="py-2 text-right tabular-nums">{formatDamage(row.appliedDamage === null ? null : row.appliedDamage * row.count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-muted-foreground">{t.pages.simulation.comboHint}</p>
          {hasUnknownSelected && <p className="text-[10px] text-amber-700 dark:text-amber-300">{t.pages.simulation.unknownDamageWarning}</p>}
          <div className="grid grid-cols-3 gap-2 rounded-md border border-border/70 bg-background/60 p-3 text-center">
            <div><div className="text-[10px] text-muted-foreground">{t.pages.simulation.totalDamageLabel}</div><div data-testid="combo-total" className="text-lg font-semibold tabular-nums">{totalDamage.toFixed(1)}</div></div>
            <div><div className="text-[10px] text-muted-foreground">{t.pages.simulation.remainingHealthLabel}</div><div data-testid="combo-remaining-health" className="text-lg font-semibold tabular-nums">{remainingHealth.toFixed(1)}</div></div>
            <div><div className="text-[10px] text-muted-foreground">{t.pages.simulation.combatTitle}</div><div data-testid="combo-outcome" className={`text-lg font-semibold ${defense.health > 0 && totalDamage >= defense.health ? "text-rose-500" : "text-emerald-500"}`}>{defense.health > 0 && totalDamage >= defense.health ? t.pages.simulation.lethalLabel : t.pages.simulation.survivesLabel}</div></div>
          </div>
        </section>
      </div>
    </Card>
  );
}
