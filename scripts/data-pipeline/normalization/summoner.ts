import type { NormalizedSummonerSpell } from "../../../src/types/combatNormalized";

interface RawSummonerSpell {
  key?: string;
  name?: string;
  tooltip?: string;
  description?: string;
  cooldown?: unknown[];
  image?: { full?: string };
  modes?: unknown[];
}

function stringsOnly(values: unknown[] | undefined): string[] {
  return (values ?? []).filter(
    (value): value is string => typeof value === "string",
  );
}

export function normalizeSummonerSpells(raw: unknown): NormalizedSummonerSpell[] {
  if (!raw || typeof raw !== "object") return [];
  const data = (raw as { data?: Record<string, RawSummonerSpell> }).data ?? {};

  return Object.entries(data).map(([id, spell]) => ({
    id,
    key: spell.key ?? id,
    name: spell.name ?? id,
    tooltip: spell.tooltip || spell.description || "",
    cooldown: (spell.cooldown ?? []).filter(
      (value): value is number => typeof value === "number",
    ),
    iconPath: spell.image?.full ?? "",
    modes: stringsOnly(spell.modes),
  }));
}
