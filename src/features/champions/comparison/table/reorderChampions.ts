import type { Champion } from "@/domain/game/types";

export function championReorderIndices(
  champions: readonly Pick<Champion, "id">[],
  activeId: string | number,
  overId: string | number | null,
): [number, number] | undefined {
  if (overId === null || activeId === overId) return undefined;
  const from = champions.findIndex(champion => champion.id === activeId);
  const to = champions.findIndex(champion => champion.id === overId);
  return from < 0 || to < 0 ? undefined : [from, to];
}
