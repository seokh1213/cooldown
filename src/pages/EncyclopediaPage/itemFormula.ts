import type {
  NormalizedDamageEffect,
  NormalizedDamageScaling,
} from "@/types/combatNormalized";

export function formatItemNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale.replace("_", "-"), {
    maximumFractionDigits: 3,
  }).format(value);
}

export function itemDamageFormula(
  damage: NormalizedDamageEffect,
  labels: Record<NormalizedDamageScaling["stat"], string>,
  locale: string,
): string {
  const bases = [...new Set(damage.valuesByLevel)];
  const terms: string[] = [];
  if (bases.some((value) => value !== 0))
    terms.push(bases.map((value) => formatItemNumber(value, locale)).join("–"));
  for (const scaling of damage.scalings ?? []) {
    terms.push(
      `${labels[scaling.stat]} × ${formatItemNumber(scaling.coefficient * 100, locale)}%`,
    );
  }
  return terms.join(" + ") || "0";
}
