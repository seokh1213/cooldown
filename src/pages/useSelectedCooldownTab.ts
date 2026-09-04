import { useMemo } from "react";
import type { Champion } from "@/types";
import type { ChampionWithInfo, Tab } from "./EncyclopediaPage/types";

export function useSelectedCooldownTab(input: {
  tabs: readonly Tab[];
  selectedTabId: string | null;
  champions: readonly ChampionWithInfo[];
  mobile: boolean;
}) {
  const selectedTab = useMemo(
    () => input.tabs.find((tab) => tab.id === input.selectedTabId) ?? null,
    [input.tabs, input.selectedTabId],
  );
  const currentChampions = useMemo(() => {
    if (!selectedTab) return [];
    return selectedTab.champions
      .map((championId) =>
        input.champions.find((champion) => champion.id === championId)?.fullInfo,
      )
      .filter((champion): champion is Champion => champion !== undefined);
  }, [selectedTab, input.champions]);
  const mobileChampion = useMemo(() => {
    if (!input.mobile || selectedTab?.mode !== "normal") return null;
    return currentChampions[0] ?? null;
  }, [input.mobile, selectedTab, currentChampions]);

  return { selectedTab, currentChampions, mobileChampion };
}
