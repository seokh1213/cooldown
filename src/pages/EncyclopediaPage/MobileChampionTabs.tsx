import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import {
  DndContext,
  closestCenter,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useTranslation } from "@/i18n";
import { Tab, ChampionWithInfo } from "./types";
import { SortableNormalTab } from "./SortableNormalTab";
import { SortableVsTab } from "./SortableVsTab";

interface MobileChampionTabsProps {
  tabs: Tab[];
  championsWithFullInfo: ChampionWithInfo[];
  version: string;
  selectedTabId: string | null;
  sensors: ReturnType<typeof import("@dnd-kit/core").useSensors>;
  onDragEnd: (event: DragEndEvent) => void;
  onSelectTab: (tabId: string) => void;
  onRemoveTab: (tabId: string) => void;
  onVsClick: (tabId: string) => void;
  onChangeChampionA: (tabId: string) => void;
  onChangeChampionB: (tabId: string) => void;
  onAddClick: () => void;
}

export function MobileChampionTabs({
  tabs,
  championsWithFullInfo,
  version,
  selectedTabId,
  sensors,
  onDragEnd,
  onSelectTab,
  onRemoveTab,
  onVsClick,
  onChangeChampionA,
  onChangeChampionB,
  onAddClick,
}: MobileChampionTabsProps) {
  const { t } = useTranslation();

  return (
    <div className="border-b border-border overflow-x-auto -mx-4 px-4">
      <div className="flex items-center gap-2 pb-2">
        <span className="text-xs font-medium text-muted-foreground shrink-0">
          {t.encyclopedia.champion}
        </span>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={tabs.map((tab) => tab.id)}
            strategy={horizontalListSortingStrategy}
          >
            <div className="flex items-center gap-2 flex-1 overflow-x-auto select-none touch-none">
              {tabs.map((tab) => {
                if (tab.mode === 'vs') {
                  const championA = championsWithFullInfo.find((c) => c.id === tab.champions[0]);
                  const championB = championsWithFullInfo.find((c) => c.id === tab.champions[1]);
                  if (!championA || !championB) return null;
                  
                  return (
                    <SortableVsTab
                      key={tab.id}
                      tab={tab}
                      championA={championA}
                      championB={championB}
                      version={version}
                      selectedTabId={selectedTabId}
                      onSelect={onSelectTab}
                      onRemove={onRemoveTab}
                      onChangeChampionA={onChangeChampionA}
                      onChangeChampionB={onChangeChampionB}
                    />
                  );
                } else {
                  const champion = championsWithFullInfo.find((c) => c.id === tab.champions[0]);
                  if (!champion) return null;
                  
                  return (
                    <SortableNormalTab
                      key={tab.id}
                      tab={tab}
                      champion={champion}
                      version={version}
                      selectedTabId={selectedTabId}
                      onSelect={onSelectTab}
                      onRemove={onRemoveTab}
                      onVsClick={onVsClick}
                    />
                  );
                }
              })}

              {/* 추가 버튼 */}
              <Button
                onClick={onAddClick}
                variant="outline"
                size="sm"
                className="flex items-center gap-1.5 shrink-0 border-2 border-dashed border-muted-foreground/30 hover:border-primary hover:bg-primary/10 hover:text-primary h-auto py-1.5 px-3 transition-colors"
              >
                <Plus className="w-3 h-3" />
                <span className="text-xs">{t.encyclopedia.add}</span>
              </Button>
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}

