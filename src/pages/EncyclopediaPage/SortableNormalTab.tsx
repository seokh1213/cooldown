import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { X, Swords, GripVertical } from "lucide-react";
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
  VS_BUTTON_CLASSES,
} from "./styles";

interface SortableNormalTabProps {
  tab: Tab;
  champion: ChampionWithInfo;
  version: string;
  selectedTabId: string | null;
  onSelect: (tabId: string) => void;
  onRemove: (tabId: string) => void;
  onVsClick: (tabId: string) => void;
}

export function SortableNormalTab({
  tab,
  champion,
  version,
  selectedTabId,
  onSelect,
  onRemove,
  onVsClick,
}: SortableNormalTabProps) {
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
      data-tab-id={tab.id}
      className={cn(TAB_BASE_CLASSES, activeClasses, isDragging && 'z-50')}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.tagName === 'BUTTON' || target.closest('button')) {
          return;
        }
        onSelect(tab.id);
      }}
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
        모바일에서 탭을 쥐고 가로 스크롤이 되도록 하기 위해
        여기의 `touch-none`(touch-action: none)을 제거합니다.
        드래그는 왼쪽 Grip 아이콘 버튼(드래그 핸들)에서만 처리됩니다.
      */}
      <div className="flex items-center gap-1.5 flex-1 cursor-pointer select-none">
        <img
          src={CHAMP_ICON_URL(version, champion.id)}
          alt={champion.name}
          className="w-5 h-5 rounded-full pointer-events-none select-none"
          draggable="false"
        />
        <span className="pointer-events-none select-none">{champion.name}</span>
      </div>

      {/* VS 버튼 */}
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onVsClick(tab.id);
        }}
        className={VS_BUTTON_CLASSES}
        aria-label={`${t.encyclopedia.vs} with ${champion.name}`}
        title={t.encyclopedia.vsStart}
        type="button"
      >
        <Swords
          className={cn(
            "h-3 w-3 transition-colors",
            isActive
              ? "text-primary-foreground"
              : "text-muted-foreground"
          )}
        />
      </button>

      {/* 제거 버튼 */}
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onRemove(tab.id);
        }}
        className={REMOVE_BUTTON_CLASSES}
        aria-label={`Remove ${champion.name}`}
        type="button"
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

