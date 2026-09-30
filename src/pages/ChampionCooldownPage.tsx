import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();
  
  const [showSelector, setShowSelector] = useState(false);

  const {
    tabs,
    hasRestored: tabsRestored,
    selectedTabId,
    setSelectedTabId,
    removeTab,
    addTab,
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
    hasRestored: championsRestored,
    championsWithFullInfo,
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

  // 상태가 바뀌면 저장한다. 복원이 끝난 뒤에만 — 그 전에는 빈 목록이라 저장된 것을 지운다.
  //
  // 예전에는 선택 모달이 닫힐 때만 저장했다. 그 콜백은 닫히는 순간의 옛 상태를 들고 있어
  // 방금 추가한 챔피언이 빠졌고, X 로 지우거나 순서를 바꾼 것은 저장되지 않았다.
  // 배포 페이지에서 새로 고치면 처음 저장된 오공만 남던 원인이다.
  useEffect(() => {
    if (!championsRestored || !tabsRestored) return;
    persistCooldownState();
  }, [championsRestored, tabsRestored, persistCooldownState]);

  const sensors = useChampionDragSensors();

  // PC 버전 챔피언 순서 변경 핸들러
  const handleReorderChampions = useCallback((oldIndex: number, newIndex: number) => {
    setSelectedChampions((prev) => arrayMove(prev, oldIndex, newIndex));
  }, [setSelectedChampions]);

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

  // 선택창에서 이미 고른 챔피언을 다시 누르면 뺀다.
  const addChampion = useCallback(
    (champion: Champion) => {
      if (selectedChampions.some((c) => c.id === champion.id)) {
        handleRemoveChampion(champion.id);
        return;
      }

      // 새 챔피언 추가 - 먼저 챔피언을 추가하고, 그 다음 탭을 추가
      // 이렇게 하면 useChampionData의 useEffect가 실행되어도 문제가 없음
      addChampionToList(champion);

      const newTab: Tab = {
        mode: 'normal',
        champions: [champion.id],
        id: generateTabId(),
      };
      addTab(newTab);
    },
    [selectedChampions, handleRemoveChampion, addChampionToList, addTab, generateTabId]
  );

  const resetAll = useCallback(() => {
    resetChampionsData();
    resetTabs();
    clearCooldownState();
  }, [resetChampionsData, resetTabs, clearCooldownState]);

  const selectedChampion = useSelectedCooldownTab({
    tabs,
    selectedTabId,
    champions: championsWithFullInfo,
  });

  return (
    <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 pb-4 md:pb-5">
      {/* Champion Selector Modal */}
      {showSelector && (
        <ChampionSelector
          championList={championList}
          selectedChampions={selectedChampions}
          onSelect={addChampion}
          onClose={() => setShowSelector(false)}
          open={showSelector}
          onOpenChange={setShowSelector}
        />
      )}

      <CooldownPageToolbar
        activeTab={activeTab}
        onSelectTab={selectTab}
        onReset={resetAll}
        onCompare={selectedChampion ? () => {
          navigate(`/vs?${new URLSearchParams({ a: selectedChampion.id }).toString()}`);
        } : undefined}
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
              onAddClick={() => setShowSelector(true)}
            />
          )}

          {/* Comparison Content */}
          <ChampionComparison
            champions={
              isMobile && selectedChampion
                ? [selectedChampion]
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
