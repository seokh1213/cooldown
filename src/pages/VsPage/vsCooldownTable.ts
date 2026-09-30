import type { AbilityForm, AbilityV2 } from "@/data/contracts/championData";

export const ACTIVE_SLOTS = ["Q", "W", "E", "R"] as const;

/**
 * 스킬 열 안에서 내용물을 어디에 둘지.
 *
 * 열 넷이 폭을 똑같이 나누고 가운데 정렬하면 첫 아이콘이 카드 왼쪽 끝에서 열 반쪽만큼
 * 떨어져 빈다. 그래서 Q 는 열 왼쪽 끝, R 은 오른쪽 끝에 붙이고 W·E 는 그 사이를
 * 삼등분한 자리에 둔다. 아이콘 폭(`--vs-icon`)만큼의 상자를 열 안에서 k/3 만큼 밀고,
 * 숫자·재충전 줄은 그 상자 가운데에 맞춘다. 상자보다 넓은 글은 양쪽으로 고르게 넘친다.
 */
export const SLOT_BOX = "flex w-[var(--vs-icon)] flex-col items-center";
export const SLOT_OFFSET = ["ml-0", "ml-[calc((100%-var(--vs-icon))/3)]", "ml-[calc((100%-var(--vs-icon))*2/3)]", "ml-[calc(100%-var(--vs-icon))]"] as const;
export const slotOffsetClass = (columnIndex: number) => SLOT_BOX + " " + SLOT_OFFSET[columnIndex % ACTIVE_SLOTS.length];

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
