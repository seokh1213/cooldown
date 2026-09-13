import type { AbilityForm, AbilityV2 } from "@/data/contracts/championData";

export const ACTIVE_SLOTS = ["Q", "W", "E", "R"] as const;

export function formCooldownAtRank(ability: AbilityV2, form: AbilityForm, rank: number): number | null {
  return rankCooldowns({ ability, values: form.cooldownSeconds, columns: rank })[rank - 1];
}

/** A pairs with A, B with B; an ordinary skill is highlighted only if faster than both forms. */
export function comparisonCooldownAtRank(ability: AbilityV2 | undefined, rank: number, formKey?: "A" | "B"): number | null {
  if (!ability?.forms) return rankCooldowns({ ability, values: ability?.cooldownSeconds ?? [], columns: rank })[rank - 1];
  const forms = formKey ? ability.forms.filter((form) => form.key === formKey) : ability.forms;
  const values = forms.map((form) => formCooldownAtRank(ability, form, rank)).filter((value): value is number => value !== null);
  return values.length ? Math.min(...values) : null;
}

export function isShorterCooldown(value: number | null, peer: number | null): boolean {
  return value !== null && peer !== null && Number.isFinite(value) && Number.isFinite(peer) && value >= 0 && peer >= 0 && value < peer;
}

export function cooldownRankCount(abilities: (Pick<AbilityV2, "maxRank"> | undefined)[]): number {
  return abilities.some((ability) => ability?.maxRank === 6) ? 6 : 5;
}


export function rankCooldowns(input: {
  ability: Pick<AbilityV2, "maxRank"> | undefined;
  values: readonly number[];
  columns: number;
}): (number | null)[] {
  return Array.from({ length: input.columns }, (_, index) => {
    if (!input.ability || index >= input.ability.maxRank) return null;
    const value =
      input.values.length === 1 ? input.values[0] : input.values[index];
    return value !== undefined && Number.isFinite(value) && value >= 0
      ? value
      : null;
  });
}
