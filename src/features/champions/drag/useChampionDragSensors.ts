import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

export function useChampionDragSensors(distance = 12) {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}
