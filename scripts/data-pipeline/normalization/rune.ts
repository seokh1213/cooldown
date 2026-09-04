import type {
  NormalizedRune,
  NormalizedDamageEffect,
  NormalizedStatShard,
} from "../../../src/types/combatNormalized";
import { StatKey, type StatContribution } from "../../../src/types/combatStats";
import { getNormalizationOverrides } from "./overrides";

export interface RuneStatShard {
  id: number;
  name: string;
  iconPath: string;
  shortDesc: string;
  longDesc: string;
}

export interface RuneStatShardData {
  locale: string;
  groups: Array<{
    styleId: number;
    styleName: string;
    rows: Array<{ label: string; perks: RuneStatShard[] }>;
  }>;
}

interface RawRune {
  id: number;
  name?: string;
  icon?: string;
  shortDesc?: string;
  longDesc?: string;
}

interface RawRuneTree {
  id: number;
  slots?: Array<{ runes?: RawRune[] }>;
}

function interpolatedValues(start: number, end: number): number[] {
  return Array.from(
    { length: 18 },
    (_, index) => start + ((end - start) * index) / 17,
  );
}

function damageEffects(runeId: number): NormalizedDamageEffect[] {
  if (runeId === 8126) {
    return [{
      id: "cheap-shot-damage",
      damageType: "true",
      target: "champion",
      valuesByLevel: interpolatedValues(10, 45),
      conditions: ["movement-or-action-impaired"],
    }];
  }
  if (runeId === 8237) {
    return [{
      id: "scorch-damage",
      damageType: "magical",
      target: "champion",
      valuesByLevel: interpolatedValues(20, 40),
      conditions: ["damaging-ability-hit"],
    }];
  }
  return [];
}

function inferShardStats(text: string): StatContribution[] {
  const cleaned = text.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  const create = (
    stat: StatKey,
    value: number,
    valueType: "flat" | "percent",
  ): StatContribution => ({
    stat,
    value,
    valueType,
    source: "rune",
    scope: "rune",
  });
  const patterns: Array<{
    expression: RegExp;
    stat: StatKey;
    valueType: "flat" | "percent";
  }> = [
    { expression: /([+-]?\d+(?:\.\d+)?)\s*Adaptive Force/i, stat: StatKey.ADAPTIVE_FORCE, valueType: "flat" },
    { expression: /([+-]?\d+(?:\.\d+)?)\s*%?\s*Attack Speed/i, stat: StatKey.ATTACK_SPEED, valueType: "percent" },
    { expression: /([+-]?\d+(?:\.\d+)?)\s*Ability Haste/i, stat: StatKey.ABILITY_HASTE, valueType: "flat" },
    { expression: /([+-]?\d+(?:\.\d+)?)\s*%?\s*Move Speed/i, stat: StatKey.MOVE_SPEED, valueType: "percent" },
    { expression: /([+-]?\d+(?:\.\d+)?)\s*Health(?!.*based on level)/i, stat: StatKey.MAX_HEALTH, valueType: "flat" },
  ];
  for (const pattern of patterns) {
    const match = cleaned.match(pattern.expression);
    if (match) return [create(pattern.stat, Number(match[1]), pattern.valueType)];
  }
  const tenacity = cleaned.match(
    /([+-]?\d+(?:\.\d+)?)\s*%?\s*Tenacity and Slow Resist/i,
  );
  if (tenacity) {
    const value = Number(tenacity[1]);
    return [
      create(StatKey.TENACITY, value, "percent"),
      create(StatKey.SLOW_RESIST, value, "percent"),
    ];
  }
  if (/Health.*based on level/i.test(cleaned)) {
    const range = cleaned.match(/(\d+)\s*-\s*(\d+)/);
    if (range) {
      return [create(StatKey.MAX_HEALTH, (Number(range[1]) + Number(range[2])) / 2, "flat")];
    }
  }
  return [];
}

function shardStatsById(data: RuneStatShardData | null): Map<number, StatContribution[]> {
  const result = new Map<number, StatContribution[]>();
  for (const group of data?.groups ?? []) {
    for (const row of group.rows) {
      for (const perk of row.perks) {
        result.set(perk.id, inferShardStats(perk.longDesc || perk.shortDesc || ""));
      }
    }
  }
  return result;
}

function normalizeRunes(locale: string, raw: unknown): NormalizedRune[] {
  if (!Array.isArray(raw)) return [];
  const overrides = getNormalizationOverrides()?.runes?.[locale];
  return (raw as RawRuneTree[]).flatMap((tree) =>
    (tree.slots ?? []).flatMap((slot, slotIndex) =>
      (slot.runes ?? []).map((rune) => {
        const normalized: NormalizedRune = {
          id: String(rune.id),
          type: "rune",
          name: rune.name ?? String(rune.id),
          iconPath: rune.icon,
          pathId: tree.id,
          slotIndex,
          stats: [],
          effects: [],
          damageEffects: damageEffects(rune.id),
          tooltip: rune.longDesc || rune.shortDesc || "",
        };
        return overrides?.[normalized.id]
          ? { ...normalized, ...overrides[normalized.id] }
          : normalized;
      }),
    ),
  );
}

function normalizeShards(
  locale: string,
  data: RuneStatShardData | null,
  sharedStats: Map<number, StatContribution[]>,
): NormalizedStatShard[] {
  const overrides = getNormalizationOverrides()?.statShards?.[locale];
  return (data?.groups ?? []).flatMap((group) =>
    group.rows.flatMap((row, rowIndex) =>
      row.perks.map((perk, columnIndex) => {
        const normalized: NormalizedStatShard = {
          id: String(perk.id),
          type: "statShard",
          name: perk.name ?? String(perk.id),
          iconPath: perk.iconPath,
          rowIndex,
          columnIndex,
          stats: sharedStats.get(perk.id)?.map((value) => ({ ...value })) ?? [],
        };
        return overrides?.[normalized.id]
          ? { ...normalized, ...overrides[normalized.id] }
          : normalized;
      }),
    ),
  );
}

export function normalizeRunesAndStatShards(
  locale: string,
  rawRunes: unknown,
  localizedShards: RuneStatShardData | null,
  englishShards: RuneStatShardData | null,
): { runes: NormalizedRune[]; statShards: NormalizedStatShard[] } {
  return {
    runes: normalizeRunes(locale, rawRunes),
    statShards: normalizeShards(locale, localizedShards, shardStatsById(englishShards)),
  };
}
