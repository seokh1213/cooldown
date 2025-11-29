import { useState, useCallback, useMemo, useEffect } from "react";
import { Champion } from "@/types";
import { getChampionInfo } from "@/services/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Plus, Search, RotateCcw, X } from "lucide-react";
import ChampionComparison from "@/components/features/ChampionComparison";
import ChampionSelector from "@/components/features/ChampionSelector";
import { useDeviceType } from "@/hooks/useDeviceType";
import { CHAMP_ICON_URL } from "@/services/api";

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

const STORAGE_KEY = "encyclopedia_selected_champions";

function EncyclopediaPage({ lang, championList, version }: EncyclopediaPageProps) {
  const [selectedChampions, setSelectedChampions] = useState<ChampionWithInfo[]>([]);
  const [activeTab, setActiveTab] = useState<"stats" | "skills">("skills");
  const [showSelector, setShowSelector] = useState(false);
  const deviceType = useDeviceType();
  const isMobile = deviceType === "mobile";
  const [selectedChampionIndex, setSelectedChampionIndex] = useState(0);

  // Load from localStorage on mount
  useEffect(() => {
    // 버전이 없으면 스킵
    if (!version) {
      return;
    }

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Restore champions (without fullInfo)
          const restoredChampions = parsed.map((champion: Champion) => ({
            ...champion,
            isLoading: false,
          }));
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
    } catch (error) {
      console.error("Failed to load stored champions:", error);
    }
  }, [version, lang]);

  // Save to localStorage whenever selectedChampions changes
  useEffect(() => {
    try {
      if (selectedChampions.length > 0) {
        // Store only essential data (without fullInfo to avoid large storage)
        const toStore = selectedChampions.map(({ fullInfo, isLoading, ...rest }) => rest);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (error) {
      console.error("Failed to save champions to storage:", error);
    }
  }, [selectedChampions]);

  const removeChampion = useCallback((championId: string) => {
    setSelectedChampions((prev) => prev.filter((c) => c.id !== championId));
  }, []);

  const addChampion = useCallback(
    (champion: Champion) => {
      // 이미 선택된 챔피언이면 제거
      if (selectedChampions.some((c) => c.id === champion.id)) {
        removeChampion(champion.id);
        return;
      }

      const newChampion: ChampionWithInfo = {
        ...champion,
        isLoading: true,
        skinIndex: 0,
      };
      setSelectedChampions((prev) => [...prev, newChampion]);
      // 모달을 닫지 않고 계속 열어둠 (여러 명 선택 가능하도록)

      // Load full champion info
      getChampionInfo(version, lang, champion.id)
        .then((fullInfo) => {
          setSelectedChampions((prev) =>
            prev.map((c) =>
              c.id === champion.id
                ? { ...c, fullInfo, isLoading: false, skinIndex: 0 }
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
    },
    [selectedChampions, version, lang, removeChampion]
  );

  const resetChampions = useCallback(() => {
    setSelectedChampions([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const championsWithFullInfo = useMemo(() => {
    return selectedChampions.filter((c) => c.fullInfo && !c.isLoading);
  }, [selectedChampions]);

  // 모바일에서 보여줄 챔피언 (한 명씩)
  const mobileChampion = useMemo(() => {
    if (!isMobile || championsWithFullInfo.length === 0) return null;
    const index = Math.min(selectedChampionIndex, championsWithFullInfo.length - 1);
    return championsWithFullInfo[index]?.fullInfo || null;
  }, [isMobile, championsWithFullInfo, selectedChampionIndex]);

  // 챔피언이 변경되면 인덱스 조정
  useEffect(() => {
    if (isMobile && championsWithFullInfo.length > 0) {
      const maxIndex = championsWithFullInfo.length - 1;
      if (selectedChampionIndex > maxIndex) {
        setSelectedChampionIndex(maxIndex);
      }
    }
  }, [isMobile, championsWithFullInfo.length, selectedChampionIndex]);

  return (
    <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-5">

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
                      스킬 쿨타임
                    </TabsTrigger>
                    <TabsTrigger 
                      value="stats" 
                      className="px-4 py-2 text-sm font-medium transition-colors border-b-2 border-transparent text-muted-foreground hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent rounded-none shadow-none"
                    >
                      기본 스탯
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetChampions}
                  className="flex items-center gap-1.5 shrink-0 text-muted-foreground hover:text-primary hover:bg-muted/30 border-0"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span className="text-[10px]">초기화</span>
                </Button>
              </div>

              {/* Mobile: Champion Selection Tab */}
              {isMobile && championsWithFullInfo.length > 0 && (
                <div className="border-b border-border overflow-x-auto -mx-4 px-4">
                  <div className="flex items-center gap-2 pb-2">
                    <span className="text-xs font-medium text-muted-foreground shrink-0">챔피언</span>
                    <div className="flex items-center gap-2 flex-1 overflow-x-auto">
                      {championsWithFullInfo.map((champion, idx) => (
                        <div
                          key={champion.id}
                          className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors shrink-0 relative",
                            selectedChampionIndex === idx 
                              ? 'bg-primary text-primary-foreground' 
                              : 'bg-muted/50 text-muted-foreground'
                          )}
                        >
                          <button
                            onClick={() => setSelectedChampionIndex(idx)}
                            onTouchStart={(e) => {
                              e.stopPropagation();
                              setSelectedChampionIndex(idx);
                            }}
                            className="flex items-center gap-1.5 flex-1 touch-manipulation"
                          >
                            <img
                              src={CHAMP_ICON_URL(version, champion.id)}
                              alt={champion.name}
                              className="w-5 h-5 rounded-full"
                            />
                            <span>{champion.name}</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              removeChampion(champion.id);
                              if (selectedChampionIndex >= championsWithFullInfo.length - 1 && selectedChampionIndex > 0) {
                                setSelectedChampionIndex(selectedChampionIndex - 1);
                              }
                            }}
                            onTouchStart={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              removeChampion(champion.id);
                              if (selectedChampionIndex >= championsWithFullInfo.length - 1 && selectedChampionIndex > 0) {
                                setSelectedChampionIndex(selectedChampionIndex - 1);
                              }
                            }}
                            className="ml-1 p-0.5 rounded-full hover:bg-destructive/20 hover:text-destructive active:bg-destructive/30 transition-colors touch-manipulation"
                            aria-label={`Remove ${champion.name}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      <Button
                        onClick={() => setShowSelector(true)}
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-1.5 shrink-0 border-2 border-dashed border-muted-foreground/30 hover:border-primary hover:bg-primary/10 hover:text-primary h-auto py-1.5 px-3 transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        <span className="text-xs">추가</span>
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Comparison Content */}
              <ChampionComparison
                champions={isMobile && mobileChampion ? [mobileChampion] : championsWithFullInfo.map((c) => c.fullInfo!)}
                version={version}
                activeTab={activeTab}
                championList={championList}
                onAddChampion={isMobile ? undefined : addChampion}
                onRemoveChampion={removeChampion}
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
            <h2 className="text-xl font-semibold mb-2">챔피언을 선택하세요</h2>
            <p className="text-muted-foreground text-center max-w-md text-sm mb-4">
              아래 버튼을 클릭하여 챔피언을 추가하고 비교해보세요.
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
                챔피언 추가하기
              </span>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default EncyclopediaPage;
