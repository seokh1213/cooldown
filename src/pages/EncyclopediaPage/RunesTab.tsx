import { useEffect, useMemo, useState } from "react";
import type { Rune, RuneStatShard, RuneStatShardStaticData, RuneTree } from "@/types";
import type { DataLocale, StaticDataSources } from "@/data/contracts/staticData";
import { getRunePageData } from "@/data/queries/gameDataQueries";
import { useDeviceType } from "@/hooks/useDeviceType";
import { useTranslation } from "@/i18n";
import { RuneCatalog, type StatShardRow } from "./RuneCatalog";

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
  const [trees, setTrees] = useState<RuneTree[] | null>(null);
  const [statShards, setStatShards] = useState<RuneStatShardStaticData | null>(null);
  const [selectedRune, setSelectedRune] = useState<Rune | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getRunePageData({ patchVersion, sources }, lang)
      .then((data) => {
        if (cancelled) return;
        setTrees(data.trees);
        setStatShards(data.statShards);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [patchVersion, sources, lang]);

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

  if (loading && !trees) {
    return <div className="mt-4 text-sm text-muted-foreground">{t.championSelector.loading}</div>;
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
      onSelectRune={setSelectedRune}
    />
  );
}
