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
import { MobileChampionTabs } from "./MobileChampionTabs";
import { VsSelectorModal } from "./VsSelectorModal";
import { STORAGE_KEY, TABS_STORAGE_KEY, SELECTED_TAB_ID_STORAGE_KEY } from "./constants";
import { removeStorageWithVersion } from "@/lib/storageValidator";
import { VersionProvider, useVersionContext } from "@/context/VersionContext";
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
  const [activeTab, setActiveTab] = useState<"stats" | "skills">("skills");
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
          onClose={() => setShowSelector(false)}
          open={showSelector}
          onOpenChange={setShowSelector}
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
        }}
        onOpenChange={(open) => {
          setShowVsSelector(open);
          if (!open) {
            setVsSelectorMode(null);
          }
        }}
      />

      {/* Comparison Sections */}
      {selectedChampions.length > 0 && championsWithFullInfo.length > 0 && (
        <div className="space-y-4 md:space-y-6">
          {/* Tab Navigation */}
          <TabNavigation
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onReset={resetAll}
          />

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
              isMobile && selectedTab && selectedTab.mode === 'vs' && currentTabChampions.length === 2
                ? currentTabChampions
                : isMobile && mobileChampion
                ? [mobileChampion]
                : championsWithFullInfo.map((c) => c.fullInfo!)
            }
            version={version}
            activeTab={activeTab}
            championList={championList}
            onAddChampion={isMobile ? undefined : addChampion}
            onRemoveChampion={handleRemoveChampion}
            onReorderChampions={isMobile ? undefined : handleReorderChampions}
            vsMode={
              isMobile && selectedTab && selectedTab.mode === 'vs' && currentTabChampions.length === 2
                ? { championA: currentTabChampions[0], championB: currentTabChampions[1] }
                : undefined
            }
          />
        </div>
      )}

      {/* Empty State */}
      {selectedChampions.length === 0 && (
        <EmptyState onAddClick={() => setShowSelector(true)} />
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

