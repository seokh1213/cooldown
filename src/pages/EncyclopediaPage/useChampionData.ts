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
  storageKey: string; // localStorage 키 추가
}

export function useChampionData({
  version,
  lang,
  championList,
  tabs,
  initialSelectedChampions,
  storageKey,
}: UseChampionDataProps) {
  const [selectedChampions, setSelectedChampions] = useState<ChampionWithInfo[]>([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [hasRestored, setHasRestored] = useState(false);

  // 컴포넌트가 마운트될 때마다 localStorage에서 직접 읽어오기
  useEffect(() => {
    if (!version || !championList || hasRestored) {
      if (!hasRestored && (!version || !championList)) {
        setTimeout(() => {
          setIsInitialLoad(false);
        }, 0);
      }
      return;
    }

    try {
      // localStorage에서 직접 읽기
      const storedSelected = localStorage.getItem(storageKey);
      let championsToRestore: StoredSelectedChampionList | null = null;
      
      if (storedSelected) {
        const parsed = JSON.parse(storedSelected);
        if (Array.isArray(parsed)) {
          championsToRestore = parsed as StoredSelectedChampionList;
        }
      }
      
      // localStorage에 없으면 initialSelectedChampions 사용 (초기 로드 시)
      if (!championsToRestore && initialSelectedChampions && initialSelectedChampions.length > 0) {
        championsToRestore = initialSelectedChampions;
      }

      if (championsToRestore && championsToRestore.length > 0) {
        const restoredChampions = (championsToRestore as StoredSelectedChampion[])
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
            setHasRestored(true);

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
        } else {
          setHasRestored(true);
        }
      } else {
        setHasRestored(true);
      }
      
      // 초기 로딩 완료 표시 (비동기로 처리하여 React Compiler 경고 방지)
      setTimeout(() => {
        setIsInitialLoad(false);
      }, 0);
    } catch (error) {
      logger.error("Failed to load initial selected champions:", error);
      setTimeout(() => {
        setIsInitialLoad(false);
        setHasRestored(true);
      }, 0);
    }
  }, [version, lang, championList, storageKey, hasRestored, initialSelectedChampions]);

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
    removeStorageWithVersion(storageKey);
  }, [storageKey]);

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

