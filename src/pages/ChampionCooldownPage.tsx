import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
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
import { Tab } from "@/pages/EncyclopediaPage/types";
import { useTabManagement } from "@/pages/EncyclopediaPage/useTabManagement";
import { useChampionData } from "@/pages/EncyclopediaPage/useChampionData";
import { EmptyState } from "@/pages/EncyclopediaPage/EmptyState";
import { MobileChampionTabs } from "@/pages/EncyclopediaPage/MobileChampionTabs";
import { VsSelectorModal } from "@/pages/EncyclopediaPage/VsSelectorModal";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { STORAGE_KEY, TABS_STORAGE_KEY, SELECTED_TAB_ID_STORAGE_KEY } from "@/pages/EncyclopediaPage/constants";
import { setStorageWithVersion, removeStorageWithVersion } from "@/lib/storageValidator";
import { VersionProvider, useVersionContext } from "@/context/VersionContext";
import type { StoredSelectedChampionList } from "@/lib/storageSchema";
import { logger } from "@/lib/logger";
import { useTranslation } from "@/i18n";

type ChampionCooldownTab = "skills" | "stats";

const COOLDOWN_STORAGE_KEY = "cooldown_selected_champions";
const COOLDOWN_TABS_STORAGE_KEY = "cooldown_tabs";
const COOLDOWN_SELECTED_TAB_ID_STORAGE_KEY = "cooldown_selected_tab_id";

function isValidTab(tab: string | null): tab is ChampionCooldownTab {
  return tab === "skills" || tab === "stats";
}

interface ChampionCooldownPageProps {
  lang: string;
  championList: Champion[] | null;
  version: string;
  cdragonVersion: string | null;
  initialSelectedChampions: StoredSelectedChampionList | null;
  initialTabs: Tab[] | null;
  initialSelectedTabId: string | null;
}

function ChampionCooldownPageContent({
  lang,
  championList,
  version,
  cdragonVersion: initialCDragonVersion,
  initialSelectedChampions,
  initialTabs,
  initialSelectedTabId,
}: ChampionCooldownPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const deviceType = useDeviceType();
  const isMobile = deviceType === "mobile";
  
  // URL에서 현재 탭 파라미터 읽기
  const urlTabParam = useMemo(() => {
    const tabParam = searchParams.get("tab");
    return isValidTab(tabParam) ? tabParam : null;
  }, [searchParams]);
  
  // URL 쿼리 파라미터에서 초기 탭 읽기
  const getInitialTab = (): ChampionCooldownTab => {
    return urlTabParam || "skills";
  };
  
  const [activeTab, setActiveTab] = useState<ChampionCooldownTab>(getInitialTab);
  const lastUrlTabRef = useRef<string | null>(urlTabParam);
  const lastActiveTabRef = useRef<ChampionCooldownTab>(getInitialTab());
  
  // URL 파라미터 변경 시 activeTab 동기화 (브라우저 히스토리 네비게이션 대응)
  useEffect(() => {
    const urlTab = urlTabParam || "skills";
    const lastUrlTab = lastUrlTabRef.current || "skills";
    
    // URL이 실제로 변경되었을 때만 상태 업데이트 (우리가 설정한 변경이 아닌 경우)
    if (urlTab !== lastUrlTab && urlTab !== activeTab) {
      setActiveTab(urlTab);
      lastActiveTabRef.current = urlTab;
    }
    
    lastUrlTabRef.current = urlTabParam;
  }, [urlTabParam, activeTab]);
  
  // activeTab 변경 시 URL 업데이트
  useEffect(() => {
    const currentUrlTab = urlTabParam || "skills";
    const lastActiveTab = lastActiveTabRef.current;
    
    // activeTab이 실제로 변경되었고, URL과 다를 때만 업데이트
    if (activeTab !== lastActiveTab && currentUrlTab !== activeTab) {
      const newSearchParams = new URLSearchParams(searchParams);
      if (activeTab === "skills") {
        // 기본값이면 URL에서 제거
        newSearchParams.delete("tab");
      } else {
        newSearchParams.set("tab", activeTab);
      }
      setSearchParams(newSearchParams, { replace: true });
      lastUrlTabRef.current = activeTab === "skills" ? null : activeTab;
    }
    
    lastActiveTabRef.current = activeTab;
  }, [activeTab, urlTabParam, searchParams, setSearchParams]);
  
  const [showSelector, setShowSelector] = useState(false);
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
  const persistCooldownState = useCallback(() => {
    try {
      // 선택된 챔피언 목록 저장
      if (selectedChampions.length > 0) {
        const toStore: StoredSelectedChampionList = selectedChampions.map(({ id, key }) => ({
          id,
          key,
        }));
        setStorageWithVersion(COOLDOWN_STORAGE_KEY, JSON.stringify(toStore));
      } else {
        removeStorageWithVersion(COOLDOWN_STORAGE_KEY);
      }

      // 탭 배열 저장
      if (tabs.length > 0) {
        setStorageWithVersion(COOLDOWN_TABS_STORAGE_KEY, JSON.stringify(tabs));
      } else {
        removeStorageWithVersion(COOLDOWN_TABS_STORAGE_KEY);
      }

      // 선택된 탭 ID 저장
      if (selectedTabId) {
        setStorageWithVersion(COOLDOWN_SELECTED_TAB_ID_STORAGE_KEY, selectedTabId);
      } else {
        removeStorageWithVersion(COOLDOWN_SELECTED_TAB_ID_STORAGE_KEY);
      }
    } catch (error) {
      logger.error("Failed to persist cooldown state to storage:", error);
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
    removeStorageWithVersion(COOLDOWN_STORAGE_KEY);
    removeStorageWithVersion(COOLDOWN_TABS_STORAGE_KEY);
    removeStorageWithVersion(COOLDOWN_SELECTED_TAB_ID_STORAGE_KEY);
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

      {/* Tab navigation for skills / stats */}
      <div className="mt-3 md:mt-4">
        <div className="flex items-center justify-between gap-2 border-b border-border overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ChampionCooldownTab)} className="flex-1">
            <TabsList className="inline-flex h-auto items-center justify-start gap-2 bg-transparent p-0 border-0">
              <TabsTrigger
                value="skills"
                className="px-4 py-2 text-sm font-medium transition-colors border-b-2 border-transparent text-muted-foreground hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent rounded-none shadow-none"
              >
                {t.encyclopedia.tabs.skills}
              </TabsTrigger>
              <TabsTrigger
                value="stats"
                className="px-4 py-2 text-sm font-medium transition-colors border-b-2 border-transparent text-muted-foreground hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent rounded-none shadow-none"
              >
                {t.encyclopedia.tabs.stats}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={resetAll}
              className="flex items-center gap-1.5 shrink-0 text-muted-foreground hover:text-primary hover:bg-muted/30 border-0"
            >
              <RotateCcw className="h-3 w-3" />
              <span className="text-[10px]">{t.encyclopedia.reset}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Champion comparison */}
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
    </div>
  );
}

export default function ChampionCooldownPage(props: ChampionCooldownPageProps) {
  return (
    <VersionProvider 
      initialDDragonVersion={props.version}
      initialCDragonVersion={props.cdragonVersion}
    >
      <ChampionCooldownPageContent {...props} />
    </VersionProvider>
  );
}

