import notes from "../../../dev/data/knowledge/monster-notes.json";
import type { NoteVersion } from "./noteVersion";

export type MonsterLanguage = "ko" | "en" | "zh";
export type MonsterText = Record<MonsterLanguage, string>;
export type MonsterStat = "health" | "healthRegen" | "attackDamage" | "attackSpeed" | "armor" | "magicResist" | "moveSpeed" | "range";
export type MonsterModel = { kind: "constant"; value: number }
  | { kind: "champion-growth"; base: number; growth: number }
  | { kind: "level-table"; values: Record<string, number> }
  | { kind: "piecewise-linear"; points: Array<{ level: number; value: number }> };
export interface MonsterFact {
  reviewStatus: "approved" | "conflict";
  model?: MonsterModel;
  text?: MonsterText;
  parameters?: Record<string, unknown>;
  sources: string[];
  conditions: string[];
  version: NoteVersion;
}
export interface MonsterNote {
  id: string;
  group: string;
  title: MonsterText;
  aliases: Record<MonsterLanguage, string[]>;
  level: { minimum: number; maximum: number; basis: string };
  version: NoteVersion;
  sources: string[];
  stats: Partial<Record<MonsterStat, MonsterFact>>;
  abilities: Array<MonsterFact & { id: string }>;
  buffs?: Array<MonsterFact & { id: string }>;
}
export const MONSTER_REVIEW_PATCH = notes.patch;
export const MONSTER_NOTES = notes.entities as MonsterNote[];
export const monsterLanguage = (lang: string): MonsterLanguage => lang.startsWith("en") ? "en" : lang.startsWith("zh") ? "zh" : "ko";

export function monsterValue(model: MonsterModel, level: number): number | undefined {
  if (!Number.isInteger(level) || level < 1) return undefined;
  if (model.kind === "constant") return model.value;
  if (model.kind === "champion-growth") {
    const increments = level - 1;
    return model.base + model.growth * increments * (0.7025 + 0.0175 * increments);
  }
  if (model.kind === "level-table") return model.values[String(level)];
  const at = model.points.find(point => point.level === level);
  if (at) return at.value;
  const upper = model.points.findIndex(point => point.level > level);
  if (upper <= 0) return undefined;
  const a = model.points[upper - 1], b = model.points[upper];
  return a.value + (b.value - a.value) * (level - a.level) / (b.level - a.level);
}
