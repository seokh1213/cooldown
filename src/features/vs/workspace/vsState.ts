export interface VsSide {
  id: string;
}

export interface VsState {
  mine: VsSide;
  opponent: VsSide;
}
export type VsSideKey = keyof VsState;
export const VS_STORAGE_KEY = "cooldown:vs-comparison";

export function parseVsState(search: string): VsState {
  const params = new URLSearchParams(search);
  const side = (prefix: "a" | "t"): VsSide => ({
    id: params.get(prefix) ?? "",
  });
  return { mine: side("a"), opponent: side("t") };
}

export function serializeVsState(state: VsState): string {
  const params = new URLSearchParams();
  for (const [key, prefix] of [
    ["mine", "a"],
    ["opponent", "t"],
  ] as const) {
    const side = state[key];
    if (side.id) params.set(prefix, side.id);
  }
  return params.toString();
}
