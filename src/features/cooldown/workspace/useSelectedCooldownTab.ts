import { useMemo } from "react";
import type { Champion } from "@/domain/game/types";
import type { ChampionWithInfo } from "@/features/cooldown/workspace/types";
import type { ChampionTab } from "@/infrastructure/storage/contracts";

export function useSelectedCooldownTab(input: {
  tabs: readonly ChampionTab[];
  selectedTabId: string | null;
  champions: readonly ChampionWithInfo[];
}): Champion | null {
  return useMemo(() => {
    const championId = input.tabs.find((tab) => tab.id === input.selectedTabId)?.champions[0];
    return input.champions.find((champion) => champion.id === championId)?.fullInfo ?? null;
  }, [input.tabs, input.selectedTabId, input.champions]);
}
