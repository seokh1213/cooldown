import { useState, useCallback } from "react";
import { Champion } from "@/types";
import { arrayMove } from "@dnd-kit/sortable";
import ChampionComparison from "@/components/features/ChampionComparison";
import ChampionSelector from "@/components/features/ChampionSelector";
import { useDeviceType } from "@/hooks/useDeviceType";
import { Tab } from "@/pages/EncyclopediaPage/types";
import { useTabManagement } from "@/pages/EncyclopediaPage/useTabManagement";
import { useChampionData } from "@/pages/EncyclopediaPage/useChampionData";
import { EmptyState } from "@/pages/EncyclopediaPage/EmptyState";
import { MobileChampionTabs } from "@/pages/EncyclopediaPage/MobileChampionTabs";
import { VsSelectorModal } from "@/pages/EncyclopediaPage/VsSelectorModal";
import { APP_STORAGE_KEYS } from "@/data/storage/appStorage";
import type { Language } from "@/i18n";
import type { StaticDataSources } from "@/data/contracts/staticData";
import { CooldownPageToolbar } from "./CooldownPageToolbar";
import { useCooldownViewTab } from "./useCooldownViewTab";
import { useSelectedCooldownTab } from "./useSelectedCooldownTab";
import { useCooldownPersistence } from "./useCooldownPersistence";
import { useChampionDragSensors } from "./useChampionDragSensors";

const {
  selectedChampions: COOLDOWN_STORAGE_KEY,
  tabs: COOLDOWN_TABS_STORAGE_KEY,
  selectedTabId: COOLDOWN_SELECTED_TAB_ID_STORAGE_KEY,
} = APP_STORAGE_KEYS;
const COOLDOWN_STORAGE_KEYS = {
  selectedChampions: COOLDOWN_STORAGE_KEY,
  tabs: COOLDOWN_TABS_STORAGE_KEY,
  selectedTabId: COOLDOWN_SELECTED_TAB_ID_STORAGE_KEY,
} as const;

interface ChampionCooldownPageProps {
  lang: Language;
  championList: Champion[] | null;
  /** 정적 데이터 경로/캐시 키로 쓰는 Riot 공식 패치 버전 (예: 26.17) */
  patchVersion: string;
  /** Data Dragon CDN 요청용 내부 버전 (예: 16.17.1) */
  ddragonVersion: string;
  sources: StaticDataSources;
}

export default function ChampionCooldownPage({
  lang,
  championList,
  patchVersion,
  ddragonVersion,
  sources,
}: ChampionCooldownPageProps) {
  const deviceType = useDeviceType();
  const isMobile = deviceType === "mobile";
  const { activeTab, selectTab } = useCooldownViewTab();
  
  const [showSelector, setShowSelector] = useState(false);

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
    patchVersion,
    tabsStorageKey: COOLDOWN_TABS_STORAGE_KEY,
    selectedTabIdStorageKey: COOLDOWN_SELECTED_TAB_ID_STORAGE_KEY,
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
    patchVersion,
    sources,
    lang,
    championList,
    tabs,
    storageKey: COOLDOWN_STORAGE_KEY,
  });

  const {
    persist: persistCooldownState,
    clear: clearCooldownState,
  } = useCooldownPersistence({
    champions: selectedChampions,
    tabs,
    selectedTabId,
    keys: COOLDOWN_STORAGE_KEYS,
  });

  const sensors = useChampionDragSensors();

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
    clearCooldownState();
  }, [resetChampionsData, resetTabs, clearCooldownState]);

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
    [vsSelectorMode, tabs, selectedChampions, addChampionToList, updateTab, replaceTab, generateTabId, setShowVsSelector, setVsSelectorMode]
  );

  const {
    selectedTab,
    currentChampions: currentTabChampions,
    mobileChampion,
  } = useSelectedCooldownTab({
    tabs,
    selectedTabId,
    champions: championsWithFullInfo,
    mobile: isMobile,
  });

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
          }, [setShowVsSelector, setVsSelectorMode]);
        
          const handleChangeChampionA = useCallback(
            (tabId: string) => {
              setVsSelectorMode({
                mode: 'change-champion-a',
                tabId,
                championIndex: 0,
              });
              setShowVsSelector(true);
            },
            [setShowVsSelector, setVsSelectorMode]
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
            [setShowVsSelector, setVsSelectorMode]
          );

  return (
    <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 pb-4 md:pb-5">
      {/* Champion Selector Modal */}
      {showSelector && (
        <ChampionSelector
          championList={championList}
          selectedChampions={normalTabChampions}
          onSelect={addChampion}
          onClose={() => {
            setShowSelector(false);
            persistCooldownState();
          }}
          open={showSelector}
          onOpenChange={(open) => {
            setShowSelector(open);
            if (!open) {
              persistCooldownState();
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
          persistCooldownState();
        }}
        onOpenChange={(open) => {
          setShowVsSelector(open);
          if (!open) {
            setVsSelectorMode(null);
            persistCooldownState();
          }
        }}
      />

      <CooldownPageToolbar
        activeTab={activeTab}
        onSelectTab={selectTab}
        onReset={resetAll}
      />

      {/* Champion comparison */}
      {selectedChampions.length > 0 && championsWithFullInfo.length > 0 && (
        <div className="mt-4 md:mt-6 space-y-4 md:space-y-6">
          {/* Mobile: Champion Selection Tab */}
          {isMobile && tabs.length > 0 && (
            <MobileChampionTabs
              tabs={tabs}
              championsWithFullInfo={championsWithFullInfo}
              ddragonVersion={ddragonVersion}
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
            patchVersion={patchVersion}
            ddragonVersion={ddragonVersion}
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
    </div>
  );
}
