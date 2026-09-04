import { useEffect, useMemo, useState } from "react";
import type { Language } from "@/i18n";
import type { Champion } from "@/types";
import type { NormalizedItem } from "@/types/combatNormalized";
import type { StaticDataSources } from "@/data/contracts/staticData";
import type { ChampionDetailV2 } from "@/data/contracts/championData";
import { toChampion } from "@/data/mappers/championMapper";
import { getNormalizedItems } from "@/data/queries/gameDataQueries";
import { championRepository } from "@/data/repositories/championRepository";
import {
  applyNormalizedItemsToStats,
  computeAbilityHasteFromNormalizedItems,
  computeChampionStatsAtLevel,
  computeSkillSummaries,
} from "./SimulationPage.damageUtils";

function availableInSimulation(item: NormalizedItem): boolean {
  const tags = item.tags || [];
  const freeItem = tags.includes("Trinket") || tags.includes("Consumable");
  if (!freeItem && (item.priceTotal ?? 0) <= 0) return false;
  return item.purchasable !== false &&
    item.inStore !== false &&
    item.displayInItemSets !== false;
}

export function useSimulationData(input: {
  patchVersion: string;
  sources: StaticDataSources;
  lang: Language;
}) {
  const { patchVersion, sources, lang } = input;
  const [selectedChampionId, setSelectedChampionId] = useState("");
  const [championInfo, setChampionInfo] = useState<Champion | null>(null);
  const [championDetail, setChampionDetail] = useState<ChampionDetailV2 | null>(null);
  const [level, setLevel] = useState(18);
  const [availableItems, setAvailableItems] = useState<NormalizedItem[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<(string | null)[]>(
    () => Array(6).fill(null),
  );

  useEffect(() => {
    if (!selectedChampionId) {
      setChampionInfo(null);
      setChampionDetail(null);
      return;
    }
    let cancelled = false;
    championRepository
      .getDetail({ patchVersion, sources }, lang, selectedChampionId)
      .then((detail) => {
        if (cancelled) return;
        setChampionDetail(detail);
        setChampionInfo(toChampion(detail));
      })
      .catch(() => {
        if (!cancelled) {
          setChampionInfo(null);
          setChampionDetail(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [patchVersion, sources, lang, selectedChampionId]);

  useEffect(() => {
    let cancelled = false;
    getNormalizedItems({ patchVersion, sources }, lang)
      .then((items) => {
        if (!cancelled) setAvailableItems(items.filter(availableInSimulation));
      })
      .catch(() => {
        if (!cancelled) setAvailableItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [patchVersion, sources, lang]);

  const itemsBySlot = useMemo(
    () => selectedItemIds.map((id) =>
      id ? availableItems.find((item) => item.id === id) ?? null : null),
    [availableItems, selectedItemIds],
  );
  const selectedItems = useMemo(
    () => itemsBySlot.filter((item): item is NormalizedItem => item !== null),
    [itemsBySlot],
  );
  const baseStats = useMemo(
    () => championInfo ? computeChampionStatsAtLevel(championInfo, level) : null,
    [championInfo, level],
  );
  const finalStats = useMemo(
    () => baseStats ? applyNormalizedItemsToStats(baseStats, selectedItems) : null,
    [baseStats, selectedItems],
  );
  const abilityHaste = useMemo(
    () => computeAbilityHasteFromNormalizedItems(selectedItems),
    [selectedItems],
  );
  const skillSummaries = useMemo(
    () => championInfo ? computeSkillSummaries(championInfo, abilityHaste) : [],
    [championInfo, abilityHaste],
  );

  return {
    selectedChampionId,
    setSelectedChampionId,
    championInfo,
    championDetail,
    level,
    setLevel,
    availableItems,
    selectedItemIds,
    setSelectedItemIds,
    itemsBySlot,
    selectedItems,
    baseStats,
    finalStats,
    skillSummaries,
  };
}
