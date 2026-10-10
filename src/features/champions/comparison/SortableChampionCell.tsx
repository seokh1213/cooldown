import type { ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Champion } from "@/domain/game/types";
import { TableCell } from "@/shared/ui/table";

export function SortableChampionCell({ champion, children, className }: {
  champion: Champion;
  children: ReactNode;
  className?: string;
}) {
  const { setNodeRef, transform, transition, isDragging } = useSortable({ id: champion.id, disabled: true });
  return (
    <TableCell ref={setNodeRef} className={className} style={{
      transform: transform ? CSS.Transform.toString(transform) : undefined,
      transition: isDragging ? transition : undefined,
      opacity: isDragging ? 0.5 : 1,
    }}>
      {children}
    </TableCell>
  );
}
