import { useState, useCallback, useMemo, useEffect } from "react";
import { Champion } from "@/types";
import { getChampionInfo } from "@/services/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Plus, Search, RotateCcw, X, Swords } from "lucide-react";
import ChampionComparison from "@/components/features/ChampionComparison";
import ChampionSelector from "@/components/features/ChampionSelector";
import { useDeviceType } from "@/hooks/useDeviceType";
import { CHAMP_ICON_URL } from "@/services/api";
import { useTranslation } from "@/i18n";

interface EncyclopediaPageProps {
  lang: string;
  championList: Champion[] | null;
  version: string;
}

interface ChampionWithInfo extends Champion {
  fullInfo?: Champion;
  isLoading?: boolean;
  skinIndex?: number;
}

interface Tab {
  mode: 'vs' | 'normal';
  champions: string[]; // 챔피언 ID 배열 (vs: 2명, normal: 1명)
  id: string; // 탭 고유 ID
}

const STORAGE_KEY = "encyclopedia_selected_champions";
const TABS_STORAGE_KEY = "encyclopedia_tabs"; // 탭 배열
const SELECTED_TAB_ID_STORAGE_KEY = "encyclopedia_selected_tab_id";

function EncyclopediaPage({ lang, championList, version }: EncyclopediaPageProps) {
  const { t } = useTranslation();
  const [selectedChampions, setSelectedChampions] = useState<ChampionWithInfo[]>([]);
  const [activeTab, setActiveTab] = useState<"stats" | "skills">("skills");
  const [showSelector, setShowSelector] = useState(false);
  const deviceType = useDeviceType();
  const isMobile = deviceType === "mobile";
  // 탭 관리: 모든 탭을 배열로 관리
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [selectedTabId, setSelectedTabId] = useState<string | null>(null);
  const [showVsSelector, setShowVsSelector] = useState(false);
  const [vsSelectorMode, setVsSelectorMode] = useState<{
    mode: 'select-second' | 'change-champion-a' | 'change-champion-b';
    tabId: string; // VS 모드를 시작하는 탭 ID
    championIndex?: number; // 변경할 챔피언 인덱스 (change 모드일 때만)
  } | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    // 버전이 없으면 스킵
    if (!version) {
      return;
    }

    try {
      // 탭 정보 복원
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

      // 선택된 탭 ID 복원
      const storedTabId = localStorage.getItem(SELECTED_TAB_ID_STORAGE_KEY);
      if (storedTabId) {
        setSelectedTabId(storedTabId);
      }

      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0 && championList) {
          // Restore champions by matching IDs with current language's championList
          // This ensures names are always in the current language
          const restoredChampions = parsed
            .map((cachedChampion: { id: string; key?: string }) => {
              // Find the champion in the current language's list
              const currentLangChampion = championList.find(
                (champ) => champ.id === cachedChampion.id || champ.key === cachedChampion.key
              );
              
              if (currentLangChampion) {
                return {
                  ...currentLangChampion,
                  isLoading: false,
                };
              }
              return null;
            })
            .filter((champ): champ is ChampionWithInfo => champ !== null);
          
          if (restoredChampions.length > 0) {
            setSelectedChampions(restoredChampions);

            // Reload full info for each champion
            restoredChampions.forEach((champion: ChampionWithInfo) => {
              if (champion.id) {
                setSelectedChampions((prev) =>
                  prev.map((c) =>
                    c.id === champion.id ? { ...c, isLoading: true } : c
                  )
                );
                getChampionInfo(version, lang, champion.id)
                  .then((fullInfo) => {
                    setSelectedChampions((prev) =>
                      prev.map((c) =>
                        c.id === champion.id
                          ? { ...c, fullInfo, isLoading: false }
                          : c
                      )
                    );
                  })
                  .catch((error) => {
                    console.error("Failed to load champion info:", error);
                    setSelectedChampions((prev) =>
                      prev.map((c) =>
                        c.id === champion.id ? { ...c, isLoading: false } : c
                      )
                    );
                  });
              }
            });
          }
        }
      }
    } catch (error) {
      console.error("Failed to load stored champions:", error);
    }
  }, [version, lang, championList]);

  // Save to localStorage whenever selectedChampions changes
  useEffect(() => {
    try {
      if (selectedChampions.length > 0) {
        // Store only essential data (without fullInfo and language-specific fields)
        // Language-specific fields (name, title) are not cached to avoid language mismatch
        const toStore = selectedChampions.map(({ fullInfo, isLoading, name, title, ...rest }) => ({
          ...rest,
          // Keep only ID and key for identification
          id: rest.id,
          key: rest.key,
        }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (error) {
      console.error("Failed to save champions to storage:", error);
    }
  }, [selectedChampions]);

  // Save tabs to localStorage whenever tabs changes
  useEffect(() => {
    try {
      if (tabs.length > 0) {
        localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(tabs));
      } else {
        localStorage.removeItem(TABS_STORAGE_KEY);
      }
    } catch (error) {
      console.error("Failed to save tabs to storage:", error);
    }
  }, [tabs]);

  // Save selected tab ID to localStorage
  useEffect(() => {
    try {
      if (selectedTabId) {
        localStorage.setItem(SELECTED_TAB_ID_STORAGE_KEY, selectedTabId);
      } else {
        localStorage.removeItem(SELECTED_TAB_ID_STORAGE_KEY);
      }
    } catch (error) {
      console.error("Failed to save selected tab ID to storage:", error);
    }
  }, [selectedTabId]);

  // 탭 ID 생성 헬퍼
  const generateTabId = useCallback(() => {
    return `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  const removeChampion = useCallback((championId: string) => {
    setSelectedChampions((prev) => {
      const filtered = prev.filter((c) => c.id !== championId);
      // 해당 챔피언을 포함하는 탭들 제거
      setTabs((prevTabs) => {
        const filteredTabs = prevTabs.filter((tab) => !tab.champions.includes(championId));
        // 선택된 탭이 삭제되면 첫 번째 탭 선택
        if (selectedTabId && !filteredTabs.find((t) => t.id === selectedTabId)) {
          setSelectedTabId(filteredTabs.length > 0 ? filteredTabs[0].id : null);
        }
        return filteredTabs;
      });
      return filtered;
    });
  }, [selectedTabId]);

  // 탭 삭제
  const removeTab = useCallback((tabId: string) => {
    setTabs((prev) => {
      const filtered = prev.filter((t) => t.id !== tabId);
      // 선택된 탭이 삭제되면 첫 번째 탭 선택
      if (selectedTabId === tabId) {
        setSelectedTabId(filtered.length > 0 ? filtered[0].id : null);
      }
      return filtered;
    });
  }, [selectedTabId]);

  const addChampion = useCallback(
    (champion: Champion) => {
      // 이미 선택된 챔피언이면 제거 (Set을 사용하여 O(1) 체크)
      setSelectedChampions((prev) => {
        // Set을 생성하여 빠른 체크
        const prevIds = new Set(prev.map((c) => c.id));
        if (prevIds.has(champion.id)) {
          // 챔피언 제거 시 해당 챔피언의 일반 탭도 제거
          setTabs((prevTabs) => prevTabs.filter((tab) => 
            !(tab.mode === 'normal' && tab.champions.length === 1 && tab.champions[0] === champion.id)
          ));
          return prev.filter((c) => c.id !== champion.id);
        }

        const newChampion: ChampionWithInfo = {
          ...champion,
          isLoading: true,
          skinIndex: 0,
        };
        
        // 일반 탭 생성
        const newTab: Tab = {
          mode: 'normal',
          champions: [champion.id],
          id: generateTabId(),
        };
        setTabs((prev) => [...prev, newTab]);
        // 새 탭 선택
        setSelectedTabId(newTab.id);
        
        // Load full champion info (비동기로 처리하여 UI 블로킹 방지)
        getChampionInfo(version, lang, champion.id)
          .then((fullInfo) => {
            setSelectedChampions((current) =>
              current.map((c) =>
                c.id === champion.id
                  ? { ...c, fullInfo, isLoading: false, skinIndex: 0 }
                  : c
              )
            );
          })
          .catch((error) => {
            console.error("Failed to load champion info:", error);
            setSelectedChampions((current) =>
              current.map((c) =>
                c.id === champion.id ? { ...c, isLoading: false } : c
              )
            );
          });
        
        return [...prev, newChampion];
      });
    },
    [version, lang, generateTabId]
  );

  const resetChampions = useCallback(() => {
    setSelectedChampions([]);
    setTabs([]);
    setSelectedTabId(null);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(TABS_STORAGE_KEY);
    localStorage.removeItem(SELECTED_TAB_ID_STORAGE_KEY);
  }, []);

  // Update champion names when championList changes (language change)
  useEffect(() => {
    if (championList && selectedChampions.length > 0) {
      setSelectedChampions((prev) =>
        prev.map((champion) => {
          const updatedChampion = championList.find(
            (champ) => champ.id === champion.id || champ.key === champion.key
          );
          if (updatedChampion) {
            // Update language-specific fields (name, title) while keeping other data
            return {
              ...champion,
              name: updatedChampion.name,
              title: updatedChampion.title,
            };
          }
          return champion;
        })
      );
    }
  }, [championList]);

  const championsWithFullInfo = useMemo(() => {
    return selectedChampions.filter((c) => c.fullInfo && !c.isLoading);
  }, [selectedChampions]);

  // 일반 탭에 있는 챔피언들만 필터링 (VS 모드 제외)
  const normalTabChampions = useMemo(() => {
    const vsChampionIds = new Set(
      tabs
        .filter((tab) => tab.mode === 'vs')
        .flatMap((tab) => tab.champions)
    );
    return selectedChampions.filter((c) => !vsChampionIds.has(c.id));
  }, [tabs, selectedChampions]);

  // 챔피언이 로드되면 기본 탭 선택 (탭이 없을 때만)
  useEffect(() => {
    if (!selectedTabId && tabs.length > 0) {
      setSelectedTabId(tabs[0].id);
    }
  }, [tabs, selectedTabId]);

  // VS 모드용 챔피언 선택 핸들러
  const handleVsChampionSelect = useCallback((champion: Champion) => {
    if (!vsSelectorMode) return;

    const { mode, tabId, championIndex } = vsSelectorMode;
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;

    if (mode === 'select-second') {
      // 기존 일반 탭을 VS 탭으로 변환 (기존 탭 삭제 후 VS 탭 생성)
      const newTab: Tab = {
        mode: 'vs',
        champions: [tab.champions[0], champion.id],
        id: generateTabId(),
      };
      setTabs((prev) => prev.filter((t) => t.id !== tabId).concat(newTab));
      setSelectedTabId(newTab.id);
      // 선택한 챔피언이 목록에 없으면 추가 (탭은 생성하지 않음)
      const exists = selectedChampions.some((c) => c.id === champion.id);
      if (!exists) {
        setSelectedChampions((prev) => {
          const newChampion: ChampionWithInfo = {
            ...champion,
            isLoading: true,
            skinIndex: 0,
          };
          getChampionInfo(version, lang, champion.id)
            .then((fullInfo) => {
              setSelectedChampions((current) =>
                current.map((c) =>
                  c.id === champion.id
                    ? { ...c, fullInfo, isLoading: false, skinIndex: 0 }
                    : c
                )
              );
            })
            .catch((error) => {
              console.error("Failed to load champion info:", error);
              setSelectedChampions((current) =>
                current.map((c) =>
                  c.id === champion.id ? { ...c, isLoading: false } : c
                )
              );
            });
          return [...prev, newChampion];
        });
      }
    } else if (mode === 'change-champion-a' && championIndex !== undefined) {
      // A 챔피언 변경
      setTabs((prev) => prev.map((t) => 
        t.id === tabId 
          ? { ...t, champions: [champion.id, t.champions[1]] }
          : t
      ));
      const exists = selectedChampions.some((c) => c.id === champion.id);
      if (!exists) {
        setSelectedChampions((prev) => {
          const newChampion: ChampionWithInfo = {
            ...champion,
            isLoading: true,
            skinIndex: 0,
          };
          getChampionInfo(version, lang, champion.id)
            .then((fullInfo) => {
              setSelectedChampions((current) =>
                current.map((c) =>
                  c.id === champion.id
                    ? { ...c, fullInfo, isLoading: false, skinIndex: 0 }
                    : c
                )
              );
            })
            .catch((error) => {
              console.error("Failed to load champion info:", error);
              setSelectedChampions((current) =>
                current.map((c) =>
                  c.id === champion.id ? { ...c, isLoading: false } : c
                )
              );
            });
          return [...prev, newChampion];
        });
      }
    } else if (mode === 'change-champion-b' && championIndex !== undefined) {
      // B 챔피언 변경
      setTabs((prev) => prev.map((t) => 
        t.id === tabId 
          ? { ...t, champions: [t.champions[0], champion.id] }
          : t
      ));
      const exists = selectedChampions.some((c) => c.id === champion.id);
      if (!exists) {
        setSelectedChampions((prev) => {
          const newChampion: ChampionWithInfo = {
            ...champion,
            isLoading: true,
            skinIndex: 0,
          };
          getChampionInfo(version, lang, champion.id)
            .then((fullInfo) => {
              setSelectedChampions((current) =>
                current.map((c) =>
                  c.id === champion.id
                    ? { ...c, fullInfo, isLoading: false, skinIndex: 0 }
                    : c
                )
              );
            })
            .catch((error) => {
              console.error("Failed to load champion info:", error);
              setSelectedChampions((current) =>
                current.map((c) =>
                  c.id === champion.id ? { ...c, isLoading: false } : c
                )
              );
            });
          return [...prev, newChampion];
        });
      }
    }

    setShowVsSelector(false);
    setVsSelectorMode(null);
  }, [vsSelectorMode, tabs, selectedChampions, version, lang, generateTabId]);

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
    
    // VS 탭이 선택되어 있으면 null 반환 (VS 레이아웃 사용)
    if (selectedTab && selectedTab.mode === 'vs') {
      return null;
    }
    
    // 일반 탭이 선택되어 있으면 해당 챔피언 반환
    if (selectedTab && selectedTab.mode === 'normal' && currentTabChampions.length > 0) {
      return currentTabChampions[0];
    }
    
    return null;
  }, [isMobile, selectedTab, currentTabChampions]);

  return (
    <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-5">

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
      {showVsSelector && vsSelectorMode && (() => {
        const tab = tabs.find((t) => t.id === vsSelectorMode.tabId);
        if (!tab) return null;
        
        // select-second 모드일 때는 일반 탭(normal)이어도 허용
        // change-champion-a, change-champion-b 모드일 때는 VS 탭이어야 함
        if (vsSelectorMode.mode !== 'select-second' && tab.mode !== 'vs') {
          return null;
        }
        
        // VS 모드에서 변경할 챔피언이 아닌, 기준이 되는 챔피언을 표시
        // change-champion-a: A를 바꾸는 것 → B가 기준 (champions[1])
        // change-champion-b: B를 바꾸는 것 → A가 기준 (champions[0])
        // select-second: 두 번째 챔피언 선택 → A가 기준 (champions[0])
        let currentChampionId: string;
        if (vsSelectorMode.mode === 'change-champion-a') {
          // A를 바꾸는 경우, B가 기준
          currentChampionId = tab.champions[1];
        } else {
          // B를 바꾸거나 두 번째를 선택하는 경우, A가 기준
          currentChampionId = tab.champions[0];
        }
        
        return currentChampionId ? (
          <ChampionSelector
            championList={championList}
            selectedChampions={selectedChampions}
            onSelect={handleVsChampionSelect}
            onClose={() => {
              setShowVsSelector(false);
              setVsSelectorMode(null);
            }}
            open={showVsSelector}
            onOpenChange={(open) => {
              setShowVsSelector(open);
              if (!open) {
                setVsSelectorMode(null);
              }
            }}
            vsMode={{
              currentChampionId,
              title: t.encyclopedia.selectOpponent,
            }}
          />
        ) : null;
      })()}

      {/* Comparison Sections */}
      {selectedChampions.length > 0 && championsWithFullInfo.length > 0 && (
            <div className="space-y-4 md:space-y-6">
              {/* Tab Navigation */}
              <div className="flex items-center justify-between gap-2 border-b border-border overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
                <Tabs 
                  value={activeTab} 
                  onValueChange={(value) => setActiveTab(value as "stats" | "skills")}
                  className="flex-1"
                >
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
                    onClick={resetChampions}
                    className="flex items-center gap-1.5 shrink-0 text-muted-foreground hover:text-primary hover:bg-muted/30 border-0"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span className="text-[10px]">{t.encyclopedia.reset}</span>
                  </Button>
                </div>
              </div>

              {/* Mobile: Champion Selection Tab */}
              {isMobile && tabs.length > 0 && (
                <div className="border-b border-border overflow-x-auto -mx-4 px-4">
                  <div className="flex items-center gap-2 pb-2">
                    <span className="text-xs font-medium text-muted-foreground shrink-0">{t.encyclopedia.champion}</span>
                    <div className="flex items-center gap-2 flex-1 overflow-x-auto">
                      {/* 모든 탭들 */}
                      {tabs.map((tab) => {
                        const isActive = selectedTabId === tab.id;
                        
                        if (tab.mode === 'vs') {
                          // VS 탭
                          const championA = championsWithFullInfo.find((c) => c.id === tab.champions[0]);
                          const championB = championsWithFullInfo.find((c) => c.id === tab.champions[1]);
                          if (!championA || !championB) return null;
                          
                          return (
                            <div
                              key={tab.id}
                              className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors shrink-0 relative",
                                isActive
                                  ? 'bg-primary text-primary-foreground' 
                                  : 'bg-muted/50 text-muted-foreground'
                              )}
                            >
                              <div className="flex items-center gap-1.5 flex-1">
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setVsSelectorMode({
                                      mode: 'change-champion-a',
                                      tabId: tab.id,
                                      championIndex: 0,
                                    });
                                    setShowVsSelector(true);
                                  }}
                                  className="flex items-center touch-manipulation hover:opacity-80 transition-opacity"
                                >
                                  <img
                                    src={CHAMP_ICON_URL(version, championA.id)}
                                    alt={championA.name}
                                    className="w-5 h-5 rounded-full"
                                  />
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedTabId(tab.id);
                                  }}
                                  className="text-[10px] font-semibold touch-manipulation"
                                >
                                  {t.encyclopedia.vs}
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setVsSelectorMode({
                                      mode: 'change-champion-b',
                                      tabId: tab.id,
                                      championIndex: 1,
                                    });
                                    setShowVsSelector(true);
                                  }}
                                  className="flex items-center touch-manipulation hover:opacity-80 transition-opacity"
                                >
                                  <img
                                    src={CHAMP_ICON_URL(version, championB.id)}
                                    alt={championB.name}
                                    className="w-5 h-5 rounded-full"
                                  />
                                </button>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  removeTab(tab.id);
                                }}
                                className="ml-1 p-0.5 rounded-full hover:bg-destructive/20 hover:text-destructive active:bg-destructive/30 transition-colors touch-manipulation"
                                aria-label="Remove VS tab"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          );
                        } else {
                          // 일반 탭
                          const champion = championsWithFullInfo.find((c) => c.id === tab.champions[0]);
                          if (!champion) return null;
                          
                          return (
                            <div
                              key={tab.id}
                              className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors shrink-0 relative",
                                isActive
                                  ? 'bg-primary text-primary-foreground' 
                                  : 'bg-muted/50 text-muted-foreground'
                              )}
                              onClick={(e) => {
                                // VS 버튼이나 X 버튼 클릭 시 무시
                                const target = e.target as HTMLElement;
                                // 버튼 자체를 클릭했거나, 버튼 내부 요소를 클릭한 경우 무시
                                if (target.tagName === 'BUTTON' || target.closest('button')) {
                                  return;
                                }
                                setSelectedTabId(tab.id);
                              }}
                            >
                              <div className="flex items-center gap-1.5 flex-1 touch-manipulation cursor-pointer">
                                <img
                                  src={CHAMP_ICON_URL(version, champion.id)}
                                  alt={champion.name}
                                  className="w-5 h-5 rounded-full pointer-events-none"
                                />
                                <span className="pointer-events-none">{champion.name}</span>
                              </div>
                              {/* VS 버튼 */}
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setVsSelectorMode({
                                    mode: 'select-second',
                                    tabId: tab.id,
                                  });
                                  setShowVsSelector(true);
                                }}
                                className="ml-1 p-1 rounded-full hover:bg-destructive/20 hover:text-destructive active:bg-destructive/30 transition-colors touch-manipulation shrink-0"
                                aria-label={`${t.encyclopedia.vs} with ${champion.name}`}
                                title={t.encyclopedia.vsStart}
                                type="button"
                              >
                                <Swords className="h-3 w-3 text-destructive" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  removeTab(tab.id);
                                }}
                                className="ml-1 p-0.5 rounded-full hover:bg-destructive/20 hover:text-destructive active:bg-destructive/30 transition-colors touch-manipulation shrink-0"
                                aria-label={`Remove ${champion.name}`}
                                type="button"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          );
                        }
                      })}
                      
                      {/* 추가 버튼 */}
                      <Button
                        onClick={() => setShowSelector(true)}
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-1.5 shrink-0 border-2 border-dashed border-muted-foreground/30 hover:border-primary hover:bg-primary/10 hover:text-primary h-auto py-1.5 px-3 transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        <span className="text-xs">{t.encyclopedia.add}</span>
                      </Button>
                    </div>
                  </div>
                </div>
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
                onRemoveChampion={removeChampion}
                vsMode={isMobile && selectedTab && selectedTab.mode === 'vs' && currentTabChampions.length === 2
                  ? { championA: currentTabChampions[0], championB: currentTabChampions[1] } 
                  : undefined}
              />
            </div>
          )}

      {/* Empty State */}
      {selectedChampions.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 md:py-16">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
              <Search className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold mb-2">{t.encyclopedia.emptyState.title}</h2>
            <p className="text-muted-foreground text-center max-w-md text-sm mb-4">
              {t.encyclopedia.emptyState.description}
            </p>
            <Button
              onClick={() => setShowSelector(true)}
              variant="outline"
              className="flex flex-row items-center justify-center gap-2 border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30 group"
            >
              <div className="w-8 h-8 rounded-full bg-muted/30 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                <Plus className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <span className="text-sm text-muted-foreground group-hover:text-primary transition-colors">
                {t.encyclopedia.emptyState.addButton}
              </span>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default EncyclopediaPage;
