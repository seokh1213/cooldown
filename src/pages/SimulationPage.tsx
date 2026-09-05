import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Language } from "@/i18n";
import { useTranslation } from "@/i18n";
import type { Champion } from "@/types";
import type { StaticDataSources } from "@/data/contracts/staticData";
import { recordProductMetric } from "@/lib/productMetrics";
import { copyTextToClipboard } from "@/lib/clipboard";
import { SimulationSkills } from "./SimulationSkills";
import { SimulationCombatPanel } from "./SimulationCombatPanel";
import { SimulationLoadout } from "./SimulationLoadout";
import { buildExternalActions } from "./simulationExternalActions";
import { useSimulationData } from "./useSimulationData";
import { SimulationWorkspaceToolbar } from "./SimulationWorkspaceToolbar";
import { SimulationSetupPanel } from "./SimulationSetupPanel";
import { SimulationSelectors } from "./SimulationSelectors";
import {
  DEFAULT_SKILL_RANKS,
  parseSimulationSearch,
  serializeSimulationState,
  type ActiveSkillSlot,
  type SkillRanks,
  type TargetDefenseState,
} from "./simulationState";

interface SimulationPageProps {
  lang: Language;
  patchVersion: string;
  ddragonVersion: string;
  sources: StaticDataSources;
  championList: Champion[] | null;
}

export default function SimulationPage({
  lang,
  patchVersion,
  ddragonVersion,
  sources,
  championList,
}: SimulationPageProps) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [initialSearch] = useState(() => searchParams.toString());
  const [initialState] = useState(() => parseSimulationSearch(initialSearch));
  const preserveInitialDefense = useRef(Boolean(initialState.defense));
  const preserveInitialRanks = useRef(new URLSearchParams(initialSearch).has("sr"));
  const simulation = useSimulationData({
    patchVersion,
    sources,
    lang,
    initialChampionId: initialState.attackerId,
    initialTargetChampionId: initialState.targetId,
    initialLevel: initialState.attackerLevel,
    initialTargetLevel: initialState.targetLevel,
    initialItemIds: initialState.itemIds,
  });
  const {
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
  } = simulation;
  const [isChampionModalOpen, setIsChampionModalOpen] = useState(false);
  const [isTargetModalOpen, setIsTargetModalOpen] = useState(false);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [activeItemSlotIndex, setActiveItemSlotIndex] = useState<number | null>(null);
  const [selectedSummonerIds, setSelectedSummonerIds] = useState<string[]>(
    () => [initialState.summonerIds?.[0] ?? "", initialState.summonerIds?.[1] ?? ""],
  );
  const [selectedRuneId, setSelectedRuneId] = useState(initialState.runeId ?? "");
  const [skillRanks, setSkillRanks] = useState<SkillRanks>(
    initialState.ranks ?? DEFAULT_SKILL_RANKS,
  );
  const [actionCounts, setActionCounts] = useState<Record<string, number>>(() => ({
    AA: 1,
    Q: 1,
    W: 0,
    E: 1,
    R: 1,
    ...initialState.counts,
  }));
  const [excludedActions, setExcludedActions] = useState<string[]>(initialState.excludedActions ?? []);
  const [defense, setDefense] = useState<TargetDefenseState>(initialState.defense ?? {
    health: 0,
    armor: 0,
    magicResist: 0,
    damageReductionPercent: 0,
  });
  const [shareStatus, setShareStatus] = useState<"idle" | "copied" | "failed">("idle");
  const lastSharedState = useRef("");
  const lastReadyMetric = useRef("");
  const metricContext = useMemo(() => ({ patch: patchVersion, locale: lang }), [lang, patchVersion]);

  const championOptions = useMemo(
    () => championList ?? [],
    [championList]
  );

  const externalActions = useMemo(() => buildExternalActions({
    summoners: availableSummoners,
    selectedSummonerIds,
    rune: availableRunes.find((rune) => rune.id === selectedRuneId) ?? null,
    items: selectedItems,
    attackerStats: finalStats,
    targetStats,
    level,
    ddragonVersion,
  }), [availableRunes, availableSummoners, ddragonVersion, finalStats, level, selectedItems, selectedRuneId, selectedSummonerIds, targetStats]);

  useEffect(() => {
    if (!championDetail) return;
    const shouldPreserveRanks = preserveInitialRanks.current;
    const maxRanks = Object.fromEntries(
      (["Q", "W", "E", "R"] as const).map((slot) => [slot, championDetail.champion.abilities[slot].maxRank]),
    ) as SkillRanks;
    setSkillRanks((current) => shouldPreserveRanks
      ? Object.fromEntries((Object.keys(maxRanks) as ActiveSkillSlot[]).map((slot) => [
          slot,
          Math.min(Math.max(current[slot], 0), maxRanks[slot]),
        ])) as SkillRanks
      : maxRanks);
    preserveInitialRanks.current = false;
    setActionCounts((current) => ({
      ...current,
      ...Object.fromEntries((["Q", "W", "E", "R"] as const).map((slot) => [
        slot,
        championDetail.champion.abilities[slot].simulation.status === "complete" ? (current[slot] ?? 1) : 0,
      ])),
    }));
  }, [championDetail]);

  useEffect(() => {
    if (!targetStats) return;
    if (preserveInitialDefense.current) {
      preserveInitialDefense.current = false;
      return;
    }
    setDefense({
      health: Math.round(targetStats.health),
      armor: Math.round(targetStats.armor),
      magicResist: Math.round(targetStats.magicResist),
      damageReductionPercent: 0,
    });
  }, [targetStats]);

  useEffect(() => {
    setActionCounts((current) => ({
      ...current,
      ...Object.fromEntries(externalActions.map((action) => [action.id, current[action.id] ?? 1])),
    }));
  }, [externalActions]);

  useEffect(() => {
    if (availableItems.length === 0) return;
    const validIds = new Set(availableItems.map((item) => item.id));
    setSelectedItemIds((current) => current.map((id) => id && validIds.has(id) ? id : null));
  }, [availableItems, setSelectedItemIds]);

  useEffect(() => {
    if (availableSummoners.length === 0) return;
    const validIds = new Set(availableSummoners.map((spell) => spell.id));
    setSelectedSummonerIds((current) => current.map((id) => validIds.has(id) ? id : ""));
  }, [availableSummoners]);

  useEffect(() => {
    if (availableRunes.length > 0 && !availableRunes.some((rune) => rune.id === selectedRuneId)) {
      setSelectedRuneId("");
    }
  }, [availableRunes, selectedRuneId]);

  useEffect(() => {
    if (initialState.attackerId || initialState.targetId) {
      recordProductMetric("simulation_restored", metricContext);
    }
  }, [initialState.attackerId, initialState.targetId, metricContext]);

  useEffect(() => {
    if (!championInfo || !targetChampionInfo) return;
    const readyKey = `${championInfo.id}:${targetChampionInfo.id}`;
    if (lastReadyMetric.current === readyKey) return;
    lastReadyMetric.current = readyKey;
    recordProductMetric("simulation_ready", metricContext);
  }, [championInfo, metricContext, targetChampionInfo]);

  const serializedState = useMemo(() => serializeSimulationState({
    patchVersion,
    attackerId: selectedChampionId,
    targetId: targetChampionId,
    attackerLevel: level,
    targetLevel,
    itemIds: selectedItemIds,
    summonerIds: selectedSummonerIds,
    runeId: selectedRuneId,
    ranks: skillRanks,
    counts: actionCounts,
    excludedActions,
    defense: targetChampionId ? defense : undefined,
  }), [actionCounts, defense, excludedActions, level, patchVersion, selectedChampionId, selectedItemIds, selectedRuneId, selectedSummonerIds, skillRanks, targetChampionId, targetLevel]);

  useEffect(() => {
    if (searchParams.toString() !== serializedState) {
      setSearchParams(serializedState, { replace: true });
    }
    if (lastSharedState.current && lastSharedState.current !== serializedState) {
      lastSharedState.current = "";
      setShareStatus("idle");
    }
  }, [searchParams, serializedState, setSearchParams]);

  const handleShare = useCallback(async () => {
    try {
      const url = `${window.location.origin}${window.location.pathname}?${serializedState}`;
      if (!await copyTextToClipboard(url)) throw new Error("clipboard unavailable");
      lastSharedState.current = serializedState;
      setShareStatus("copied");
      recordProductMetric("simulation_shared", metricContext);
    } catch {
      setShareStatus("failed");
    }
  }, [metricContext, serializedState]);

  const resetSimulation = useCallback(() => {
    setSelectedChampionId("");
    setTargetChampionId("");
    setLevel(18);
    setTargetLevel(18);
    setSelectedItemIds(Array(6).fill(null));
    setSelectedSummonerIds(["", ""]);
    setSelectedRuneId("");
    setSkillRanks(DEFAULT_SKILL_RANKS);
    setActionCounts({ AA: 1, Q: 1, W: 0, E: 1, R: 1 });
    setExcludedActions([]);
    setDefense({ health: 0, armor: 0, magicResist: 0, damageReductionPercent: 0 });
  }, [setLevel, setSelectedChampionId, setSelectedItemIds, setTargetChampionId, setTargetLevel]);

  return (
    <div className="w-full max-w-6xl mx-auto px-4 md:px-6 lg:px-8 py-8 md:py-10">
      <div className="mb-6">
        <h1 className="text-xl md:text-2xl font-semibold tracking-tight">
          {t.pages.simulation.title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t.pages.simulation.description}
        </p>
      </div>

      <SimulationWorkspaceToolbar
        patchVersion={patchVersion}
        restoredPatchVersion={initialState.patchVersion}
        shareStatus={shareStatus}
        supportedAbilities={championDetail ? (["Q", "W", "E", "R"] as const).filter(
          (slot) => championDetail.champion.abilities[slot].simulation.status === "complete",
        ).length : 0}
        conditionalActions={externalActions.filter((action) => action.conditions.length > 0).length}
        excludedActions={excludedActions.length}
        onShare={handleShare}
        onReset={resetSimulation}
        onLevelPreset={(presetLevel) => {
          setLevel(presetLevel);
          setTargetLevel(presetLevel);
        }}
        onHealthPreset={(percent) => {
          if (!targetStats) return;
          setDefense((current) => ({
            ...current,
            health: Math.round(targetStats.health * percent / 100),
          }));
        }}
      />

      <SimulationSetupPanel
        champion={championInfo}
        ddragonVersion={ddragonVersion}
        level={level}
        items={itemsBySlot}
        selectedItemCount={selectedItems.length}
        baseStats={baseStats}
        finalStats={finalStats}
        onSelectChampion={() => setIsChampionModalOpen(true)}
        onLevelChange={setLevel}
        onSelectItem={(slot) => {
          setActiveItemSlotIndex(slot);
          setIsItemModalOpen(true);
        }}
      />

      <SimulationSkills
        champion={championInfo}
        detail={championDetail}
        ddragonVersion={ddragonVersion}
        finalStats={finalStats}
        targetStats={targetStats}
        skillSummaries={skillSummaries}
        ranks={skillRanks}
        onRankChange={(slot, rank) => setSkillRanks((current) => ({ ...current, [slot]: rank }))}
      />

      <SimulationLoadout
        ddragonVersion={ddragonVersion}
        summoners={availableSummoners}
        selectedIds={selectedSummonerIds}
        runes={availableRunes}
        selectedRuneId={selectedRuneId}
        onSelectRune={setSelectedRuneId}
        onSelect={(slot, id) => setSelectedSummonerIds((current) => {
          const next = [...current];
          next[slot] = id;
          return next;
        })}
      />

      <SimulationCombatPanel
        attacker={championInfo}
        attackerDetail={championDetail}
        attackerStats={finalStats}
        target={targetChampionInfo}
        targetStats={targetStats}
        targetLevel={targetLevel}
        ddragonVersion={ddragonVersion}
        onOpenTargetSelector={() => setIsTargetModalOpen(true)}
        onTargetLevelChange={setTargetLevel}
        externalActions={externalActions}
        ranks={skillRanks}
        onRankChange={(slot, rank) => setSkillRanks((current) => ({ ...current, [slot]: rank }))}
        counts={actionCounts}
        onCountChange={(key, count) => setActionCounts((current) => ({ ...current, [key]: count }))}
        excludedActions={excludedActions}
        onToggleAction={(key) => {
          setExcludedActions((current) => current.includes(key)
            ? current.filter((value) => value !== key)
            : [...current, key]);
          recordProductMetric("condition_toggled", metricContext);
        }}
        defense={defense}
        onDefenseChange={(key, value) => setDefense((current) => ({ ...current, [key]: value }))}
      />

      <SimulationSelectors
        champions={championOptions}
        attacker={championInfo}
        target={targetChampionInfo}
        attackerOpen={isChampionModalOpen}
        targetOpen={isTargetModalOpen}
        itemOpen={isItemModalOpen}
        itemSlot={activeItemSlotIndex}
        selectedItemId={activeItemSlotIndex === null ? null : selectedItemIds[activeItemSlotIndex]}
        items={availableItems}
        ddragonVersion={ddragonVersion}
        onAttackerOpenChange={setIsChampionModalOpen}
        onTargetOpenChange={setIsTargetModalOpen}
        onSelectAttacker={(champion) => {
          setSelectedChampionId(champion.id);
          recordProductMetric("attacker_selected", metricContext);
        }}
        onSelectTarget={(champion) => {
          setTargetChampionId(champion.id);
          recordProductMetric("target_selected", metricContext);
        }}
        onItemOpenChange={(open) => {
          setIsItemModalOpen(open);
          if (!open) setActiveItemSlotIndex(null);
        }}
        onSelectItem={(itemId) => {
          if (activeItemSlotIndex === null) return;
          setSelectedItemIds((current) => {
            const next = [...current];
            next[activeItemSlotIndex] = itemId;
            return next;
          });
          setIsItemModalOpen(false);
          setActiveItemSlotIndex(null);
        }}
      />
    </div>
  );
}
