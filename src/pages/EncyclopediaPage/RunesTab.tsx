import React, { useEffect, useState } from "react";
import { getRuneTrees, getRuneStatShards } from "@/services/api";
import type { RuneTree, Rune, RuneStatShardStaticData } from "@/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { useTranslation } from "@/i18n";
import { useDeviceType } from "@/hooks/useDeviceType";
import { AlertTriangle } from "lucide-react";

interface RunesTabProps {
  version: string;
  lang: string;
}

export function RunesTab({ version, lang }: RunesTabProps) {
  const { t } = useTranslation();
  const [runeTrees, setRuneTrees] = useState<RuneTree[] | null>(null);
  const [statShardData, setStatShardData] =
    useState<RuneStatShardStaticData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const deviceType = useDeviceType();
  const isMobile = deviceType === "mobile";
  const [selectedRune, setSelectedRune] = useState<Rune | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all([
      getRuneTrees(version, lang),
      getRuneStatShards(version, lang),
    ])
      .then(([trees, statmods]) => {
        if (!cancelled) {
          setRuneTrees(trees);
          setStatShardData(statmods);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [version, lang]);

  if (loading && !runeTrees) {
    return (
      <div className="mt-4 text-sm text-muted-foreground">
        {t.championSelector.loading}
      </div>
    );
  }

  if (!runeTrees || runeTrees.length === 0) {
    return (
      <div className="mt-4 text-sm text-muted-foreground">
        {t.championSelector.emptyList}
      </div>
    );
  }

  /**
   * 룬 트리 정렬 순서: 정밀, 지배, 마법, 결의, 영감
   */
  const runeTreeOrder: Record<string, number> = {
    Precision: 0,
    Domination: 1,
    Sorcery: 2,
    Resolve: 3,
    Inspiration: 4,
  };

  const sortedRuneTrees = [...runeTrees].sort((a, b) => {
    const orderA = runeTreeOrder[a.key] ?? 999;
    const orderB = runeTreeOrder[b.key] ?? 999;
    return orderA - orderB;
  });

  /**
   * @이름@ 또는 @{이름}@ 패턴을 물음표로 치환
   * 예: @HealAmount@ → ?, @BaseHeal@ → ?, @{이름}@ → ?
   * 물음표는 오류 표시를 위해 빨간색 스타일이 적용됨
   */
  const replaceUnresolvedVariables = (text: string): string => {
    const errorMarkup = ' <span class="text-destructive dark:text-red-400">?</span> ';
    // @{이름}@ 형식 (중괄호 포함)
    let result = text.replace(/@\{[^}]+\}@/g, errorMarkup);
    // @이름@ 형식 (중괄호 없음)
    result = result.replace(/@[^@]+@/g, errorMarkup);
    return result;
  };

  const renderRuneContent = (rune: Rune) => {
    const description = rune.longDesc || rune.shortDesc || "";
    const processedDescription = replaceUnresolvedVariables(description);

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <img
            src={`https://ddragon.leagueoflegends.com/cdn/img/${rune.icon}`}
            alt={rune.name}
            loading="lazy"
            decoding="async"
            width={32}
            height={32}
            className="w-8 h-8 rounded-full border border-border/60 bg-transparent"
          />
          <div className="flex flex-col">
            <span className="text-sm font-semibold">{rune.name}</span>
          </div>
        </div>
        <div className="text-xs text-muted-foreground leading-relaxed">
          <span
            dangerouslySetInnerHTML={{
              __html: processedDescription,
            }}
          />
        </div>
        <div className="text-xs text-muted-foreground/80 italic leading-relaxed border-t pt-3 mt-3 flex items-center gap-1.5">
          <AlertTriangle className="w-2.5 h-2.5 text-yellow-600 dark:text-yellow-500 flex-shrink-0" />
          <span>{t.encyclopedia.runes.warning}</span>
        </div>
      </div>
    );
  };

  const renderRuneIcon = (
    rune: Rune,
    style: React.CSSProperties,
  ) => {
    if (isMobile) {
      return (
        <button
          type="button"
          onClick={() => setSelectedRune(rune)}
          className="flex flex-col items-center gap-1 focus:outline-none min-w-0"
          style={style}
        >
          <img
            src={`https://ddragon.leagueoflegends.com/cdn/img/${rune.icon}`}
            alt={rune.name}
            loading="lazy"
            decoding="async"
            width={40}
            height={40}
            className="w-10 h-10 rounded-full border border-border/60 bg-transparent flex-shrink-0"
          />
          <span className="text-[10px] text-center leading-tight line-clamp-2 w-full">
            {rune.name}
          </span>
        </button>
      );
    }

    return (
      <Tooltip key={rune.id}>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="flex flex-col items-center gap-1 focus:outline-none cursor-help min-w-0"
            style={style}
          >
            <img
              src={`https://ddragon.leagueoflegends.com/cdn/img/${rune.icon}`}
              alt={rune.name}
              loading="lazy"
              decoding="async"
              width={40}
              height={40}
              className="w-10 h-10 rounded-full border border-border/60 bg-transparent flex-shrink-0"
            />
            <span className="text-[10px] text-center leading-tight line-clamp-2 w-full">
              {rune.name}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="center"
          sideOffset={8}
          className="max-w-xs p-3"
        >
          {renderRuneContent(rune)}
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="mt-4">
        <ScrollArea className="rounded-md border bg-card/40">
          <div className="p-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sortedRuneTrees.map((tree) => (
              <Card
                key={tree.id}
                className="p-4 flex flex-col gap-3 bg-background/60 border-border/70"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={`https://ddragon.leagueoflegends.com/cdn/img/${tree.icon}`}
                    alt={tree.name}
                    loading="lazy"
                    decoding="async"
                    width={32}
                    height={32}
                    className="w-8 h-8 rounded-full border border-border/60 bg-transparent"
                  />
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold">{tree.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {tree.key}
                    </span>
                  </div>
                </div>
                <div className="space-y-3">
                  {tree.slots.map((slot, slotIndex) => {
                    const maxRunes = Math.max(...tree.slots.map((s) => s.runes.length));

                    return (
                      <div
                        key={slotIndex}
                        className="grid gap-y-2 gap-x-2 md:gap-x-4"
                        style={{
                          gridTemplateColumns: `repeat(${maxRunes}, minmax(0, 1fr))`,
                        }}
                      >
                        {slot.runes.map((rune, runeIndex) => {
                          const runeCount = slot.runes.length;

                          // 기본값: 각 룬을 자기 열에 배치 (1,2,3,4...)
                          let gridColumn: React.CSSProperties["gridColumn"] = String(
                            runeIndex + 1,
                          );

                          // 4열 기준에서 3개일 때:
                          // 2A | 2B(2~3열 span) | 2C 형태가 되도록 조정
                          if (maxRunes === 4 && runeCount === 3) {
                            if (runeIndex === 0) {
                              gridColumn = "1";
                            } else if (runeIndex === 1) {
                              gridColumn = "2 / span 2"; // 가운데 룬을 2,3열 전체에 걸쳐 가운데 배치
                            } else if (runeIndex === 2) {
                              gridColumn = "4";
                            }
                          }

                          // 4열 기준에서 2개일 때: 양 끝 정렬 (1열, 4열)
                          if (maxRunes === 4 && runeCount === 2) {
                            if (runeIndex === 0) {
                              gridColumn = "1";
                            } else if (runeIndex === 1) {
                              gridColumn = "4";
                            }
                          }

                          // 하나만 있을 때는 전체를 span 해서 정중앙에
                          if (runeCount === 1) {
                            gridColumn = "1 / -1";
                          }

                          return renderRuneIcon(rune, {
                            gridColumn,
                          });
                        })}
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))}

            {/* 공통 보조 룬 (스탯 조각) 섹션 */}
            {statShardData && statShardData.groups.length > 0 && (
              <Card className="p-4 flex flex-col gap-3 bg-background/60 border-border/70 md:col-span-2 xl:col-span-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full border border-border/60 bg-transparent flex items-center justify-center text-xs font-semibold">
                    +
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold">
                      {t.encyclopedia.runes.warning.replace(
                        "정확한 수치와 설명은",
                        "공통 능력치 조각 (보조 룬)"
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t.encyclopedia.runes.warning}
                    </span>
                  </div>
                </div>
                <div className="space-y-3 mt-1">
                  {statShardData.groups.map((group) =>
                    group.rows.map((row, rowIndex) => {
                      if (!row.perks || row.perks.length === 0) return null;
                      return (
                        <div
                          key={`${group.styleId}-${rowIndex}`}
                          className="flex flex-col gap-1"
                        >
                          {row.label && (
                            <div className="text-[11px] font-semibold text-muted-foreground mb-0.5">
                              {row.label}
                            </div>
                          )}
                          <div className="flex flex-wrap gap-2">
                            {row.perks.map((perk) => (
                              <div
                                key={perk.id}
                                className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-background/80 px-2 py-1"
                              >
                                <img
                                  src={`https://raw.communitydragon.org/${statShardData.cdragonVersion ?? "latest"}${perk.iconPath}`}
                                  alt={perk.name}
                                  loading="lazy"
                                  decoding="async"
                                  width={24}
                                  height={24}
                                  className="w-6 h-6 rounded-full border border-border/60 bg-transparent flex-shrink-0"
                                />
                                <div className="flex flex-col min-w-0">
                                  <span className="text-[11px] font-semibold leading-tight truncate">
                                    {perk.name}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground leading-snug line-clamp-2">
                                    <span
                                      dangerouslySetInnerHTML={{
                                        __html: perk.shortDesc || perk.longDesc,
                                      }}
                                    />
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </Card>
            )}
          </div>
        </ScrollArea>

        {/* Mobile: Dialog for rune details */}
        {isMobile && (
          <Dialog
            open={!!selectedRune}
            onOpenChange={(open) => !open && setSelectedRune(null)}
          >
            <DialogContent className="w-[calc(100vw-32px)] max-w-lg max-h-[70vh] h-[70vh] p-0 rounded-xl overflow-hidden flex flex-col">
              <VisuallyHidden>
                <DialogTitle>{selectedRune?.name ?? "Rune"}</DialogTitle>
                <DialogDescription>{selectedRune?.name ?? "Rune"}</DialogDescription>
              </VisuallyHidden>
              <ScrollArea className="flex-1 min-h-0">
                <div className="p-4">
                  {selectedRune && renderRuneContent(selectedRune)}
                </div>
              </ScrollArea>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </TooltipProvider>
  );
}


