import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { X, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { CHAMP_ICON_URL } from "@/services/api";
import { useTranslation } from "@/i18n";
import { Tab, ChampionWithInfo } from "./types";
import {
  TAB_BASE_CLASSES,
  TAB_ACTIVE_CLASSES,
  TAB_INACTIVE_CLASSES,
  DRAG_HANDLE_CLASSES,
  REMOVE_BUTTON_CLASSES,
} from "./styles";

interface SortableVsTabProps {
  tab: Tab;
  championA: ChampionWithInfo;
  championB: ChampionWithInfo;
  version: string;
  selectedTabId: string | null;
  onSelect: (tabId: string) => void;
  onRemove: (tabId: string) => void;
  onChangeChampionA: (tabId: string) => void;
  onChangeChampionB: (tabId: string) => void;
}

export function SortableVsTab({
  tab,
  championA,
  championB,
  version,
  selectedTabId,
  onSelect,
  onRemove,
  onChangeChampionA,
  onChangeChampionB,
}: SortableVsTabProps) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tab.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isActive = selectedTabId === tab.id;
  const activeClasses = isActive ? TAB_ACTIVE_CLASSES : TAB_INACTIVE_CLASSES;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(TAB_BASE_CLASSES, activeClasses, isDragging && 'z-50')}
    >
      {/* 드래그 핸들 */}
      <button
        {...attributes}
        {...listeners}
        className={DRAG_HANDLE_CLASSES}
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-3 w-3 pointer-events-none select-none" />
      </button>

      {/* 
        VS 탭도 리스트 영역에서 가로 스크롤이 가능해야 하므로
        여기의 `touch-none`을 제거합니다.
        드래그는 Grip 아이콘 버튼에서만 발생합니다.
      */}
      <div className="flex items-center gap-1.5 flex-1 select-none">
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onChangeChampionA(tab.id);
          }}
          className="flex items-center touch-none hover:opacity-80 transition-opacity select-none"
        >
          <img
            src={CHAMP_ICON_URL(version, championA.id)}
            alt={championA.name}
            className="w-5 h-5 rounded-full select-none pointer-events-none"
            draggable="false"
          />
        </button>
        <button
          onClick={() => {
            onSelect(tab.id);
          }}
          className="text-[10px] font-semibold touch-none select-none"
        >
          {t.encyclopedia.vs}
        </button>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onChangeChampionB(tab.id);
          }}
          className="flex items-center touch-none hover:opacity-80 transition-opacity select-none"
        >
          <img
            src={CHAMP_ICON_URL(version, championB.id)}
            alt={championB.name}
            className="w-5 h-5 rounded-full select-none pointer-events-none"
            draggable="false"
          />
        </button>
      </div>

      {/* 제거 버튼 */}
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onRemove(tab.id);
        }}
          className={REMOVE_BUTTON_CLASSES}
        aria-label="Remove VS tab"
      >
          <X
            className={cn(
              "h-3 w-3 transition-colors",
              isActive
                ? "text-primary-foreground"
                : "text-muted-foreground"
            )}
          />
      </button>
    </div>
  );
}

