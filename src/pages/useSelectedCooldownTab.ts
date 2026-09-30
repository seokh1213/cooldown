import { useMemo } from "react";
import type { Champion } from "@/types";
import type { ChampionWithInfo, Tab } from "./EncyclopediaPage/types";

export function useSelectedCooldownTab(input: {
  tabs: readonly Tab[];
  selectedTabId: string | null;
  champions: readonly ChampionWithInfo[];
}): Champion | null {
  return useMemo(() => {
    const championId = input.tabs.find((tab) => tab.id === input.selectedTabId)?.champions[0];
    return input.champions.find((champion) => champion.id === championId)?.fullInfo ?? null;
  }, [input.tabs, input.selectedTabId, input.champions]);
}
