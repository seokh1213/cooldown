import { useEffect, useMemo, useState } from "react";
import type { Language } from "@/i18n";
import type {
  NormalizedItem,
  NormalizedRune,
  NormalizedSummonerSpell,
} from "@/types/combatNormalized";
import type { StaticDataSources } from "@/data/contracts/staticData";
import type { ChampionDetailV2 } from "@/data/contracts/championData";
import { toChampion } from "@/data/mappers/championMapper";
import {
  getNormalizedItems,
  getNormalizedRunes,
  getNormalizedSummonerSpells,
} from "@/data/queries/gameDataQueries";
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

interface ChampionDataInput {
  patchVersion: string;
  sources: StaticDataSources;
  lang: Language;
}

function useChampionData(input: ChampionDataInput, championId: string) {
  const [detail, setDetail] = useState<ChampionDetailV2 | null>(null);
  useEffect(() => {
    if (!championId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    championRepository
      .getDetail({ patchVersion: input.patchVersion, sources: input.sources }, input.lang, championId)
      .then((nextDetail) => {
        if (!cancelled) setDetail(nextDetail);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [championId, input.lang, input.patchVersion, input.sources]);
  const champion = useMemo(() => detail ? toChampion(detail) : null, [detail]);
  return { champion, detail };
}

export function useSimulationData(input: {
  patchVersion: string;
  sources: StaticDataSources;
  lang: Language;
}) {
  const { patchVersion, sources, lang } = input;
  const [selectedChampionId, setSelectedChampionId] = useState("");
  const [targetChampionId, setTargetChampionId] = useState("");
  const { champion: championInfo, detail: championDetail } = useChampionData(
    input,
    selectedChampionId,
  );
  const { champion: targetChampionInfo } = useChampionData(input, targetChampionId);
  const [level, setLevel] = useState(18);
  const [targetLevel, setTargetLevel] = useState(18);
  const [availableItems, setAvailableItems] = useState<NormalizedItem[]>([]);
  const [availableSummoners, setAvailableSummoners] = useState<NormalizedSummonerSpell[]>([]);
  const [availableRunes, setAvailableRunes] = useState<NormalizedRune[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<(string | null)[]>(
    () => Array(6).fill(null),
  );

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

  useEffect(() => {
    let cancelled = false;
    getNormalizedRunes({ patchVersion, sources }, lang)
      .then((runes) => {
        if (!cancelled) {
          setAvailableRunes(runes.filter((rune) => rune.damageEffects.length > 0));
        }
      })
      .catch(() => {
        if (!cancelled) setAvailableRunes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [patchVersion, sources, lang]);

  useEffect(() => {
    let cancelled = false;
    getNormalizedSummonerSpells({ patchVersion, sources }, lang)
      .then((spells) => {
        if (!cancelled) {
          setAvailableSummoners(spells.filter((spell) => spell.modes.includes("CLASSIC")));
        }
      })
      .catch(() => {
        if (!cancelled) setAvailableSummoners([]);
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
  const targetStats = useMemo(
    () => targetChampionInfo
      ? computeChampionStatsAtLevel(targetChampionInfo, targetLevel)
      : null,
    [targetChampionInfo, targetLevel],
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
    targetChampionId,
    setTargetChampionId,
    championInfo,
    championDetail,
    targetChampionInfo,
    level,
    setLevel,
    targetLevel,
    setTargetLevel,
    availableItems,
    availableSummoners,
    availableRunes,
    selectedItemIds,
    setSelectedItemIds,
    itemsBySlot,
    selectedItems,
    baseStats,
    finalStats,
    targetStats,
    skillSummaries,
  };
}
