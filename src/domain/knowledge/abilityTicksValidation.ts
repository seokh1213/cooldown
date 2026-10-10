import type { SpellTicks } from "./abilityTicks";

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const optional = (value: unknown, check: (v: unknown) => boolean) => value === undefined || check(value);
const localized = (value: unknown) => record(value)
  && ["ko_KR", "en_US", "zh_CN"].every(lang => typeof value[lang] === "string" && value[lang].trim().length > 0);
const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
const numeric = (value: unknown, integer = false): boolean =>
  Array.isArray(value) ? value.length > 0 && value.every(v => !Array.isArray(v) && numeric(v, integer))
    : positive(value) && (!integer || Number.isInteger(value));

export function isSpellTicks(value: unknown): value is SpellTicks {
  if (!record(value) || !["known", "unknown", "not_documented"].includes(String(value.status))) return false;
  if (!optional(value.note, localized) || !Array.isArray(value.sources)
    || !value.sources.every(source => typeof source === "string" && /^https:\/\/[^\s/]+\/\S+$/.test(source))) return false;
  if (!Array.isArray(value.effects)) return false;
  if (value.status !== "known") return value.effects.length === 0;
  return value.effects.length > 0 && value.sources.length > 0 && value.effects.every(effect => record(effect)
    && localized(effect.label) && optional(effect.perTick, localized) && optional(effect.note, localized)
    && optional(effect.intervalSeconds, numeric) && optional(effect.durationSeconds, numeric)
    && optional(effect.count, count => numeric(count, true))
    && optional(effect.countMode, mode => effect.count !== undefined && ["continuous", "duration_equivalent"].includes(String(mode)))
    && optional(effect.forms, forms => Array.isArray(forms) && forms.length > 0 && forms.length <= 2
      && new Set(forms).size === forms.length && forms.every(form => form === "A" || form === "B"))
    && (effect.intervalSeconds !== undefined || effect.count !== undefined || effect.note !== undefined));
}
