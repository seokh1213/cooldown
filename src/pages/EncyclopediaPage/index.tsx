import { useState, useCallback, useMemo } from "react";
import { Champion } from "@/types";
import { arrayMove } from "@dnd-kit/sortable";
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import ChampionComparison from "@/components/features/ChampionComparison";
import ChampionSelector from "@/components/features/ChampionSelector";
import { useDeviceType } from "@/hooks/useDeviceType";
import { EncyclopediaPageProps, Tab } from "./types";
import { useTabManagement } from "./useTabManagement";
import { useChampionData } from "./useChampionData";
import { EmptyState } from "./EmptyState";
import { TabNavigation } from "./TabNavigation";
import { RunesTab } from "./RunesTab";
import { ItemsTab } from "./ItemsTab";
import { MobileChampionTabs } from "./MobileChampionTabs";
import { VsSelectorModal } from "./VsSelectorModal";
import { STORAGE_KEY, TABS_STORAGE_KEY, SELECTED_TAB_ID_STORAGE_KEY } from "./constants";
import { setStorageWithVersion, removeStorageWithVersion } from "@/lib/storageValidator";
import { VersionProvider, useVersionContext } from "@/context/VersionContext";
import type { StoredSelectedChampionList } from "@/lib/storageSchema";
import { logger } from "@/lib/logger";
import { useTranslation } from "@/i18n";

function getMajorMinor(version: string | null | undefined): string | null {
  if (!version) return null;
  const parts = version.split(".");
  if (parts.length >= 2) {
    return `${parts[0]}.${parts[1]}`;
  }
  return version;
}

function EncyclopediaPageContent({
  lang,
  championList,
  version,
  cdragonVersion: initialCDragonVersion,
  initialSelectedChampions,
  initialTabs,
  initialSelectedTabId,
}: EncyclopediaPageProps) {
  const [activeTab, setActiveTab] = useState<"skills" | "stats" | "runes" | "items">("skills");
  const [showSelector, setShowSelector] = useState(false);
  const deviceType = useDeviceType();
  const isMobile = deviceType === "mobile";
  const { cdragonVersion } = useVersionContext();
  const { t } = useTranslation();

  const {
    tabs,
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
  } = useTabManagement({
    version,
    initialTabs,
    initialSelectedTabId,
  });

  const {
    selectedChampions,
    setSelectedChampions,
    championsWithFullInfo,
    normalTabChampions,
    addChampionToList,
    removeChampion,
    resetChampions: resetChampionsData,
  } = useChampionData({
    version,
    lang,
    championList,
    tabs,
    initialSelectedChampions,
  });

  // localStorage에 상태를 한 번에 저장하는 헬퍼 (메모리 상태는 항상 즉시 업데이트)
  const persistEncyclopediaState = useCallback(() => {
    try {
      // 선택된 챔피언 목록 저장
      if (selectedChampions.length > 0) {
        const toStore: StoredSelectedChampionList = selectedChampions.map(({ id, key }) => ({
          id,
          key,
        }));
        setStorageWithVersion(STORAGE_KEY, JSON.stringify(toStore));
      } else {
        removeStorageWithVersion(STORAGE_KEY);
      }

      // 탭 배열 저장
      if (tabs.length > 0) {
        setStorageWithVersion(TABS_STORAGE_KEY, JSON.stringify(tabs));
      } else {
        removeStorageWithVersion(TABS_STORAGE_KEY);
      }

      // 선택된 탭 ID 저장
      if (selectedTabId) {
        setStorageWithVersion(SELECTED_TAB_ID_STORAGE_KEY, selectedTabId);
      } else {
        removeStorageWithVersion(SELECTED_TAB_ID_STORAGE_KEY);
      }
    } catch (error) {
      logger.error("Failed to persist encyclopedia state to storage:", error);
    }
  }, [selectedChampions, tabs, selectedTabId]);

  // 드래그 앤 드롭 센서 설정
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 12, // 12px 이상 이동해야 드래그 시작 (모바일에서 스크롤과 구분)
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );


  // PC 버전 챔피언 순서 변경 핸들러
  const handleReorderChampions = useCallback((oldIndex: number, newIndex: number) => {
    setSelectedChampions((prev) => arrayMove(prev, oldIndex, newIndex));
  }, [setSelectedChampions]);

  const addChampion = useCallback(
    (champion: Champion) => {
      const prevIds = new Set(selectedChampions.map((c) => c.id));
      
      if (prevIds.has(champion.id)) {
        const currentTabs = tabsRef.current;
        const hasNormalTab = currentTabs.some(
          (tab) => tab.mode === 'normal' && tab.champions.length === 1 && tab.champions[0] === champion.id
        );
        const isInVsTab = currentTabs.some(
          (tab) => tab.mode === 'vs' && tab.champions.includes(champion.id)
        );

        if (hasNormalTab) {
          // 일반 탭 제거
          const tabToRemove = tabs.find(
            (tab) => tab.mode === 'normal' && tab.champions.length === 1 && tab.champions[0] === champion.id
          );
          if (tabToRemove) {
            removeTab(tabToRemove.id);
          }
          
          // VS 탭에 포함되어 있지 않으면 챔피언도 제거
          if (!isInVsTab) {
            removeChampion(champion.id);
          }
          return;
        }

        if (isInVsTab) {
          // 일반 탭 생성
          const newTab: Tab = {
            mode: 'normal',
            champions: [champion.id],
            id: generateTabId(),
          };
          addTab(newTab);
          return;
        }

        // 일반 탭도 없고 VS 탭에도 없으면 챔피언과 일반 탭 모두 제거
        const tabToRemove = tabs.find(
          (tab) => tab.mode === 'normal' && tab.champions.length === 1 && tab.champions[0] === champion.id
        );
        if (tabToRemove) {
          removeTab(tabToRemove.id);
        }
        removeChampion(champion.id);
        return;
      }

      // 새 챔피언 추가 - 먼저 챔피언을 추가하고, 그 다음 탭을 추가
      // 이렇게 하면 useChampionData의 useEffect가 실행되어도 문제가 없음
      addChampionToList(champion);

      // 일반 탭 생성
      const newTab: Tab = {
        mode: 'normal',
        champions: [champion.id],
        id: generateTabId(),
      };
      addTab(newTab);
    },
    [selectedChampions, tabs, tabsRef, addChampionToList, removeChampion, addTab, removeTab, generateTabId]
  );

  const resetAll = useCallback(() => {
    resetChampionsData();
    resetTabs();
    removeStorageWithVersion(STORAGE_KEY);
    removeStorageWithVersion(TABS_STORAGE_KEY);
    removeStorageWithVersion(SELECTED_TAB_ID_STORAGE_KEY);
  }, [resetChampionsData, resetTabs]);

  // VS 모드용 챔피언 선택 핸들러
  const handleVsChampionSelect = useCallback(
    (champion: Champion) => {
      if (!vsSelectorMode) return;

      const { mode, tabId } = vsSelectorMode;
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return;

      if (mode === 'select-second') {
        // 기존 일반 탭을 VS 탭으로 변환
        const newTab: Tab = {
          mode: 'vs',
          champions: [tab.champions[0], champion.id],
          id: generateTabId(),
        };
        replaceTab(tabId, newTab);

        // 선택한 챔피언이 목록에 없으면 추가
        if (!selectedChampions.some((c) => c.id === champion.id)) {
          addChampionToList(champion);
        }
      } else if (mode === 'change-champion-a') {
        // A 챔피언 변경
        updateTab(tabId, (t) => ({ ...t, champions: [champion.id, t.champions[1]] }));

        if (!selectedChampions.some((c) => c.id === champion.id)) {
          addChampionToList(champion);
        }
      } else if (mode === 'change-champion-b') {
        // B 챔피언 변경
        updateTab(tabId, (t) => ({ ...t, champions: [t.champions[0], champion.id] }));

        if (!selectedChampions.some((c) => c.id === champion.id)) {
          addChampionToList(champion);
        }
      }

      setShowVsSelector(false);
      setVsSelectorMode(null);
    },
    [vsSelectorMode, tabs, selectedChampions, addChampionToList, updateTab, replaceTab, generateTabId]
  );

  // 현재 선택된 탭
  const selectedTab = useMemo(() => {
    if (!selectedTabId) return null;
    return tabs.find((t) => t.id === selectedTabId) || null;
  }, [selectedTabId, tabs]);

  // 현재 선택된 탭의 챔피언들
  const currentTabChampions = useMemo(() => {
    if (!selectedTab) return [];
    return selectedTab.champions
      .map((championId) => championsWithFullInfo.find((c) => c.id === championId)?.fullInfo)
      .filter((c): c is NonNullable<typeof c> => c !== undefined);
  }, [selectedTab, championsWithFullInfo]);

  // 모바일에서 보여줄 챔피언 (한 명씩 또는 VS 모드)
  const mobileChampion = useMemo(() => {
    if (!isMobile) return null;

    if (selectedTab && selectedTab.mode === 'vs') {
      return null;
    }

    if (selectedTab && selectedTab.mode === 'normal' && currentTabChampions.length > 0) {
      return currentTabChampions[0];
    }

    return null;
  }, [isMobile, selectedTab, currentTabChampions]);

  const handleRemoveChampion = useCallback(
    (championId: string) => {
      // 챔피언을 사용하는 모든 탭 제거
      tabs.forEach((tab) => {
        if (tab.champions.includes(championId)) {
          removeTab(tab.id);
        }
      });
      removeChampion(championId);
    },
    [tabs, removeChampion, removeTab]
  );

  const handleVsClick = useCallback(
    (tabId: string) => {
      setVsSelectorMode({
        mode: 'select-second',
        tabId,
      });
      setShowVsSelector(true);
    },
    []
  );

  const handleChangeChampionA = useCallback(
    (tabId: string) => {
      setVsSelectorMode({
        mode: 'change-champion-a',
        tabId,
        championIndex: 0,
      });
      setShowVsSelector(true);
    },
    []
  );

  const handleChangeChampionB = useCallback(
    (tabId: string) => {
      setVsSelectorMode({
        mode: 'change-champion-b',
        tabId,
        championIndex: 1,
      });
      setShowVsSelector(true);
    },
    []
  );

  const isVersionMismatch = useMemo(() => {
    const ddragonMajorMinor = getMajorMinor(version);
    const cdragonMajorMinor = getMajorMinor(cdragonVersion);
    if (!ddragonMajorMinor || !cdragonMajorMinor) return false;
    return ddragonMajorMinor !== cdragonMajorMinor;
  }, [version, cdragonVersion]);

  return (
    <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-5">
      {/* Version mismatch banner */}
      {isVersionMismatch && (
        <div className="mb-3 md:mb-4 rounded-md border border-amber-400/60 bg-amber-50/90 px-3 py-2 text-xs md:text-sm text-amber-950 shadow-sm">
          <div className="font-semibold mb-0.5">
            {t.versionNotice.title}
          </div>
          <div className="text-[11px] md:text-xs text-amber-900/90 mb-1.5">
            {t.versionNotice.description}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] md:text-[11px] text-amber-900/80">
            <span>
              <span className="font-semibold">{t.versionNotice.cdragonLabel}:</span>{" "}
              {getMajorMinor(cdragonVersion) ?? "-"}
            </span>
            <span>
              <span className="font-semibold">{t.versionNotice.ddragonLabel}:</span>{" "}
              {getMajorMinor(version) ?? "-"}
            </span>
          </div>
        </div>
      )}
      {/* Champion Selector Modal */}
      {showSelector && (
        <ChampionSelector
          championList={championList}
          selectedChampions={normalTabChampions}
          onSelect={addChampion}
          onClose={() => {
            setShowSelector(false);
            // 한 번의 선택 세션이 끝났을 때 localStorage에 일괄 저장
            persistEncyclopediaState();
          }}
          open={showSelector}
          onOpenChange={(open) => {
            setShowSelector(open);
            if (!open) {
              // 모바일/PC 공통: 셀렉터가 닫힐 때 상태를 로컬 스토리지에 저장
              persistEncyclopediaState();
            }
          }}
        />
      )}

      {/* VS Mode Champion Selector Modal */}
      <VsSelectorModal
        open={showVsSelector}
        vsSelectorMode={vsSelectorMode}
        tabs={tabs}
        championList={championList}
        selectedChampions={selectedChampions}
        onSelect={handleVsChampionSelect}
        onClose={() => {
          setShowVsSelector(false);
          setVsSelectorMode(null);
          // VS 셀렉터 세션 종료 시 상태 저장
          persistEncyclopediaState();
        }}
        onOpenChange={(open) => {
          setShowVsSelector(open);
          if (!open) {
            setVsSelectorMode(null);
            persistEncyclopediaState();
          }
        }}
      />

      {/* Tab navigation for encyclopedia sections */}
      <div className="mt-3 md:mt-4">
        <TabNavigation
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onReset={resetAll}
        />
      </div>

      {/* Runes / Items encyclopedia tabs */}
      {activeTab === "runes" && (
        <RunesTab version={version} lang={lang} />
      )}
      {activeTab === "items" && (
        <ItemsTab version={version} lang={lang} />
      )}

      {/* Champion comparison only for skills / stats tabs */}
      {(activeTab === "skills" || activeTab === "stats") && (
        <>
          {selectedChampions.length > 0 && championsWithFullInfo.length > 0 && (
            <div className="mt-4 md:mt-6 space-y-4 md:space-y-6">
              {/* Mobile: Champion Selection Tab */}
              {isMobile && tabs.length > 0 && (
                <MobileChampionTabs
                  tabs={tabs}
                  championsWithFullInfo={championsWithFullInfo}
                  version={version}
                  selectedTabId={selectedTabId}
                  sensors={sensors}
                  onDragEnd={handleDragEnd}
                  onSelectTab={setSelectedTabId}
                  onRemoveTab={removeTab}
                  onVsClick={handleVsClick}
                  onChangeChampionA={handleChangeChampionA}
                  onChangeChampionB={handleChangeChampionB}
                  onAddClick={() => setShowSelector(true)}
                />
              )}

              {/* Comparison Content */}
              <ChampionComparison
                champions={
                  isMobile &&
                  selectedTab &&
                  selectedTab.mode === "vs" &&
                  currentTabChampions.length === 2
                    ? currentTabChampions
                    : isMobile && mobileChampion
                    ? [mobileChampion]
                    : championsWithFullInfo.map((c) => c.fullInfo!)
                }
                version={version}
                activeTab={activeTab === "skills" ? "skills" : "stats"}
                championList={championList}
                onAddChampion={isMobile ? undefined : addChampion}
                onRemoveChampion={handleRemoveChampion}
                onReorderChampions={
                  isMobile ? undefined : handleReorderChampions
                }
                vsMode={
                  isMobile &&
                  selectedTab &&
                  selectedTab.mode === "vs" &&
                  currentTabChampions.length === 2
                    ? {
                        championA: currentTabChampions[0],
                        championB: currentTabChampions[1],
                      }
                    : undefined
                }
              />
            </div>
          )}

          {/* Empty State */}
          {selectedChampions.length === 0 && (
            <div className="mt-4">
              <EmptyState onAddClick={() => setShowSelector(true)} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function EncyclopediaPage(props: EncyclopediaPageProps) {
  return (
    <VersionProvider 
      initialDDragonVersion={props.version}
      initialCDragonVersion={props.cdragonVersion}
    >
      <EncyclopediaPageContent {...props} />
    </VersionProvider>
  );
}

