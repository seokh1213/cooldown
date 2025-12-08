import { useEffect, useRef } from "react";
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
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
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
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const prevTabsLengthRef = useRef<number>(tabs.length);
  const hasInitializedRef = useRef<boolean>(false);

  // 선택된 탭 위치로 스크롤하는 함수 (애니메이션 옵션)
  const scrollToSelectedTab = useRef((smooth: boolean = true) => {
    if (!scrollAreaRef.current || !selectedTabId) return;

    const viewport = scrollAreaRef.current.querySelector(
      "[data-radix-scroll-area-viewport]"
    ) as HTMLDivElement | null;

    if (!viewport) return;

    // 선택된 탭의 DOM 요소 찾기
    const selectedTabElement = viewport.querySelector(
      `[data-tab-id="${selectedTabId}"]`
    ) as HTMLElement | null;

    if (selectedTabElement) {
      const tabLeft = selectedTabElement.offsetLeft;
      const tabWidth = selectedTabElement.offsetWidth;
      const viewportWidth = viewport.offsetWidth;
      
      // 탭이 뷰포트 중앙에 오도록 스크롤
      const scrollLeft = tabLeft - (viewportWidth / 2) + (tabWidth / 2);
      
      if (smooth) {
        viewport.scrollTo({
          left: Math.max(0, scrollLeft),
          behavior: "smooth",
        });
      } else {
        // 애니메이션 없이 즉시 스크롤
        viewport.scrollLeft = Math.max(0, scrollLeft);
      }
    }
  });

  // 앱 재부팅 시 선택된 탭 위치로 스크롤 (애니메이션 없이)
  useEffect(() => {
    if (!hasInitializedRef.current && selectedTabId && tabs.length > 0) {
      hasInitializedRef.current = true;
      
      // DOM이 렌더링된 후 즉시 스크롤 (애니메이션 없이)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollToSelectedTab.current(false);
        });
      });
    }
  }, [selectedTabId, tabs.length]);

  // 탭 개수가 증가하면(챔피언 추가) 맨 끝으로 스크롤
  useEffect(() => {
    if (!scrollAreaRef.current) return;

    const viewport = scrollAreaRef.current.querySelector(
      "[data-radix-scroll-area-viewport]"
    ) as HTMLDivElement | null;

    if (!viewport) return;

    // 탭 개수가 증가한 경우에만 맨 끝으로 스크롤
    if (tabs.length > prevTabsLengthRef.current) {
      viewport.scrollTo({
        left: viewport.scrollWidth,
        behavior: "smooth",
      });
    }

    prevTabsLengthRef.current = tabs.length;
  }, [tabs.length]);

  // 선택된 탭이 변경되면 해당 위치로 스크롤 (사용자가 탭을 선택했을 때 - 애니메이션 있음)
  useEffect(() => {
    if (hasInitializedRef.current && selectedTabId) {
      // 약간의 지연을 두어 DOM 업데이트가 완료된 후 스크롤
      const timeoutId = setTimeout(() => {
        scrollToSelectedTab.current(true);
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [selectedTabId]);

  return (
    <div className="border-b border-border -mx-4 px-4">
      <div className="flex items-center gap-2 pb-2">
        <span className="text-xs font-medium text-muted-foreground shrink-0 pl-3">
          {t.encyclopedia.champion}
        </span>
        {/* 가로 스크롤 영역 (필요할 때만 스크롤바 노출) */}
        <ScrollArea ref={scrollAreaRef} type="scroll" className="flex-1">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={tabs.map((tab) => tab.id)}
              strategy={horizontalListSortingStrategy}
            >
              {/* 
                가로 스크롤은 ScrollArea 내부에서 처리합니다.
                콘텐츠 너비를 내용만큼만 잡기 위해 w-max를 사용합니다.
              */}
              <div className="flex items-center gap-2 w-max select-none pr-2">
                {tabs.map((tab) => {
                  if (tab.mode === "vs") {
                    const championA = championsWithFullInfo.find(
                      (c) => c.id === tab.champions[0]
                    );
                    const championB = championsWithFullInfo.find(
                      (c) => c.id === tab.champions[1]
                    );
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
                    const champion = championsWithFullInfo.find(
                      (c) => c.id === tab.champions[0]
                    );
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
          {/* 하단 가로 스크롤바 */}
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
    </div>
  );
}

