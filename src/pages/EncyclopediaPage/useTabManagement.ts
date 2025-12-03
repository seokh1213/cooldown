import { useState, useCallback, useEffect, useRef } from "react";
import { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { Tab, VsSelectorMode } from "./types";
import { generateTabId } from "./utils";
import { TABS_STORAGE_KEY, SELECTED_TAB_ID_STORAGE_KEY } from "./constants";
import { setStorageWithVersion, removeStorageWithVersion } from "@/lib/storageValidator";
import { logger } from "@/lib/logger";

interface UseTabManagementOptions {
  version: string | null;
  initialTabs: Tab[] | null;
  initialSelectedTabId: string | null;
}

export function useTabManagement({
  version,
  initialTabs,
  initialSelectedTabId,
}: UseTabManagementOptions) {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const tabsRef = useRef<Tab[]>([]);
  const [selectedTabId, setSelectedTabId] = useState<string | null>(null);
  const [showVsSelector, setShowVsSelector] = useState(false);
  const [vsSelectorMode, setVsSelectorMode] = useState<VsSelectorMode | null>(null);

  // tabs 상태가 변경될 때마다 ref 업데이트
  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  // 초기 탭/선택 탭 ID는 상위(App)에서 splash 시점에 한 번만 복원된 값을 사용
  useEffect(() => {
    if (!version) return;

    if (initialTabs && initialTabs.length > 0) {
      setTabs(initialTabs);
    }
    if (initialSelectedTabId) {
      setSelectedTabId(initialSelectedTabId);
    }
  }, [version, initialTabs, initialSelectedTabId]);

  // 챔피언이 로드되면 기본 탭 선택 (탭이 없을 때만)
  useEffect(() => {
    if (!selectedTabId && tabs.length > 0) {
      setSelectedTabId(tabs[0].id);
    }
  }, [tabs, selectedTabId]);

  // 탭이 삭제되면 선택된 탭 ID 업데이트
  useEffect(() => {
    if (selectedTabId && !tabs.find((t) => t.id === selectedTabId)) {
      setSelectedTabId(tabs.length > 0 ? tabs[0].id : null);
    }
  }, [tabs, selectedTabId]);

  const removeTab = useCallback(
    (tabId: string) => {
      setTabs((prevTabs) => {
        const removedIndex = prevTabs.findIndex((t) => t.id === tabId);
        const nextTabs = prevTabs.filter((t) => t.id !== tabId);

        setSelectedTabId((currentSelectedId) => {
          // 현재 선택된 탭이 아니라면 선택 상태 유지 (단, 새 탭 목록에 여전히 존재할 때만)
          if (currentSelectedId && currentSelectedId !== tabId) {
            const stillExists = nextTabs.some((t) => t.id === currentSelectedId);
            if (stillExists) {
              return currentSelectedId;
            }
          }

          // 삭제된 탭이 선택된 탭이었거나, 선택된 탭이 더 이상 존재하지 않는 경우
          if (nextTabs.length === 0) {
            return null;
          }

          // 삭제된 탭의 "왼쪽" 이웃을 우선 선택, 없으면 첫 번째 탭 선택
          const neighborIndex = removedIndex > 0 ? removedIndex - 1 : 0;
          const neighborTab = nextTabs[neighborIndex] ?? nextTabs[0];
          return neighborTab.id;
        });

        return nextTabs;
      });
    },
    [setSelectedTabId]
  );

  const addTab = useCallback((tab: Tab) => {
    setTabs((prev) => [...prev, tab]);
    setSelectedTabId(tab.id);
  }, []);

  const updateTab = useCallback((tabId: string, updater: (tab: Tab) => Tab) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? updater(t) : t)));
  }, []);

  const replaceTab = useCallback((tabId: string, newTab: Tab) => {
    setTabs((prev) => {
      const tabIndex = prev.findIndex((t) => t.id === tabId);
      if (tabIndex === -1) {
        return [...prev, newTab];
      }
      const newTabs = [...prev];
      newTabs[tabIndex] = newTab;
      return newTabs;
    });
    setSelectedTabId(newTab.id);
  }, []);

  const resetTabs = useCallback(() => {
    setTabs([]);
    setSelectedTabId(null);
    removeStorageWithVersion(TABS_STORAGE_KEY);
    removeStorageWithVersion(SELECTED_TAB_ID_STORAGE_KEY);
  }, []);

  // 드래그 종료 핸들러 (모바일 탭용)
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setTabs((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);

        if (oldIndex === -1 || newIndex === -1) return items;
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }, []);

  return {
    tabs,
    setTabs,
    tabsRef,
    selectedTabId,
    setSelectedTabId,
    showVsSelector,
    setShowVsSelector,
    vsSelectorMode,
    setVsSelectorMode,
    removeTab,
    addTab,
    updateTab,
    replaceTab,
    resetTabs,
    handleDragEnd,
    generateTabId,
  };
}

