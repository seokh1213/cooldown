import type { NumericChampion } from "../../patch-notes/sourceTypes";
import type { ComboChange } from "./comboReview";

function fields(value: unknown, prefix = "", output: Record<string, unknown> = {}): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value);
    if (!entries.length) output[prefix] = {};
    for (const [key, child] of entries) fields(child, prefix ? `${prefix}/${key}` : key, output);
  } else output[prefix] = value;
  return output;
}

function sourceSlot(key: string, before: NumericChampion, after: NumericChampion): string {
  if (key.startsWith("stats/") || key === "attackDamagePerLevel") return "stats";
  for (const source of [before, after]) {
    if (source.passive && key.startsWith(`spells/${source.passive}/`)) return "P";
    const index = source.rootSpells?.findIndex(spell => key.startsWith(`spells/${spell}/`)) ?? -1;
    if (index >= 0 && index < 4) return ["Q", "W", "E", "R"][index];
  }
  return "source";
}

export function numericComboChanges(before?: NumericChampion, after?: NumericChampion): ComboChange[] {
  if (!before && !after) return [];
  if (!before || !after) return [{ slot: "source", kind: "source-content", sourceKey: "numeric-source-availability" }];
  const old = fields(before), current = fields(after);
  const changes: ComboChange[] = [];
  for (const key of new Set([...Object.keys(old), ...Object.keys(current)])) {
    if (JSON.stringify(old[key]) === JSON.stringify(current[key])) continue;
    const finiteArray = (value: unknown): value is number[] => Array.isArray(value) && value.length > 0 && value.every(Number.isFinite);
    const numeric = finiteArray(old[key]) && finiteArray(current[key]) && old[key].length === current[key].length;
    changes.push({ slot: sourceSlot(key, before, after), kind: numeric ? "numeric-value" : "source-content",
      sourceKey: key, beforeValue: old[key], afterValue: current[key] });
  }
  return changes;
}
