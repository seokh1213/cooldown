export const ACTIVE_SKILL_SLOTS = ["Q", "W", "E", "R"] as const;
export type ActiveSkillSlot = (typeof ACTIVE_SKILL_SLOTS)[number];
export type SkillRanks = Record<ActiveSkillSlot, number>;

export interface TargetDefenseState {
  health: number;
  armor: number;
  magicResist: number;
  damageReductionPercent: number;
}

export interface SimulationUrlState {
  patchVersion: string;
  attackerId: string;
  targetId: string;
  attackerLevel: number;
  targetLevel: number;
  itemIds: (string | null)[];
  summonerIds: string[];
  runeId: string;
  ranks: SkillRanks;
  counts: Record<string, number>;
  excludedActions: string[];
  defense?: TargetDefenseState;
}

export const DEFAULT_SKILL_RANKS: SkillRanks = { Q: 1, W: 1, E: 1, R: 1 };

function boundedInteger(value: string | null, fallback: number, min: number, max: number): number {
  if (value === null || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(Math.max(Math.trunc(parsed), min), max)
    : fallback;
}

function parsePairs(value: string | null, max: number): Record<string, number> {
  if (!value) return {};
  return Object.fromEntries(value.split(".").flatMap((part) => {
    const separator = part.lastIndexOf(":");
    if (separator < 1) return [];
    const key = decodeURIComponent(part.slice(0, separator));
    const count = boundedInteger(part.slice(separator + 1), 0, 0, max);
    return [[key, count]];
  }));
}

function serializePairs(values: Record<string, number>): string {
  return Object.entries(values)
    .filter(([, value]) => value > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodeURIComponent(key)}:${value}`)
    .join(".");
}

export function parseSimulationSearch(search: string): Partial<SimulationUrlState> {
  const params = new URLSearchParams(search);
  const ranks = parsePairs(params.get("sr"), 6);
  const itemIds = params.get("i")?.split(".").slice(0, 6).map((id) => id || null);
  const summonerIds = params.get("ss")?.split(".").slice(0, 2);
  const hasDefense = ["hp", "ar", "mr", "dr"].some((key) => params.has(key));
  return {
    patchVersion: params.get("p") ?? "",
    attackerId: params.get("a") ?? "",
    targetId: params.get("t") ?? "",
    attackerLevel: boundedInteger(params.get("al"), 18, 1, 18),
    targetLevel: boundedInteger(params.get("tl"), 18, 1, 18),
    ...(itemIds ? { itemIds } : {}),
    ...(summonerIds ? { summonerIds } : {}),
    runeId: params.get("r") ?? "",
    ranks: {
      Q: ranks.Q ?? 1,
      W: ranks.W ?? 1,
      E: ranks.E ?? 1,
      R: ranks.R ?? 1,
    },
    counts: parsePairs(params.get("cc"), 10),
    excludedActions: params.get("off")?.split(".").filter(Boolean).map(decodeURIComponent) ?? [],
    ...(hasDefense ? {
      defense: {
        health: boundedInteger(params.get("hp"), 0, 0, 20000),
        armor: boundedInteger(params.get("ar"), 0, -100, 1000),
        magicResist: boundedInteger(params.get("mr"), 0, -100, 1000),
        damageReductionPercent: boundedInteger(params.get("dr"), 0, 0, 100),
      },
    } : {}),
  };
}

export function serializeSimulationState(state: SimulationUrlState): string {
  const params = new URLSearchParams();
  params.set("v", "1");
  if (state.patchVersion) params.set("p", state.patchVersion);
  if (state.attackerId) params.set("a", state.attackerId);
  if (state.targetId) params.set("t", state.targetId);
  params.set("al", String(state.attackerLevel));
  params.set("tl", String(state.targetLevel));
  if (state.itemIds.some(Boolean)) params.set("i", state.itemIds.map((id) => id ?? "").join("."));
  if (state.summonerIds.some(Boolean)) params.set("ss", state.summonerIds.join("."));
  if (state.runeId) params.set("r", state.runeId);
  params.set("sr", serializePairs(state.ranks));
  const counts = serializePairs(state.counts);
  if (counts) params.set("cc", counts);
  if (state.excludedActions.length > 0) {
    params.set("off", [...state.excludedActions].sort().map(encodeURIComponent).join("."));
  }
  if (state.defense) {
    params.set("hp", String(state.defense.health));
    params.set("ar", String(state.defense.armor));
    params.set("mr", String(state.defense.magicResist));
    params.set("dr", String(state.defense.damageReductionPercent));
  }
  return params.toString();
}
