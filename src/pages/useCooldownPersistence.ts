import { useCallback } from "react";
import type { Champion } from "@/types";
import type { Tab } from "./EncyclopediaPage/types";
import type { StoredSelectedChampionList } from "@/lib/storageSchema";
import { removeStorage, writeStorage } from "@/data/storage/appStorage";
import { logger } from "@/lib/logger";

interface CooldownStorageKeys {
  selectedChampions: string;
  tabs: string;
  selectedTabId: string;
}

export function useCooldownPersistence(input: {
  champions: readonly Champion[];
  tabs: readonly Tab[];
  selectedTabId: string | null;
  keys: CooldownStorageKeys;
}) {
  const { champions, tabs, selectedTabId, keys } = input;
  const persist = useCallback(() => {
    try {
      if (champions.length > 0) {
        const storedChampions: StoredSelectedChampionList = champions.map(
          ({ id, key }) => ({ id, key }),
        );
        writeStorage(keys.selectedChampions, JSON.stringify(storedChampions));
      } else {
        removeStorage(keys.selectedChampions);
      }

      if (tabs.length > 0) {
        writeStorage(keys.tabs, JSON.stringify(tabs));
      } else {
        removeStorage(keys.tabs);
      }

      if (selectedTabId) {
        writeStorage(keys.selectedTabId, selectedTabId);
      } else {
        removeStorage(keys.selectedTabId);
      }
    } catch (error) {
      logger.error("Failed to persist cooldown state to storage:", error);
    }
  }, [champions, tabs, selectedTabId, keys]);

  const clear = useCallback(() => {
    removeStorage(keys.selectedChampions);
    removeStorage(keys.tabs);
    removeStorage(keys.selectedTabId);
  }, [keys]);

  return { persist, clear };
}
