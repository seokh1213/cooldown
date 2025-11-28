import { useState, useCallback, useMemo, useEffect } from "react";
import { Champion } from "@/types";
import { getChampionInfo } from "@/services/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Search, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import ChampionComparison from "@/components/features/ChampionComparison";
import ChampionSelector from "@/components/features/ChampionSelector";

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
  const [activeTab, setActiveTab] = useState<"stats" | "skills">("stats");
  const [showSelector, setShowSelector] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
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

  const addChampion = useCallback(
    (champion: Champion) => {
      if (selectedChampions.some((c) => c.id === champion.id)) return;

      const newChampion: ChampionWithInfo = {
        ...champion,
        isLoading: true,
        skinIndex: 0,
      };
      setSelectedChampions((prev) => [...prev, newChampion]);
      setShowSelector(false);

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
    [selectedChampions, version, lang]
  );

  const removeChampion = useCallback((championId: string) => {
    setSelectedChampions((prev) => prev.filter((c) => c.id !== championId));
  }, []);

  const resetChampions = useCallback(() => {
    setSelectedChampions([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const championsWithFullInfo = useMemo(() => {
    return selectedChampions.filter((c) => c.fullInfo && !c.isLoading);
  }, [selectedChampions]);

  return (
    <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-5">
      {/* Header */}
      <div className="mb-4 md:mb-5">
        <h1 className="text-xl md:text-2xl font-bold mb-1">백과사전</h1>
        <p className="text-xs md:text-sm text-muted-foreground">
          챔피언을 선택하여 기본 스탯과 스킬 쿨타임을 비교해보세요.
        </p>
      </div>

      {/* Champion Selector Modal */}
      {showSelector && (
        <ChampionSelector
          championList={championList}
          selectedChampions={selectedChampions}
          onSelect={addChampion}
          onClose={() => setShowSelector(false)}
        />
      )}

      {/* Comparison Sections */}
      {selectedChampions.length > 0 && championsWithFullInfo.length > 0 && (
            <div className="space-y-4 md:space-y-6">
              {/* Tab Navigation */}
              <div className="flex items-center justify-between gap-2 border-b border-border overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
                <div className="flex gap-2">
                  <button
                    onClick={() => setActiveTab("stats")}
                    className={cn(
                      "px-4 py-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap",
                      activeTab === "stats"
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    기본 스탯
                  </button>
                  <button
                    onClick={() => setActiveTab("skills")}
                    className={cn(
                      "px-4 py-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap",
                      activeTab === "skills"
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    스킬 쿨타임
                  </button>
                </div>
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

              {/* Comparison Content */}
              <ChampionComparison
                champions={championsWithFullInfo.map((c) => c.fullInfo!)}
                version={version}
                activeTab={activeTab}
                championList={championList}
                onAddChampion={addChampion}
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
            <button
              onClick={() => setShowSelector(true)}
              className="flex flex-row items-center justify-center gap-2 px-4 py-2 rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30 transition-colors group"
            >
              <div className="w-8 h-8 rounded-full bg-muted/30 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                <Plus className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <span className="text-sm text-muted-foreground group-hover:text-primary transition-colors">
                챔피언 추가하기
              </span>
            </button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default EncyclopediaPage;
