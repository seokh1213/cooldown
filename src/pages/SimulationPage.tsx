import { useEffect, useMemo, useState } from "react";
import type { Champion } from "@/types";
import type { Language } from "@/i18n";
import { useTranslation } from "@/i18n";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { getChampionInfo, getCommunityDragonSpellData, getItems } from "@/services/api";
import type { ChampionSpell } from "@/types";
import type { Item } from "@/types";

interface SimulationPageProps {
  lang: Language;
  version: string | null;
  championList: Champion[] | null;
}

interface SimpleStats {
  level: number;
  health: number;
  mana: number;
  armor: number;
  magicResist: number;
  attackDamage: number;
  movespeed: number;
}

interface SkillSummary {
  id: string;
  name?: string;
  maxrank: number;
  cooldowns: (number | string)[];
  cooldownsWithAbilityHaste: number[];
}

interface SimpleComboResult {
  sequence: string;
  estimatedHits: number;
  estimatedDamage: number | null;
}

function computeChampionStatsAtLevel(
  champion: Champion,
  level: number
): SimpleStats | null {
  if (!champion.stats) return null;
  const s = champion.stats as any;
  const lvl = Math.min(Math.max(level, 1), 18);
  const factor = lvl - 1;
  return {
    level: lvl,
    health: (s.hp ?? 0) + (s.hpperlevel ?? 0) * factor,
    mana: (s.mp ?? 0) + (s.mpperlevel ?? 0) * factor,
    armor: (s.armor ?? 0) + (s.armorperlevel ?? 0) * factor,
    magicResist:
      (s.spellblock ?? 0) + (s.spellblockperlevel ?? 0) * factor,
    attackDamage:
      (s.attackdamage ?? 0) + (s.attackdamageperlevel ?? 0) * factor,
    movespeed: s.movespeed ?? 0,
  };
}

function applyItemsToStats(base: SimpleStats, items: Item[]): SimpleStats {
  // 매우 단순한 근사치: 대표 스탯만 더해줌
  let result = { ...base };

  for (const item of items) {
    const stats = item.stats;
    if (!stats) continue;

    for (const [key, value] of Object.entries(stats)) {
      switch (key) {
        case "FlatHPPoolMod":
          result.health += value;
          break;
        case "FlatMPPoolMod":
          result.mana += value;
          break;
        case "FlatPhysicalDamageMod":
          result.attackDamage += value;
          break;
        case "FlatArmorMod":
          result.armor += value;
          break;
        case "FlatSpellBlockMod":
          result.magicResist += value;
          break;
        case "FlatMovementSpeedMod":
          result.movespeed += value;
          break;
        default:
          break;
      }
    }
  }

  return result;
}

function computeAbilityHasteFromItems(items: Item[]): number {
  let haste = 0;
  for (const item of items) {
    const stats = item.stats;
    if (!stats) continue;
    // Data Dragon 아이템의 AbilityHaste 필드 사용
    if (typeof (stats as any).AbilityHaste === "number") {
      haste += (stats as any).AbilityHaste;
    }
  }
  return haste;
}

function computeSkillSummaries(
  champion: Champion,
  cdragonSpellData: Record<string, any> | null,
  abilityHaste: number
): SkillSummary[] {
  if (!champion.spells) return [];
  const hasteFactor = abilityHaste > 0 ? 1 + abilityHaste / 100 : 1;

  return champion.spells.map((spell: ChampionSpell) => {
    const baseCd = spell.cooldown ?? [];
    const cooldownsWithHaste =
      hasteFactor > 0
        ? baseCd.map((cd) =>
            typeof cd === "number" ? cd / hasteFactor : cd
          )
        : baseCd.map((cd) =>
            typeof cd === "number" ? cd : cd
          );

    return {
      id: spell.id,
      name: spell.name,
      maxrank: spell.maxrank,
      cooldowns: baseCd,
      cooldownsWithAbilityHaste: cooldownsWithHaste as number[],
    };
  });
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
  const [availableItems, setAvailableItems] = useState<Item[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [spellDataMap, setSpellDataMap] = useState<Record<string, any> | null>(null);
  const [comboSequence, setComboSequence] = useState<string>("QWER");

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

    getItems(version, lang)
      .then((items) => {
        if (!cancelled) {
          // 소환사 협곡(맵 ID 11) 기준 + 실제 구매 가능한(또는 장신구) 아이템만 사용
          const filtered = items.filter((item) => {
            if (!item.maps || !item.maps["11"]) return false;

            const isTrinket = item.tags?.includes("Trinket");
            if (!isTrinket && item.gold && item.gold.purchasable === false) {
              return false;
            }

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

  const selectedItems = useMemo(
    () =>
      availableItems.filter((item) =>
        selectedItemIds.includes(item.id)
      ),
    [availableItems, selectedItemIds]
  );

  const finalStats = useMemo(() => {
    if (!baseStats) return null;
    return applyItemsToStats(baseStats, selectedItems);
  }, [baseStats, selectedItems]);

  const aaDps = useMemo(() => {
    if (!finalStats) return null;
    // 단순화: 공격 속도 0.7 고정 근사치
    const attackSpeed = 0.7;
    return finalStats.attackDamage * attackSpeed;
  }, [finalStats]);

  const simpleCombo: SimpleComboResult | null = useMemo(() => {
    if (!finalStats || !championInfo) return null;
    const seq = comboSequence.replace(/[^QWERqwer]/g, "").toUpperCase();
    if (!seq) return null;

    // 매우 단순한 근사치: 각 스킬의 "기본 피해"를 effectBurn / leveltip 대신
    // effectBurn 이나 tooltip 내 수치를 알 수 없으므로, 공격력의 1.2배로 가정
    const perSkillDamage = finalStats.attackDamage * 1.2;
    const hits = seq.length;
    const totalDamage = perSkillDamage * hits;

    return {
      sequence: seq,
      estimatedHits: hits,
      estimatedDamage: totalDamage,
    };
  }, [finalStats, championInfo, comboSequence]);

  const abilityHaste = useMemo(
    () => computeAbilityHasteFromItems(selectedItems),
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
    <div className="w-full max-w-5xl mx-auto px-4 md:px-6 lg:px-8 py-8 md:py-10">
      <div className="mb-4">
        <h1 className="text-xl md:text-2xl font-semibold tracking-tight">
          {t.pages.simulation.title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t.pages.simulation.description}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        {/* Left: Controls */}
        <Card className="p-4 space-y-4 bg-card/60 border-border/70">
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">
              챔피언
            </div>
            <Select
              value={selectedChampionId}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setSelectedChampionId(e.target.value)
              }
              className="h-9 text-sm"
            >
              <option value="">선택하세요</option>
              {championOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">
              레벨 (1~18)
            </div>
            <Input
              type="number"
              min={1}
              max={18}
              value={level}
              onChange={(e) =>
                setLevel(
                  Number.isNaN(Number(e.target.value))
                    ? 1
                    : Number(e.target.value)
                )
              }
              className="h-9 w-24 text-sm"
            />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">
              아이템 (최대 6개, 단순 스탯 합산)
            </div>
            <ScrollArea className="h-56 rounded-md border bg-background/60">
              <div className="p-2 space-y-1">
                {availableItems.slice(0, 200).map((item) => {
                  const selected = selectedItemIds.includes(item.id);
                  const showPrice =
                    !!item.gold &&
                    item.gold.total > 0 &&
                    item.gold.purchasable !== false &&
                    item.inStore !== false;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSelectedItemIds((prev) => {
                          if (selected) {
                            return prev.filter((id) => id !== item.id);
                          }
                          if (prev.length >= 6) return prev;
                          return [...prev, item.id];
                        });
                      }}
                      className={`w-full flex items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] transition-colors ${
                        selected
                          ? "bg-primary/10 text-primary border border-primary/40"
                          : "hover:bg-muted/60 text-foreground/80"
                      }`}
                    >
                      <img
                        src={`https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${item.id}.png`}
                        alt={item.name}
                        className="w-6 h-6 rounded-sm border border-border/60 bg-black/40"
                      />
                      <span className="flex-1 truncate">{item.name}</span>
                      {showPrice && (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                          {item.gold.total.toLocaleString()}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
            {selectedItems.length > 0 && (
              <div className="text-[11px] text-muted-foreground">
                선택된 아이템:{" "}
                {selectedItems.map((i) => i.name).join(", ")}
              </div>
            )}
          </div>
        </Card>

        {/* Right: Results */}
        <Card className="p-4 bg-card/60 border-border/70 min-h-[260px]">
          <Tabs defaultValue="stats" className="w-full">
            <TabsList className="inline-flex h-9 items-center justify-start rounded-lg bg-muted/60 p-1 mb-3 gap-1">
              <TabsTrigger
                value="stats"
                className="px-3 py-1.5 text-xs"
              >
                최종 스탯
              </TabsTrigger>
              <TabsTrigger
                value="dps"
                className="px-3 py-1.5 text-xs"
              >
                간단 DPS
              </TabsTrigger>
              <TabsTrigger
                value="skills"
                className="px-3 py-1.5 text-xs"
              >
                스킬 쿨타임
              </TabsTrigger>
            </TabsList>

            <TabsContent value="stats" className="mt-0">
              {!finalStats ? (
                <div className="text-sm text-muted-foreground">
                  챔피언과 레벨을 선택하면 최종 스탯이 표시됩니다.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 text-xs">
                  <div className="text-muted-foreground">레벨</div>
                  <div className="text-right">{finalStats.level}</div>
                  <div className="text-muted-foreground">체력</div>
                  <div className="text-right">
                    {Math.round(finalStats.health)}
                  </div>
                  <div className="text-muted-foreground">마나</div>
                  <div className="text-right">
                    {Math.round(finalStats.mana)}
                  </div>
                  <div className="text-muted-foreground">공격력</div>
                  <div className="text-right">
                    {finalStats.attackDamage.toFixed(1)}
                  </div>
                  <div className="text-muted-foreground">방어력</div>
                  <div className="text-right">
                    {finalStats.armor.toFixed(1)}
                  </div>
                  <div className="text-muted-foreground">
                    마법 저항력
                  </div>
                  <div className="text-right">
                    {finalStats.magicResist.toFixed(1)}
                  </div>
                  <div className="text-muted-foreground">
                    이동 속도
                  </div>
                  <div className="text-right">
                    {finalStats.movespeed.toFixed(0)}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="dps" className="mt-0">
              {!finalStats || aaDps == null ? (
                <div className="text-sm text-muted-foreground">
                  챔피언과 레벨을 선택하면 평타 기준 간단 DPS를 볼 수
                  있습니다.
                </div>
              ) : (
                <div className="space-y-3 text-xs">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="text-muted-foreground">
                        평타 공격력
                      </div>
                      <div>{finalStats.attackDamage.toFixed(1)}</div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-muted-foreground">
                        가정 공격 속도
                      </div>
                      <div>0.70 / s</div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-muted-foreground">
                        근사 DPS (평타만)
                      </div>
                      <div>{aaDps.toFixed(1)}</div>
                    </div>
                  </div>

                  <div className="border-t border-border/60 pt-2 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-muted-foreground">
                        스킬 콤보 (예: QWER, QQW)
                      </div>
                      <Input
                        value={comboSequence}
                        onChange={(e) => setComboSequence(e.target.value)}
                        className="h-7 w-28 text-[11px] px-2"
                      />
                    </div>
                    {simpleCombo ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="text-muted-foreground">
                            입력 콤보
                          </div>
                          <div>{simpleCombo.sequence}</div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="text-muted-foreground">
                            스킬 횟수
                          </div>
                          <div>{simpleCombo.estimatedHits}</div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="text-muted-foreground">
                            아주 단순한 콤보 피해 (평타기반 근사)
                          </div>
                          <div>
                            {simpleCombo.estimatedDamage?.toFixed(1)}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-[11px] text-muted-foreground">
                        QWER 문자로 콤보를 입력하면 아주 단순한 근사 콤보
                        피해를 보여줍니다.
                      </div>
                    )}
                  </div>

                  <p className="mt-1 text-[11px] text-muted-foreground">
                    ※ 실제 인게임 공식과 공속/치명타/온히트 및 스킬 계수는
                    훨씬 복잡하므로, 여기서는 단순 참고용 수치만
                    제공합니다.
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="skills" className="mt-0">
              {!championInfo ? (
                <div className="text-sm text-muted-foreground">
                  챔피언을 선택하면 스킬 쿨타임을 확인할 수 있습니다.
                </div>
              ) : skillSummaries.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  스킬 정보가 없습니다.
                </div>
              ) : (
                <div className="space-y-2 text-xs">
                  <div className="text-[11px] text-muted-foreground mb-1">
                    아이템에서 얻는 스킬 가속(Ability Haste)을 반영한
                    쿨타임입니다.
                  </div>
                  <div className="grid grid-cols-1 gap-1">
                    {skillSummaries.map((s, idx) => (
                      <div
                        key={s.id}
                        className="flex flex-col rounded border border-border/60 bg-background/60 px-2 py-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-semibold text-muted-foreground">
                              {["Q", "W", "E", "R"][idx] ?? ""}
                            </span>
                            <span className="text-xs font-medium">
                              {s.name ?? s.id}
                            </span>
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            Haste: {abilityHaste}
                          </div>
                        </div>
                        <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5">
                          <div className="text-[11px] text-muted-foreground">
                            기본 쿨타임
                          </div>
                          <div className="text-[11px] text-right">
                            {s.cooldowns.join(" / ")}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            가속 적용
                          </div>
                          <div className="text-[11px] text-right">
                            {s.cooldownsWithAbilityHaste
                              .map((cd) =>
                                typeof cd === "number"
                                  ? cd.toFixed(2)
                                  : cd
                              )
                              .join(" / ")}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}


