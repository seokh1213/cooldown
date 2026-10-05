export type RankingStat = "health" | "healthRegen" | "armor" | "magicResist" | "attackDamage" | "attackSpeed" | "moveSpeed";
export interface RankingScalar { base: number; perLevel: number; valuesByLevel?: number[] }
export interface RankingChampion { id: string; name: string; roles: string[]; stats: Partial<Record<RankingStat, RankingScalar>> }
export interface RankingSelection { stat: RankingStat; level: number; role: string; search: string }
export const STATS: Record<RankingStat, string>;
export function valueAtLevel(scalar: RankingScalar, level: number, field: RankingStat): number;
export function rankedChampions(champions: RankingChampion[], selection: RankingSelection): Array<RankingChampion & { value: number; rank: number }>;
