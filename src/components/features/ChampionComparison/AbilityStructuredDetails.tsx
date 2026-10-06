import { Fragment } from "react";
import type { NormalizedSpellScaling } from "@/types/combatNormalized";
import type {
  AbilityLevelValues,
  AbilitySimulation,
  AbilitySimulationStat,
  AbilitySimulationTerm,
} from "@/data/contracts/championData";
import { StatKey, type FormulaPart } from "@/types/combatStats";
import { formatExpr, stacksLabelFor } from "@/lib/abilitySimulationExpr";
import { levelTableColumns, type LevelTableCell, type LevelTableHead } from "@/lib/championLevelTable";
import { formatLevelRangeLabel } from "@/lib/spellTooltipParser/calculationResultFormatter";
import { LEVEL_GLYPH, LEVEL_ICON_CLASS, statIconUrl } from "@/lib/spellTooltipParser/statIcons";
import { useTranslation } from "@/i18n";
import { fill } from "@/i18n/fill";

type SkillTooltipLabels = ReturnType<typeof useTranslation>["t"]["skillTooltip"];

interface AbilityStructuredDetailsProps {
  rankValues?: Array<{ label: string; values: string }>;
  levelValues?: AbilityLevelValues[];
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
  bonus: string,
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
    bonusMana: `${bonus} ${labels.mana}`,
    attackSpeed: labels.attackspeed,
    bonusAttackSpeed: `${bonus} ${labels.attackspeed}`,
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
  bonus: string,
) {
  if (simulation?.status !== "complete" || !simulation.primary) return [];
  const coefficientValues = (term: AbilitySimulationTerm): number[] =>
    term.coefficientsByRankAndLevel?.flat() ??
    term.coefficientsByLevel ??
    term.coefficientsByRank ??
    [];
  return simulation.primary.terms.map((term) => ({
    label: simulationStatLabel(term.stat, labels, bonus),
    value: Array.from(
      new Set(coefficientValues(term).map(coefficientText)),
    ).join("/"),
  }));
}

function levelHeadText(head: LevelTableHead, labels: SkillTooltipLabels): string {
  if (head.kind === "perLevel") return labels.perLevel;
  if (head.onward) return fill(labels.levelOnward, { level: head.from });
  if (head.to != null) return fill(labels.levelSpan, { from: head.from, to: head.to });
  return fill(labels.levelSingle, { level: head.from });
}

/** "레벨당" 머리 아래 증가량은 머리가 이미 레벨당이라 "씩" 을 붙이지 않는다 */
function levelCellText(cell: LevelTableCell, head: LevelTableHead, labels: SkillTooltipLabels): string {
  if (cell.kind === "value") return cell.text;
  if (cell.kind === "growth") return `${cell.first} → ${cell.last}`;
  return head.kind === "perLevel" ? cell.text : fill(labels.perLevelStep, { value: cell.text });
}

/** 툴팁 본문의 레벨 범위 "(a ~ b⌃)" 와 같은 모양. 어느 범위의 표인지 본문과 맞대 볼 수 있다 */
function LevelRangeLabel({ entry }: { entry: AbilityLevelValues }) {
  const label = formatLevelRangeLabel(entry);
  return (
    <span className="whitespace-nowrap pt-px">
      {label.slice(0, -1)}
      <img src={statIconUrl(LEVEL_GLYPH)} alt="" decoding="async" className={LEVEL_ICON_CLASS} />
      )
    </span>
  );
}

/** 레벨 범위마다 레벨 머리와 값 두 줄. 칸을 고르는 규칙은 `levelTableColumns` */
function LevelValuesSection({ entries, labels }: { entries: AbilityLevelValues[]; labels: SkillTooltipLabels }) {
  return (
    <section aria-label={labels.levelValuesTitle}>
      <div className="mb-1 font-semibold text-foreground">{labels.levelValuesTitle}</div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1.5">
        {entries.map((entry, index) => {
          const columns = levelTableColumns(entry);
          return (
            <Fragment key={index}>
              <LevelRangeLabel entry={entry} />
              <div className="overflow-x-auto">
                <table className="border-collapse tabular-nums">
                  <thead>
                    <tr>
                      {columns.map((column, columnIndex) => (
                        <th key={columnIndex} scope="col" className="whitespace-nowrap py-px pr-2 text-left font-medium">
                          {levelHeadText(column.head, labels)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {columns.map((column, columnIndex) => (
                        <td key={columnIndex} className="whitespace-nowrap py-px pr-2 font-semibold text-foreground">
                          {levelCellText(column.cell, column.head, labels)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </Fragment>
          );
        })}
      </div>
    </section>
  );
}

export function AbilityStructuredDetails(props: AbilityStructuredDetailsProps) {
  const { t, lang } = useTranslation();
  const normalizedScalingRows = (props.scalings ?? []).flatMap((scaling) => {
    const value = formatParts(scaling.parts, t.stats);
    return value ? [{ label: lang === "ko_KR" ? scaling.labelKo : scaling.labelEn, value }] : [];
  });
  const scalingRows = normalizedScalingRows.length > 0
    ? normalizedScalingRows
    : simulationScalingRows(props.simulation, t.stats, t.common.bonus);
  const unresolved = props.diagnostics?.unresolvedTokens ?? [];
  // 선형 계수로 못 나누는 스킬은 공식을 그대로 보여 준다. 숨기면 계수가 없는 스킬과 구분되지 않는다.
  const expression = props.simulation?.status === "expression"
    ? props.simulation.expression
    : undefined;
  const formulaText = expression
    ? formatExpr(expression.root, {
        statLabel: (stat) => simulationStatLabel(stat, t.stats, t.common.bonus),
        stacksLabel: stacksLabelFor(t.skillTooltip),
      })
    : null;

  return (
    <div className="space-y-3 border-t pt-3 text-[11px] leading-relaxed text-muted-foreground">
      {props.levelValues && props.levelValues.length > 0 && (
        <LevelValuesSection entries={props.levelValues} labels={t.skillTooltip} />
      )}
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
      {formulaText && (
        <section aria-label={t.skillTooltip.formulaTitle}>
          <div className="mb-1 font-semibold text-foreground">{t.skillTooltip.formulaTitle}</div>
          <code className="block break-words text-[10px] leading-relaxed">{formulaText}</code>
          <p className="mt-1">
            {t.skillTooltip.formulaDescription}
            {expression?.requiresBuffStacks ? ` ${t.skillTooltip.formulaStacksNote}` : ""}
          </p>
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
