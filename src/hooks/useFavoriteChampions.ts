import { useCallback, useEffect, useMemo, useState } from "react";
import {
  APP_STORAGE_KEYS,
  decodeFavoriteChampionIds,
  readJsonStorage,
  writeStorage,
} from "@/data/storage/appStorage";

const FAVORITES_CHANGE_EVENT = "cooldown:favorite-champions-change";

function readFavoriteChampionIds(): string[] {
  return readJsonStorage(
    APP_STORAGE_KEYS.favoriteChampionIds,
    decodeFavoriteChampionIds,
  ) ?? [];
}

export function useFavoriteChampions() {
  const [favoriteChampionIds, setFavoriteChampionIds] = useState(
    readFavoriteChampionIds,
  );

  useEffect(() => {
    const syncFavorites = (event: Event) => {
      if (event instanceof CustomEvent) {
        const ids = decodeFavoriteChampionIds(event.detail);
        if (ids) {
          setFavoriteChampionIds(ids);
          return;
        }
      }
      setFavoriteChampionIds(readFavoriteChampionIds());
    };
    const syncStorage = (event: StorageEvent) => {
      if (event.key === APP_STORAGE_KEYS.favoriteChampionIds) {
        setFavoriteChampionIds(readFavoriteChampionIds());
      }
    };

    window.addEventListener(FAVORITES_CHANGE_EVENT, syncFavorites);
    window.addEventListener("storage", syncStorage);
    return () => {
      window.removeEventListener(FAVORITES_CHANGE_EVENT, syncFavorites);
      window.removeEventListener("storage", syncStorage);
    };
  }, []);

  const toggleFavoriteChampion = useCallback((championId: string) => {
    const nextIds = favoriteChampionIds.includes(championId)
      ? favoriteChampionIds.filter((id) => id !== championId)
      : [...favoriteChampionIds, championId];

    writeStorage(
      APP_STORAGE_KEYS.favoriteChampionIds,
      JSON.stringify(nextIds),
    );
    setFavoriteChampionIds(nextIds);
    window.dispatchEvent(new CustomEvent(FAVORITES_CHANGE_EVENT, {
      detail: nextIds,
    }));
  }, [favoriteChampionIds]);

  const favoriteChampionIdSet = useMemo(
    () => new Set(favoriteChampionIds),
    [favoriteChampionIds],
  );

  return { favoriteChampionIdSet, toggleFavoriteChampion };
}
