import { useCallback, useMemo, useState } from "react";
import type { RuneStatShard, RuneStatShardStaticData } from "@/domain/game/types";
import type { DataLocale, StaticDataSources } from "@/domain/game/contracts/staticData";
import { getRunePageData } from "@/infrastructure/queries/gameDataQueries";
import { useDeviceType } from "@/shared/hooks/useDeviceType";
import { useTranslation } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { RuneCatalog, type StatShardRow } from "./RuneCatalog";
import { useEncyclopediaData } from "../useEncyclopediaData";

interface RunesTabProps {
  patchVersion: string;
  sources: StaticDataSources;
  lang: DataLocale;
}

const RUNE_TREE_ORDER: Record<string, number> = {
  Precision: 0,
  Domination: 1,
  Sorcery: 2,
  Resolve: 3,
  Inspiration: 4,
};

function buildStatShardRows(
  statShardData: RuneStatShardStaticData | null,
): StatShardRow[] {
  const rows = new Map<
    string,
    { label: string; perks: Map<number, RuneStatShard> }
  >();
  for (const group of statShardData?.groups ?? []) {
    for (const row of group.rows) {
      if (row.perks.length === 0) continue;
      const entry = rows.get(row.label) ?? {
        label: row.label,
        perks: new Map<number, RuneStatShard>(),
      };
      for (const perk of row.perks) entry.perks.set(perk.id, perk);
      rows.set(row.label, entry);
    }
  }
  return [...rows.values()]
    .map(({ label, perks }) => ({ label, perks: [...perks.values()] }))
    .sort((left, right) => {
      if (!left.label) return 1;
      if (!right.label) return -1;
      return left.label.localeCompare(right.label);
    });
}

export function RunesTab({ patchVersion, sources, lang }: RunesTabProps) {
  const { t } = useTranslation();
  const isMobile = useDeviceType() === "mobile";
  const [selectedRuneId, setSelectedRuneId] = useState<number | null>(null);
  const loadRunes = useCallback(
    () => getRunePageData({ patchVersion, sources }, lang),
    [patchVersion, sources, lang],
  );
  const { data, error, retry } = useEncyclopediaData(loadRunes);
  const trees = data?.trees;
  const statShards = data?.statShards ?? null;
  const selectedRune = trees?.flatMap((tree) => tree.slots.flatMap((slot) => slot.runes))
    .find((rune) => rune.id === selectedRuneId) ?? null;

  const sortedTrees = useMemo(
    () => [...(trees ?? [])].sort(
      (left, right) =>
        (RUNE_TREE_ORDER[left.key] ?? 999) -
        (RUNE_TREE_ORDER[right.key] ?? 999),
    ),
    [trees],
  );
  const statShardRows = useMemo(
    () => buildStatShardRows(statShards),
    [statShards],
  );

  if (error) {
    return <div role="alert" className="mt-4 flex items-center gap-3 text-sm text-muted-foreground">{t.app.loadError}<Button onClick={retry} variant="outline" className="h-11">{t.app.retry}</Button></div>;
  }
  if (!trees) {
    return <div role="status" className="mt-4 text-sm text-muted-foreground">{t.championSelector.loading}</div>;
  }
  if (sortedTrees.length === 0) {
    return <div className="mt-4 text-sm text-muted-foreground">{t.championSelector.emptyList}</div>;
  }
  return (
    <RuneCatalog
      trees={sortedTrees}
      statShardRows={statShardRows}
      selectedRune={selectedRune}
      isMobile={isMobile}
      warning={t.encyclopedia.runes.warning}
      statShardsTitle={t.encyclopedia.runes.statShardsTitle}
      onSelectRune={(rune) => setSelectedRuneId(rune?.id ?? null)}
    />
  );
}
