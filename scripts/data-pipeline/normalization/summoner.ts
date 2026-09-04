import type {
  NormalizedDamageEffect,
  NormalizedSummonerSpell,
} from "../../../src/types/combatNormalized";

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

const IGNITE_DAMAGE_BY_LEVEL = Array.from(
  { length: 18 },
  (_, index) => 90 + index * 20,
);

function damageEffects(id: string): NormalizedDamageEffect[] {
  if (id !== "SummonerDot") return [];
  return [{
    id: "ignite-total-damage",
    damageType: "true",
    target: "champion",
    valuesByLevel: IGNITE_DAMAGE_BY_LEVEL,
    durationSeconds: 5,
  }];
}

function resolveKnownTooltipTokens(id: string, tooltip: string): string {
  if (id !== "SummonerDot") return tooltip;
  return tooltip
    .replace(/\{\{\s*tooltiptruedamagecalculation\s*\}\}/gi, "90 - 430")
    .replace(/\{\{\s*grievousamount\s*\*\s*100\s*\}\}/gi, "40");
}

export function normalizeSummonerSpells(raw: unknown): NormalizedSummonerSpell[] {
  if (!raw || typeof raw !== "object") return [];
  const data = (raw as { data?: Record<string, RawSummonerSpell> }).data ?? {};

  return Object.entries(data).map(([id, spell]) => ({
    id,
    key: spell.key ?? id,
    name: spell.name ?? id,
    tooltip: resolveKnownTooltipTokens(
      id,
      spell.tooltip || spell.description || "",
    ),
    cooldown: (spell.cooldown ?? []).filter(
      (value): value is number => typeof value === "number",
    ),
    iconPath: spell.image?.full ?? "",
    modes: stringsOnly(spell.modes),
    damageEffects: damageEffects(id),
  }));
}
