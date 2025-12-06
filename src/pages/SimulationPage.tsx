import { useEffect, useMemo, useState } from "react";
import type { Language } from "@/i18n";
import { useTranslation } from "@/i18n";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getChampionInfo,
  getCommunityDragonSpellData,
  getNormalizedItems,
} from "@/services/api";
import type { Champion } from "@/types";
import type { NormalizedItem } from "@/types/combatNormalized";
import ChampionSelector from "@/components/features/ChampionSelector";
import {
  applyNormalizedItemsToStats,
  computeAbilityHasteFromNormalizedItems,
  computeChampionStatsAtLevel,
  computeSimpleComboResult,
  computeSkillSummaries,
  type SimpleComboResult,
  type SimpleStats,
  type SkillSummary,
  estimateSpellDamageFromCDragon,
} from "./SimulationPage.damageUtils";

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
  version: string | null;
  championList: Champion[] | null;
}

export default function SimulationPage({
  lang,
  version,
  championList,
}: SimulationPageProps) {
  const { t } = useTranslation();
  const [selectedChampionId, setSelectedChampionId] = useState<string>("");
  const [championInfo, setChampionInfo] = useState<Champion | null>(null);
  const [level, setLevel] = useState<number>(18);
  const [availableItems, setAvailableItems] = useState<NormalizedItem[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<(string | null)[]>(
    () => Array(6).fill(null)
  );
  const [spellDataMap, setSpellDataMap] = useState<Record<string, any> | null>(null);
  const [comboSequence, setComboSequence] = useState<string>("QWER");
  const [isChampionModalOpen, setIsChampionModalOpen] = useState(false);
  const [selectedSkillIndex, setSelectedSkillIndex] = useState<number | null>(0);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [activeItemSlotIndex, setActiveItemSlotIndex] = useState<number | null>(null);

  const championOptions = useMemo(
    () => championList ?? [],
    [championList]
  );

  useEffect(() => {
    if (!version || !selectedChampionId) {
      setChampionInfo(null);
      setSpellDataMap(null);
      return;
    }

    let cancelled = false;
    getChampionInfo(version, lang, selectedChampionId)
      .then((info) => {
        if (!cancelled) {
          setChampionInfo(info);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setChampionInfo(null);
        }
      });

    getCommunityDragonSpellData(selectedChampionId, version)
      .then((res) => {
        if (!cancelled) {
          setSpellDataMap(res.spellDataMap);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSpellDataMap(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [version, lang, selectedChampionId]);

  useEffect(() => {
    if (!version) return;
    let cancelled = false;

    getNormalizedItems(version, lang)
      .then((items) => {
        if (!cancelled) {
          // 정규화된 아이템 중 실제 게임에서 사용되는 아이템만 간단히 필터링
          const filtered = items.filter((item) => {
            const tags = item.tags || [];
            const total = item.priceTotal ?? 0;
            const isTrinket =
              tags.includes("Trinket") || tags.includes("Consumable");

            if (!isTrinket && total <= 0) return false;
            if (item.purchasable === false) return false;
            if (item.inStore === false) return false;
            if (item.displayInItemSets === false) return false;

            return true;
          });

          setAvailableItems(filtered);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAvailableItems([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [version, lang]);

  const baseStats = useMemo(() => {
    if (!championInfo) return null;
    return computeChampionStatsAtLevel(championInfo, level);
  }, [championInfo, level]);

  const itemsBySlot = useMemo(
    () =>
      selectedItemIds.map((id) =>
        id ? availableItems.find((item) => item.id === id) ?? null : null
      ),
    [availableItems, selectedItemIds]
  );

  const selectedItems = useMemo(
    () => itemsBySlot.filter((i): i is NormalizedItem => i !== null),
    [itemsBySlot]
  );

  const finalStats = useMemo(() => {
    if (!baseStats) return null;
    return applyNormalizedItemsToStats(baseStats, selectedItems);
  }, [baseStats, selectedItems]);

  const aaDps = useMemo(() => {
    if (!finalStats) return null;
    // 단순화: 공격 속도 0.7 고정 근사치
    const attackSpeed = 0.7;
    return finalStats.attackDamage * attackSpeed;
  }, [finalStats]);

  const simpleCombo: SimpleComboResult | null = useMemo(
    () =>
      computeSimpleComboResult(
        championInfo,
        finalStats,
        comboSequence,
        spellDataMap
      ),
    [championInfo, finalStats, comboSequence, spellDataMap]
  );

  const abilityHaste = useMemo(
    () => computeAbilityHasteFromNormalizedItems(selectedItems),
    [selectedItems]
  );

  const skillSummaries = useMemo(() => {
    if (!championInfo) return [];
    return computeSkillSummaries(
      championInfo,
      spellDataMap,
      abilityHaste
    );
  }, [championInfo, spellDataMap, abilityHaste]);

  if (!version) {
    return (
      <div className="w-full max-w-5xl mx-auto px-4 md:px-6 lg:px-8 py-8 md:py-10">
        <div className="text-sm text-muted-foreground">
          {t.championSelector.loading}
        </div>
      </div>
    );
  }

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
              className="relative mx-auto md:mx-0 w-32 h-32 sm:w-36 sm:h-36 rounded-full border-4 border-border/80 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-700 flex items-center justify-center overflow-hidden shadow-lg"
            >
              {championInfo ? (
                <img
                  src={`https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${championInfo.id}.png`}
                  alt={championInfo.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-[11px] sm:text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase text-center px-4">
                  Champion
                  <br />
                  Placeholder
                </span>
              )}
            </button>

            <div className="flex-1 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                    {championInfo ? "Stats" : "Champion Stats"}
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
                      className="w-16 h-16 sm:w-18 sm:h-18 rounded-md border border-border/70 bg-background/40 flex items-center justify-center overflow-hidden shadow-sm"
                      onClick={() => {
                        setActiveItemSlotIndex(idx);
                        setIsItemModalOpen(true);
                      }}
                    >
                      {item ? (
                        <img
                          src={`https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${item.id}.png`}
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

      {/* 스킬 설명 박스 (Q/W/E/R) */}
      <Card className="mt-6 bg-card/60 border-border/70">
        <div className="border-b border-border/70 px-4 py-3">
          <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            Skills
          </div>
        </div>
        <div className="px-4 py-4 space-y-3">
          {["Q", "W", "E", "R"].map((key, idx) => {
            const spell = championInfo?.spells?.[idx];
            const summary = skillSummaries[idx];
            const dmg =
              championInfo && finalStats
                ? estimateSpellDamageFromCDragon(
                    spellDataMap,
                    idx,
                    summary?.maxrank ?? spell?.maxrank ?? 1,
                    finalStats
                  )
                : null;

            return (
              <div
                key={key}
                className="flex items-start gap-3 border border-border/50 rounded-md px-3 py-2 bg-background/40"
              >
                <div className="w-8 h-8 rounded-sm border border-border/70 bg-slate-900 flex items-center justify-center text-xs font-bold text-amber-300">
                  {key}
                </div>
                <div className="flex-1 space-y-1">
                  <div className="text-[11px] font-semibold">
                    {spell
                      ? `${key}: ${spell.name}`
                      : `${key}: Skill Description Placeholder`}
                  </div>
                  <div className="text-[11px] text-muted-foreground leading-snug">
                    {spell
                      ? spell.description
                      : "Skill Description Placeholder"}
                  </div>
                  {dmg && dmg.totalDamage != null && (
                    <div className="text-[10px] text-emerald-400 mt-1">
                      예상 피해 (아이템/레벨 반영):{" "}
                      {dmg.totalDamage.toFixed(1)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* 하단: 소환사 주문 / 룬 영역 */}
      <div className="mt-6 grid gap-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.1fr)]">
        <Card className="p-4 bg-card/60 border-border/70 space-y-3">
          <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            Summoner Spells
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md border border-border/70 bg-background/40" />
            <div className="w-10 h-10 rounded-md border border-border/70 bg-background/40" />
          </div>
          <div className="text-[11px] text-muted-foreground">
            추후 소환사 주문 시뮬레이션을 여기에 추가할 수 있습니다.
          </div>
        </Card>

        <Card className="p-4 bg-card/60 border-border/70 space-y-3">
          <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            Runes
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
            룬 시뮬레이션을 추가할 때 이 영역을 재사용할 수 있습니다.
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
        onClose={() => setIsChampionModalOpen(false)}
        open={isChampionModalOpen}
        onOpenChange={setIsChampionModalOpen}
      />

      {/* 아이템 선택 모달 */}
      <Dialog
        open={isItemModalOpen}
        onOpenChange={(open) => {
          setIsItemModalOpen(open);
          if (!open) {
            setActiveItemSlotIndex(null);
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-base">
              {t.pages.simulation.itemModalTitle}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {t.pages.simulation.itemModalDescription}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="text-[11px] text-muted-foreground">
                {t.pages.simulation.itemModalHint}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={() => {
                  if (activeItemSlotIndex == null) return;
                  setSelectedItemIds((prev) => {
                    const next = [...prev];
                    next[activeItemSlotIndex] = null;
                    return next;
                  });
                  setIsItemModalOpen(false);
                  setActiveItemSlotIndex(null);
                }}
              >
                {t.pages.simulation.clearItemSlot}
              </Button>
            </div>
            <ScrollArea className="h-80 rounded-md border bg-background/60">
              <div className="p-2 space-y-1">
                {availableItems.slice(0, 300).map((item) => {
                  const inSlot =
                    activeItemSlotIndex != null &&
                    selectedItemIds[activeItemSlotIndex] === item.id;
                  const showPrice = (item.priceTotal ?? 0) > 0;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        if (activeItemSlotIndex == null) return;
                        setSelectedItemIds((prev) => {
                          const next = [...prev];
                          next[activeItemSlotIndex] = item.id;
                          return next;
                        });
                        setIsItemModalOpen(false);
                        setActiveItemSlotIndex(null);
                      }}
                      className={`w-full flex items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] transition-colors ${
                        inSlot
                          ? "bg-primary/10 text-primary border border-primary/40"
                          : "hover:bg-muted/60 text-foreground/80"
                      }`}
                    >
                      <img
                        src={`https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${item.id}.png`}
                        alt={item.name || item.id}
                        className="w-6 h-6 rounded-sm border border-border/60 bg-black/40"
                      />
                      <span className="flex-1 truncate">
                        {item.name || item.id}
                      </span>
                      {showPrice && (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                          {item.priceTotal.toLocaleString()}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


