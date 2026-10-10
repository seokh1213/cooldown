/** 전체 챔피언용 v2 계약. AI는 Draft만 작성하고 ID·패치·기존 수치·승인은 코드가 관리한다. */
import { CROWD_CONTROL } from "../../../../src/domain/knowledge/crowdControl";
export const SCHEMA_VERSION = 2;
export const SLOTS = ["P", "Q", "W", "E", "R"] as const;
export type Slot = typeof SLOTS[number];
export const SUBJECTS = ["caster", "target", "ally", "enemy", "nearby_enemies", "secondary_targets", "summon", "unknown"] as const;
export const EVENTS = ["passive", "cast", "recast", "attack", "followup_attack", "attack_cancelled", "attack_or_ability_hit", "ability_hit", "damage_taken",
  "stat_gain", "takedown", "kill", "death", "expiry", "leave_vision", "enter_area", "transform", "resource_depleted", "other"] as const;
export const EFFECTS = ["damage", "heal", "shield", "stat_modifier", "stat_conversion", "crowd_control", "movement", "resource_change", "cooldown_change",
  "attack_followup", "attack_modifier", "summon", "transform", "revive", "execute", "visibility", "mark", "ui_information", "other"] as const;
export const STATS = ["baseHealth", "maxHealth", "bonusHealth", "healthRegen", "totalAttackDamage", "baseAttackDamage", "bonusAttackDamage", "abilityPower",
  "armor", "bonusArmor", "magicResist", "bonusMagicResist", "maxMana", "bonusMana", "attackSpeed", "bonusAttackSpeed", "moveSpeed", "critChance",
  "critDamage", "lifeSteal", "lethality", "abilityHaste", "armorPenetration", "magicPenetration"] as const;
export const FIELDS = ["target_type", "hit_count", "followup_status", "visibility", "stat_scope", "spell_ready", "shield_ready", "health_threshold", "distance",
  "mark", "resource", "form", "weapon", "time", "entity_count", "hit_order", "activation", "other"] as const;
export const VALUES = ["champion", "minion", "monster", "structure", "any", "base", "bonus", "total", "cancelled", "fired", "visible", "unseen",
  "ready", "down", "same_target", "isolated", "immobilized", "first", "empowered"] as const;
export const PARAM_ROLES = ["amount", "min_amount", "max_amount", "duration_seconds", "cooldown_seconds", "distance_units", "count", "ratio_input", "ratio_output", "stat_coefficient",
  "damage_multiplier", "resource_cost", "resource_refund", "storage_cap", "other"] as const;
export const CC_TYPES = Object.keys(CROWD_CONTROL);
export const GAPS = ["missing_source", "source_conflict", "unresolved_number", "unresolved_condition", "unsupported_formula", "missing_variant", "scope_ambiguous"] as const;

export interface Evidence { sourceId: string; quote: string }
export type Value = { kind: "enum"; value: typeof VALUES[number] } | { kind: "boolean"; value: boolean }
  | { kind: "number_ref"; ref: string } | { kind: "text"; value: string };
export interface Condition { subject: typeof SUBJECTS[number]; field: typeof FIELDS[number]; operator: "eq" | "neq" | "lt" | "lte" | "gt" | "gte" | "present" | "absent"; value: Value }
export interface Parameter {
  role: typeof PARAM_ROLES[number]; numberRefs: string[]; stat: typeof STATS[number] | null;
  statSubject: typeof SUBJECTS[number] | null;
  shape: "scalar" | "rank_values" | "level_range" | "formula_components" | "unknown";
}
export interface Effect {
  kind: typeof EFFECTS[number]; subject: typeof SUBJECTS[number]; text: string;
  damageType: "physical" | "magic" | "true" | null; crowdControl: string | null;
  statFrom: typeof STATS[number] | null; statTo: typeof STATS[number] | null;
  parameters: Parameter[]; flags: Array<"replace_input" | "replaces_base" | "decays" | "per_target" | "unknown">;
}
export interface Rule { variant: string; trigger: { event: typeof EVENTS[number]; subject: typeof SUBJECTS[number] };
  conditions: Condition[]; effects: Effect[]; evidence: Evidence[] }
export interface Draft { summary: string; rules: Rule[]; gaps: Array<{ reason: typeof GAPS[number]; detail: string; evidence: Evidence[] }> }
export interface SourceDoc { id: string; locale: "en_US" | "ko_KR"; tier: "tooltip" | "summary" | "curated_note"; text: string; variant: string | null }
export interface SourceNumber { id: string; sourceId: string; raw: string; value: number; percent: boolean; start: number; end: number }
export interface Variant { id: string; label: string; sourceIds: string[] }
export interface Job {
  id: string; champion: string; slot: Slot; patch: string; sourceHash: string; promptHash: string;
  slotRole: "ability" | "interface_only"; facts: Record<string, unknown>;
  sources: SourceDoc[]; numbers: SourceNumber[]; variants: Variant[];
}
export interface ManifestJob { id: string; champion: string; slot: Slot; sourceHash: string; promptHash: string; state: string; pilot: boolean }
export interface Manifest { schemaVersion: number; patch: string; promptHash: string; inventoryHash: string;
  counts: { champions: number; common: number; abilities: number; total: number };
  requestedAuthor: { model: string; effort: string }; jobs: ManifestJob[] }
export function emptyEffect(kind: Effect["kind"], text: string): Effect {
  return { kind, subject: "caster", text, damageType: null, crowdControl: null, statFrom: null, statTo: null, parameters: [], flags: [] };
}
