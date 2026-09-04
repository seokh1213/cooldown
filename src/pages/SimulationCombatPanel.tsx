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
import type { SimulationExternalAction } from "./simulationExternalActions";

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
  externalActions: SimulationExternalAction[];
}

interface TargetDefense {
  health: number;
  armor: number;
  magicResist: number;
  damageReductionPercent: number;
}

interface ComboRow {
  key: string;
  name: string;
  rank: number;
  maxRank: number;
  count: number;
  rawDamage: number | null;
  appliedDamage: number | null;
  damageType: DamageType;
  iconId?: string;
  iconUrl?: string;
  hasRank: boolean;
  conditions: string[];
  displayKey: string;
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
  const [counts, setCounts] = useState<Record<string, number>>(DEFAULT_COUNTS);

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
    });
  }, [props.attackerDetail]);

  useEffect(() => {
    setCounts((current) => {
      const next = { ...current };
      for (const action of props.externalActions) next[action.id] ??= 1;
      return next;
    });
  }, [props.externalActions]);

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
        {
          currentHealth: defense.health,
          maxHealth: props.targetStats?.health ?? defense.health,
        },
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
        hasRank: true,
        conditions: ability.conditions,
        displayKey: slot,
      };
    });
    const externalRows = props.externalActions.map((action): ComboRow => ({
      key: action.id,
      name: action.name,
      rank: 1,
      maxRank: 1,
      count: counts[action.id] ?? 1,
      rawDamage: action.rawDamage,
      appliedDamage: applyDamageMitigation(action.rawDamage, action.damageType, target),
      damageType: action.damageType,
      iconUrl: action.iconUrl,
      hasRank: false,
      conditions: action.conditions,
      displayKey: action.category === "rune"
        ? t.pages.simulation.runesTitle
        : action.category === "item"
          ? t.pages.simulation.itemsTitle
          : t.pages.simulation.summonerSpellsTitle,
    }));
    return [{
      key: "AA",
      name: t.pages.simulation.basicAttack,
      rank: 1,
      maxRank: 1,
      count: counts.AA,
      rawDamage: basicRaw,
      appliedDamage: basicApplied,
      damageType: "physical",
      hasRank: false,
      conditions: [],
      displayKey: "AA",
    }, ...abilityRows, ...externalRows];
  }, [counts, defense, props.attackerDetail, props.attackerStats, props.externalActions, props.targetStats, ranks, t]);

  const totalDamage = rows.reduce(
    (total, row) => total + (row.appliedDamage ?? 0) * row.count,
    0,
  );
  const remainingHealth = Math.max(defense.health - totalDamage, 0);
  const hasUnknownSelected = rows.some(
    (row) => row.count > 0 && row.rawDamage !== null && row.appliedDamage === null,
  );
  const conditionText = (conditions: string[]) => conditions.map((condition) =>
    t.pages.simulation.conditionLabels[condition] ?? condition
  ).join(" · ");

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
          <div className="space-y-2 md:hidden">
            {rows.map((row) => (
              <article key={row.key} className="rounded-md border border-border/60 bg-background/40 p-3">
                <div className="flex items-start gap-2">
                  {row.iconId || row.iconUrl ? (
                    <img src={row.iconUrl ?? spellIconUrl(props.ddragonVersion, row.iconId!)} alt="" className="size-8 rounded" />
                  ) : (
                    <span className="flex size-8 items-center justify-center rounded bg-muted font-semibold">AA</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs"><strong>{row.displayKey}</strong> {row.name}</div>
                    <div className="text-[9px] text-muted-foreground">{damageTypeLabel(row.damageType, t.pages.simulation)}</div>
                    {row.conditions.length > 0 && (
                      <div className="mt-0.5 text-[9px] leading-tight text-amber-700 dark:text-amber-300">
                        {conditionText(row.conditions)}
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <label className="text-[9px] text-muted-foreground">
                    <span className="mb-1 block">{t.pages.simulation.rankLabel}</span>
                    {!row.hasRank ? <span className="block h-8 pt-2">—</span> : (
                      <Select value={String(row.rank)} onChange={(event) => setRanks((current) => ({ ...current, [row.key]: Number(event.target.value) }))} className="h-8 w-full">
                        {Array.from({ length: row.maxRank }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value}</option>)}
                      </Select>
                    )}
                  </label>
                  <label className="text-[9px] text-muted-foreground">
                    <span className="mb-1 block">{t.pages.simulation.castCountLabel}</span>
                    <input aria-label={`${row.name} ${t.pages.simulation.castCountLabel}`} type="number" min={0} max={10} value={row.count} onChange={(event) => setCounts((current) => ({ ...current, [row.key]: Math.min(Math.max(Number(event.target.value) || 0, 0), 10) }))} className="h-8 w-full rounded-md border border-border bg-background px-2 text-foreground" />
                  </label>
                  <div className="text-[9px] text-muted-foreground"><span>{t.pages.simulation.rawDamageLabel}</span><strong className="block text-xs font-medium text-foreground tabular-nums">{formatDamage(row.rawDamage)}</strong></div>
                  <div className="text-right text-[9px] text-muted-foreground"><span>{t.pages.simulation.mitigatedDamageLabel}</span><strong className="block text-xs font-medium text-foreground tabular-nums">{formatDamage(row.appliedDamage === null ? null : row.appliedDamage * row.count)}</strong></div>
                </div>
              </article>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
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
                        {row.iconId || row.iconUrl ? <img src={row.iconUrl ?? spellIconUrl(props.ddragonVersion, row.iconId!)} alt="" className="size-7 rounded" /> : <span className="flex size-7 items-center justify-center rounded bg-muted font-semibold">AA</span>}
                        <span className="min-w-0">
                          <span><strong>{row.displayKey}</strong> {row.name}<small className="ml-1 text-muted-foreground">{damageTypeLabel(row.damageType, t.pages.simulation)}</small></span>
                          {row.conditions.length > 0 && (
                            <small className="mt-0.5 block text-[9px] leading-tight text-amber-700 dark:text-amber-300">
                              {conditionText(row.conditions)}
                            </small>
                          )}
                        </span>
                      </span>
                    </td>
                    <td className="py-2">
                      {!row.hasRank ? "—" : (
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
