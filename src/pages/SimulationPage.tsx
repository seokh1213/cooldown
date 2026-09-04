import { useMemo, useState } from "react";
import type { Language } from "@/i18n";
import { useTranslation } from "@/i18n";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { championIconUrl, itemIconUrl } from "@/data/assets/riotAssetUrls";
import type { Champion } from "@/types";
import type { StaticDataSources } from "@/data/contracts/staticData";
import ChampionSelector from "@/components/features/ChampionSelector";
import { SimulationItemPicker } from "./SimulationItemPicker";
import { SimulationSkills } from "./SimulationSkills";
import { SimulationCombatPanel } from "./SimulationCombatPanel";
import { useSimulationData } from "./useSimulationData";

interface StatRowProps {
  label: string;
  value: number;
  base: number;
  precision?: number;
}

function StatRow({ label, value, base, precision = 0 }: StatRowProps) {
  const display = (n: number) =>
    precision > 0 ? n.toFixed(precision) : Math.round(n).toString();
  const delta = value - base;
  const hasDelta = Math.abs(delta) > 0.01;
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-[11px] font-medium">
        {display(value)}
        {hasDelta && (
          <span
            className={`ml-1 ${
              delta >= 0 ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            ({delta >= 0 ? "+" : ""}
            {display(delta)})
          </span>
        )}
      </span>
    </div>
  );
}

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
  const simulation = useSimulationData({ patchVersion, sources, lang });
  const {
    setSelectedChampionId,
    setTargetChampionId,
    championInfo,
    championDetail,
    targetChampionInfo,
    level,
    setLevel,
    targetLevel,
    setTargetLevel,
    availableItems,
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

  const championOptions = useMemo(
    () => championList ?? [],
    [championList]
  );

  const aaDps = useMemo(() => {
    if (!finalStats) return null;
    return finalStats.attackDamage * finalStats.attackSpeed;
  }, [finalStats]);

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

      {/* 상단: 챔피언 + 스탯 / 아이템 빌드 영역 */}
      <Card className="p-4 md:p-6 bg-card/60 border-border/70 space-y-6">
        <div className="grid gap-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.3fr)]">
          {/* 좌측: 챔피언 초상화 + 스탯 */}
          <div className="flex flex-col md:flex-row md:items-start gap-4 md:gap-6">
            <button
              type="button"
              onClick={() => setIsChampionModalOpen(true)}
              aria-label={t.pages.simulation.selectChampionAria}
              className="relative mx-auto md:mx-0 w-32 h-32 sm:w-36 sm:h-36 rounded-full border-4 border-border/80 bg-linear-to-br from-slate-800 via-slate-900 to-slate-700 flex items-center justify-center overflow-hidden shadow-lg"
            >
              {championInfo ? (
                <img
                  src={championIconUrl(ddragonVersion, championInfo.id)}
                  alt={championInfo.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-[11px] sm:text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase text-center px-4">
                  {t.pages.simulation.championPlaceholder}
                </span>
              )}
            </button>

            <div className="flex-1 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                    {t.pages.simulation.statsTitle}
                  </div>
                  {championInfo && (
                    <div className="mt-1 text-sm font-semibold">
                      {championInfo.name}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    {t.common.level}
                  </span>
                  <Select
                    value={String(level)}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      if (!Number.isNaN(next)) {
                        setLevel(Math.min(Math.max(next, 1), 18));
                      }
                    }}
                    className="h-8 w-18 text-xs px-2"
                  >
                    {Array.from({ length: 18 }).map((_, idx) => (
                      <option key={idx + 1} value={idx + 1}>
                        {idx + 1}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div className="border-t border-border/60 pt-3">
                {!finalStats || !baseStats ? (
                  <div className="space-y-1.5 text-[11px] text-muted-foreground">
                    <div>{t.pages.simulation.statsPlaceholderLine1}</div>
                    <div>{t.pages.simulation.statsPlaceholderLine2}</div>
                  </div>
                ) : (
                  <div className="space-y-1.5 text-[11px]">
                    <StatRow
                      label={t.stats.health}
                      value={finalStats.health}
                      base={baseStats.health}
                    />
                    <StatRow
                      label={t.stats.attackDamage}
                      value={finalStats.attackDamage}
                      base={baseStats.attackDamage}
                    />
                    <StatRow
                      label={t.stats.armor}
                      value={finalStats.armor}
                      base={baseStats.armor}
                    />
                    <StatRow
                      label={t.stats.magicResist}
                      value={finalStats.magicResist}
                      base={baseStats.magicResist}
                    />
                    <StatRow
                      label={t.stats.movespeed}
                      value={finalStats.movespeed}
                      base={baseStats.movespeed}
                      precision={0}
                    />
                    {aaDps != null && (
                      <StatRow
                        label={t.pages.simulation.aaDpsLabel}
                        value={aaDps}
                        base={aaDps}
                        precision={1}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 우측: 아이템 빌드 2x3 + ToolTips 버튼 */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                {t.pages.simulation.itemsTitle}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {selectedItems.length} / 6
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, idx) => {
                const item = itemsBySlot[idx];
                return (
                  <div
                    key={idx}
                    className="flex flex-col items-center gap-2"
                  >
                    <button
                      type="button"
                      className="w-16 h-16 sm:w-18 sm:h-18 rounded-md border border-border/70 bg-background/40 flex items-center justify-center overflow-hidden shadow-xs"
                      onClick={() => {
                        setActiveItemSlotIndex(idx);
                        setIsItemModalOpen(true);
                      }}
                    >
                      {item ? (
                        <img
                          src={itemIconUrl(ddragonVersion ?? "", item.id)}
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-[9px] text-muted-foreground text-center px-1">
                          {t.pages.simulation.itemPlaceholderLine1}
                          <br />
                          {t.pages.simulation.itemPlaceholderLine2}
                        </span>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      <SimulationSkills
        champion={championInfo}
        detail={championDetail}
        ddragonVersion={ddragonVersion}
        finalStats={finalStats}
        skillSummaries={skillSummaries}
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
      />

      {/* 하단: 소환사 주문 / 룬 영역 */}
      <div className="mt-6 grid gap-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.1fr)]">
        <Card className="p-4 bg-card/60 border-border/70 space-y-3">
          <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            {t.pages.simulation.summonerSpellsTitle}
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md border border-border/70 bg-background/40" />
            <div className="w-10 h-10 rounded-md border border-border/70 bg-background/40" />
          </div>
          <div className="text-[11px] text-muted-foreground">
            {t.pages.simulation.summonerSpellsComingSoon}
          </div>
        </Card>

        <Card className="p-4 bg-card/60 border-border/70 space-y-3">
          <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            {t.pages.simulation.runesTitle}
          </div>
          <div className="flex items-center gap-2">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="w-8 h-8 rounded-full border border-border/70 bg-background/40"
              />
            ))}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {t.pages.simulation.runesComingSoon}
          </div>
        </Card>
      </div>

      {/* INFO 영역은 디자인상 제거 */}

      {/* 챔피언 선택 모달 (Encyclopedia와 동일한 디자인 재사용) */}
      <ChampionSelector
        championList={championOptions}
        selectedChampions={
          championInfo && championList
            ? championList.filter((c) => c.id === championInfo.id)
            : []
        }
        onSelect={(champion) => {
          setSelectedChampionId(champion.id);
        }}
        selectionMode="single"
        onClose={() => setIsChampionModalOpen(false)}
        open={isChampionModalOpen}
        onOpenChange={setIsChampionModalOpen}
      />

      <ChampionSelector
        championList={championOptions}
        selectedChampions={
          targetChampionInfo && championList
            ? championList.filter((champion) => champion.id === targetChampionInfo.id)
            : []
        }
        onSelect={(champion) => setTargetChampionId(champion.id)}
        selectionMode="single"
        onClose={() => setIsTargetModalOpen(false)}
        open={isTargetModalOpen}
        onOpenChange={setIsTargetModalOpen}
      />

      <SimulationItemPicker
        open={isItemModalOpen}
        activeSlotIndex={activeItemSlotIndex}
        selectedItemId={
          activeItemSlotIndex === null
            ? null
            : selectedItemIds[activeItemSlotIndex]
        }
        items={availableItems}
        ddragonVersion={ddragonVersion}
        onOpenChange={(open) => {
          setIsItemModalOpen(open);
          if (!open) setActiveItemSlotIndex(null);
        }}
        onSelect={(itemId) => {
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
