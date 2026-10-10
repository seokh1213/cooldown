import type { DragEndEvent } from "@dnd-kit/core";
import { useChampionDragSensors } from "../../drag/useChampionDragSensors";
import { championReorderIndices } from "./reorderChampions";
import type { SectionProps } from "../types";

export function useChampionReordering({ champions, onReorderChampions }: Pick<SectionProps, "champions" | "onReorderChampions">) {
  const sensors = useChampionDragSensors(8);
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const indices = championReorderIndices(champions, active.id, over?.id ?? null);
    if (indices) onReorderChampions?.(...indices);
  };
  return { sensors, handleDragEnd };
}
