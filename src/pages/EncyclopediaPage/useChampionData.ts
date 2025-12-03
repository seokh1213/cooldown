import { useState, useCallback, useEffect, useMemo } from "react";
import { Champion } from "@/types";
import { getChampionInfo } from "@/services/api";
import { ChampionWithInfo, Tab } from "./types";
import { STORAGE_KEY } from "./constants";
import { setStorageWithVersion, removeStorageWithVersion } from "@/lib/storageValidator";
import { logger } from "@/lib/logger";
import type { StoredSelectedChampion, StoredSelectedChampionList } from "@/lib/storageSchema";

interface UseChampionDataProps {
  version: string | null;
  lang: string;
  championList: Champion[] | null;
  tabs: Tab[];
  initialSelectedChampions: StoredSelectedChampionList | null;
}

export function useChampionData({
  version,
  lang,
  championList,
  tabs,
  initialSelectedChampions,
}: UseChampionDataProps) {
  const [selectedChampions, setSelectedChampions] = useState<ChampionWithInfo[]>([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // 초기 선택 챔피언은 상위(App)에서 splash 시점에 한 번만 복원된 값을 사용
  useEffect(() => {
    if (!version || !championList) {
      setTimeout(() => {
        setIsInitialLoad(false);
      }, 0);
      return;
    }

    try {
      if (initialSelectedChampions && initialSelectedChampions.length > 0) {
        const restoredChampions = (initialSelectedChampions as StoredSelectedChampion[])
          .map((cachedChampion) => {
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
          .filter((champ): champ is NonNullable<typeof champ> => champ !== null);

        if (restoredChampions.length > 0) {
          // 비동기로 처리하여 React Compiler 경고 방지
          setTimeout(() => {
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
                    logger.error("Failed to load champion info:", error);
                    setSelectedChampions((prev) =>
                      prev.map((c) =>
                        c.id === champion.id ? { ...c, isLoading: false } : c
                      )
                    );
                  });
              }
            });
          }, 0);
        }
      }
      // 초기 로딩 완료 표시 (비동기로 처리하여 React Compiler 경고 방지)
      setTimeout(() => {
        setIsInitialLoad(false);
      }, 0);
    } catch (error) {
      logger.error("Failed to load initial selected champions:", error);
      setTimeout(() => {
        setIsInitialLoad(false);
      }, 0);
    }
  }, [version, lang, championList, initialSelectedChampions]);

  // Save to localStorage whenever selectedChampions changes
  useEffect(() => {
    try {
      if (selectedChampions.length > 0) {
        const toStore: StoredSelectedChampionList = selectedChampions.map(({ id, key }) => ({
          id,
          key,
        }));
        setStorageWithVersion(STORAGE_KEY, JSON.stringify(toStore));
      } else {
        removeStorageWithVersion(STORAGE_KEY);
      }
    } catch (error) {
      logger.error("Failed to save champions to storage:", error);
    }
  }, [selectedChampions]);

  // Update champion names when championList changes (language change)
  useEffect(() => {
    if (championList && selectedChampions.length > 0) {
      // 비동기로 처리하여 React Compiler 경고 방지
      setTimeout(() => {
        setSelectedChampions((prev) =>
          prev.map((champion) => {
            const updatedChampion = championList.find(
              (champ) => champ.id === champion.id || champ.key === champion.key
            );
            if (updatedChampion) {
              return {
                ...champion,
                name: updatedChampion.name,
                title: updatedChampion.title,
              };
            }
            return champion;
          })
        );
      }, 0);
    }
  }, [championList, selectedChampions.length]);

  // Remove champions that are not used in any tab
  // 탭이 모두 삭제되면 챔피언도 모두 삭제되어야 함
  // 단, 초기 로딩 중에는 실행하지 않음 (localStorage 복원 중일 수 있음)
  useEffect(() => {
    // 초기 로딩 중이면 스킵
    if (isInitialLoad) return;
    
    // 비동기로 처리하여 React Compiler 경고 방지
    setTimeout(() => {
      const usedChampionIds = new Set(tabs.flatMap((tab) => tab.champions));
      setSelectedChampions((prev) => {
        // 탭이 없으면 모든 챔피언 삭제
        if (tabs.length === 0) {
          return prev.length > 0 ? [] : prev;
        }
        
        // 사용되지 않는 챔피언 필터링
        const filtered = prev.filter((c) => usedChampionIds.has(c.id));
        // 실제로 필터링이 발생한 경우에만 업데이트
        if (filtered.length !== prev.length) {
          return filtered;
        }
        return prev;
      });
    }, 0);
  }, [tabs, isInitialLoad]);

  const loadChampionInfo = useCallback(
    (championId: string) => {
      if (!version) return;

      setSelectedChampions((prev) =>
        prev.map((c) => (c.id === championId ? { ...c, isLoading: true } : c))
      );

      getChampionInfo(version, lang, championId)
        .then((fullInfo) => {
          setSelectedChampions((current) =>
            current.map((c) =>
              c.id === championId
                ? { ...c, fullInfo, isLoading: false, skinIndex: 0 }
                : c
            )
          );
        })
        .catch((error) => {
          logger.error("Failed to load champion info:", error);
          setSelectedChampions((current) =>
            current.map((c) => (c.id === championId ? { ...c, isLoading: false } : c))
          );
        });
    },
    [version, lang]
  );

  const addChampionToList = useCallback((champion: Champion) => {
    // 이미 존재하는 챔피언인지 확인
    setSelectedChampions((prev) => {
      const exists = prev.some((c) => c.id === champion.id);
      if (exists) {
        return prev;
      }
      const newChampion: ChampionWithInfo = {
        ...champion,
        isLoading: true,
        skinIndex: 0,
      };
      // 비동기로 챔피언 정보 로드
      loadChampionInfo(champion.id);
      return [...prev, newChampion];
    });
  }, [loadChampionInfo]);

  const removeChampion = useCallback((championId: string) => {
    setSelectedChampions((prev) => prev.filter((c) => c.id !== championId));
  }, []);

  const resetChampions = useCallback(() => {
    setSelectedChampions([]);
    removeStorageWithVersion(STORAGE_KEY);
  }, []);

  const championsWithFullInfo = useMemo(() => {
    return selectedChampions.filter((c) => c.fullInfo && !c.isLoading);
  }, [selectedChampions]);

  // 일반 탭에 있는 챔피언들만 필터링 (VS 모드 제외)
  const normalTabChampions = useMemo(() => {
    const normalTabChampionIds = new Set(
      tabs
        .filter((tab) => tab.mode === 'normal')
        .flatMap((tab) => tab.champions)
    );
    return selectedChampions.filter((c) => normalTabChampionIds.has(c.id));
  }, [tabs, selectedChampions]);

  return {
    selectedChampions,
    setSelectedChampions,
    championsWithFullInfo,
    normalTabChampions,
    addChampionToList,
    removeChampion,
    resetChampions,
    loadChampionInfo,
  };
}

