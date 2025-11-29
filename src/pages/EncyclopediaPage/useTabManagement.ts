import { useState, useCallback, useEffect, useRef } from "react";
import { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { Tab, VsSelectorMode } from "./types";
import { generateTabId } from "./utils";
import { TABS_STORAGE_KEY, SELECTED_TAB_ID_STORAGE_KEY } from "./constants";
import { setStorageWithVersion, removeStorageWithVersion } from "@/lib/storageValidator";

export function useTabManagement(version: string | null) {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const tabsRef = useRef<Tab[]>([]);
  const [selectedTabId, setSelectedTabId] = useState<string | null>(null);
  const [showVsSelector, setShowVsSelector] = useState(false);
  const [vsSelectorMode, setVsSelectorMode] = useState<VsSelectorMode | null>(null);

  // tabs 상태가 변경될 때마다 ref 업데이트
  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  // Load tabs from localStorage on mount
  useEffect(() => {
    if (!version) return;

    try {
      const storedTabs = localStorage.getItem(TABS_STORAGE_KEY);
      if (storedTabs) {
        try {
          const parsedTabs = JSON.parse(storedTabs);
          if (Array.isArray(parsedTabs)) {
            setTabs(parsedTabs);
          }
        } catch (e) {
          // 탭 파싱 실패 시 무시
        }
      }

      const storedTabId = localStorage.getItem(SELECTED_TAB_ID_STORAGE_KEY);
      if (storedTabId) {
        setSelectedTabId(storedTabId);
      }
    } catch (error) {
      console.error("Failed to load stored tabs:", error);
    }
  }, [version]);

  // Save tabs to localStorage whenever tabs changes
  useEffect(() => {
    try {
      if (tabs.length > 0) {
        setStorageWithVersion(TABS_STORAGE_KEY, JSON.stringify(tabs));
      } else {
        removeStorageWithVersion(TABS_STORAGE_KEY);
      }
    } catch (error) {
      console.error("Failed to save tabs to storage:", error);
    }
  }, [tabs]);

  // Save selected tab ID to localStorage
  useEffect(() => {
    try {
      if (selectedTabId) {
        setStorageWithVersion(SELECTED_TAB_ID_STORAGE_KEY, selectedTabId);
      } else {
        removeStorageWithVersion(SELECTED_TAB_ID_STORAGE_KEY);
      }
    } catch (error) {
      console.error("Failed to save selected tab ID to storage:", error);
    }
  }, [selectedTabId]);

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

  const removeTab = useCallback((tabId: string) => {
    setTabs((prev) => prev.filter((t) => t.id !== tabId));
  }, []);

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

