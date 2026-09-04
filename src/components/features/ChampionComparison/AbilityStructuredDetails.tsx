import type { NormalizedSpellScaling } from "@/types/combatNormalized";
import type {
  AbilitySimulation,
  AbilitySimulationStat,
  AbilitySimulationTerm,
} from "@/data/contracts/championData";
import { StatKey, type FormulaPart } from "@/types/combatStats";
import { useTranslation } from "@/i18n";

interface AbilityStructuredDetailsProps {
  rankValues?: Array<{ label: string; values: string }>;
  scalings?: NormalizedSpellScaling[];
  conditions?: string[];
  diagnostics?: { unresolvedTokens: string[] };
  simulation?: AbilitySimulation;
}

function coefficientText(coefficient: number): string {
  const percent = coefficient * 100;
  return `${Number.isInteger(percent) ? percent : Number(percent.toFixed(2))}%`;
}

function statLabel(stat: StatKey, labels: ReturnType<typeof useTranslation>["t"]["stats"]): string {
  const knownLabels: Partial<Record<StatKey, string>> = {
    [StatKey.ABILITY_POWER]: labels.abilityPower,
    [StatKey.ATTACK_DAMAGE]: labels.attackDamage,
    [StatKey.MAX_HEALTH]: labels.health,
    [StatKey.ARMOR]: labels.armor,
    [StatKey.MAGIC_RESIST]: labels.magicResist,
    [StatKey.MOVE_SPEED]: labels.movespeed,
    [StatKey.CRIT_CHANCE]: labels.crit,
    [StatKey.CRIT_DAMAGE]: labels.critDamage,
    [StatKey.LETHALITY]: labels.lethality,
  };
  return knownLabels[stat] ?? stat;
}

function formatParts(parts: FormulaPart[], labels: ReturnType<typeof useTranslation>["t"]["stats"]): string | null {
  const resolved = parts.filter((part) => part.stat !== null);
  if (resolved.length === 0) return null;
  return resolved
    .map((part, index) => {
      const operator = index === 0 ? "" : part.op === "mul" ? " × " : " + ";
      return `${operator}${coefficientText(part.coefficient)} ${statLabel(part.stat!, labels)}`;
    })
    .join("");
}

function simulationStatLabel(
  stat: AbilitySimulationStat,
  labels: ReturnType<typeof useTranslation>["t"]["stats"],
): string {
  const names: Record<AbilitySimulationStat, string> = {
    abilityPower: labels.abilityPower,
    totalAttackDamage: labels.attackDamage,
    baseAttackDamage: labels.attackDamage,
    bonusAttackDamage: labels.bonusAttackDamage,
    maxHealth: labels.health,
    bonusHealth: labels.bonusHealth,
    armor: labels.armor,
    bonusArmor: labels.bonusArmor,
    magicResist: labels.magicResist,
    bonusMagicResist: labels.bonusMagicResist,
    maxMana: labels.mana,
    bonusMana: labels.mana,
    attackSpeed: labels.attackspeed,
    bonusAttackSpeed: labels.attackspeed,
    moveSpeed: labels.movespeed,
    critChance: labels.crit,
    critDamage: labels.critDamage,
    bonusCritDamage: labels.critDamage,
    lifeSteal: labels.lifesteal,
    lethality: labels.lethality,
  };
  return names[stat];
}

function simulationScalingRows(
  simulation: AbilitySimulation | undefined,
  labels: ReturnType<typeof useTranslation>["t"]["stats"],
) {
  if (simulation?.status !== "complete" || !simulation.primary) return [];
  const coefficientValues = (term: AbilitySimulationTerm): number[] =>
    term.coefficientsByRankAndLevel?.flat() ??
    term.coefficientsByLevel ??
    term.coefficientsByRank ??
    [];
  return simulation.primary.terms.map((term) => ({
    label: simulationStatLabel(term.stat, labels),
    value: Array.from(
      new Set(coefficientValues(term).map(coefficientText)),
    ).join("/"),
  }));
}

export function AbilityStructuredDetails(props: AbilityStructuredDetailsProps) {
  const { t, lang } = useTranslation();
  const normalizedScalingRows = (props.scalings ?? []).flatMap((scaling) => {
    const value = formatParts(scaling.parts, t.stats);
    return value ? [{ label: lang === "ko_KR" ? scaling.labelKo : scaling.labelEn, value }] : [];
  });
  const scalingRows = normalizedScalingRows.length > 0
    ? normalizedScalingRows
    : simulationScalingRows(props.simulation, t.stats);
  const unresolved = props.diagnostics?.unresolvedTokens ?? [];

  return (
    <div className="space-y-3 border-t pt-3 text-[11px] leading-relaxed text-muted-foreground">
      {props.rankValues && props.rankValues.length > 0 && (
        <section aria-label={t.skillTooltip.rankValuesTitle}>
          <div className="mb-1 font-semibold text-foreground">{t.skillTooltip.rankValuesTitle}</div>
          {props.rankValues.map((value) => (
            <div key={`${value.label}:${value.values}`} className="flex justify-between gap-3">
              <span>{value.label}</span>
              <span className="text-right tabular-nums">{value.values}</span>
            </div>
          ))}
        </section>
      )}
      {scalingRows.length > 0 && (
        <section aria-label={t.skillTooltip.scalingsTitle}>
          <div className="mb-1 font-semibold text-foreground">{t.skillTooltip.scalingsTitle}</div>
          {scalingRows.map((row) => (
            <div key={`${row.label}:${row.value}`} className="flex justify-between gap-3">
              <span>{row.label}</span>
              <span className="text-right">{row.value}</span>
            </div>
          ))}
        </section>
      )}
      {props.conditions && props.conditions.length > 0 && (
        <section aria-label={t.skillTooltip.conditionsTitle}>
          <div className="mb-1 font-semibold text-foreground">{t.skillTooltip.conditionsTitle}</div>
          <ul className="list-disc space-y-0.5 pl-4">
            {props.conditions.map((condition) => <li key={condition}>{condition}</li>)}
          </ul>
        </section>
      )}
      {unresolved.length > 0 && (
        <details>
          <summary className="cursor-pointer font-semibold text-amber-700 dark:text-amber-300">
            {t.skillTooltip.diagnosticsTitle} ({unresolved.length})
          </summary>
          <p className="mt-1">{t.skillTooltip.diagnosticsDescription}</p>
          <code className="mt-1 block break-all text-[10px]">{unresolved.join(", ")}</code>
        </details>
      )}
    </div>
  );
}
