import type {
  Rune,
  RuneStatShard,
  RuneStatShardGroup,
  RuneStatShardRow,
  RuneStatShardStaticData,
  RuneTree,
} from "@/types";
import type { NormalizedRuneDataFile } from "@/types/combatNormalized";
import { STAT_DEFINITIONS, type StatKey } from "@/types/combatStats";

const RUNE_TREE_META: Record<
  number,
  { key: string; nameEn: string; nameKo: string; icon: string }
> = {
  8000: { key: "Precision", nameEn: "Precision", nameKo: "정밀", icon: "perk-images/Styles/7201_Precision.png" },
  8100: { key: "Domination", nameEn: "Domination", nameKo: "지배", icon: "perk-images/Styles/7200_Domination.png" },
  8200: { key: "Sorcery", nameEn: "Sorcery", nameKo: "마법", icon: "perk-images/Styles/7202_Sorcery.png" },
  8300: { key: "Inspiration", nameEn: "Inspiration", nameKo: "영감", icon: "perk-images/Styles/7203_Whimsy.png" },
  8400: { key: "Resolve", nameEn: "Resolve", nameKo: "결의", icon: "perk-images/Styles/7204_Resolve.png" },
};

function getTreeMeta(pathId: number, isKo: boolean) {
  const meta = RUNE_TREE_META[pathId];
  if (!meta) {
    const id = String(pathId);
    return { key: id, name: id, icon: "" };
  }
  return {
    key: meta.key,
    name: isKo ? meta.nameKo : meta.nameEn,
    icon: meta.icon,
  };
}

export function toRuneTrees(data: NormalizedRuneDataFile): RuneTree[] {
  const trees = new Map<number, RuneTree>();
  const isKo = data.locale === "ko_KR";
  for (const rune of data.runes) {
    let tree = trees.get(rune.pathId);
    if (!tree) {
      const meta = getTreeMeta(rune.pathId, isKo);
      tree = { id: rune.pathId, ...meta, slots: [] };
      trees.set(rune.pathId, tree);
    }
    while (tree.slots.length <= rune.slotIndex) tree.slots.push({ runes: [] });
    const entry: Rune = {
      id: Number(rune.id),
      name: rune.name || rune.id,
      icon: rune.iconPath ?? "",
      descriptionHtml: rune.tooltip ?? "",
    };
    tree.slots[rune.slotIndex].runes.push(entry);
  }
  for (const tree of trees.values()) {
    tree.slots.forEach((slot) => slot.runes.sort((a, b) => a.id - b.id));
  }
  return [...trees.values()];
}

function describeStats(
  isKo: boolean,
  stats: { stat: StatKey; value: number; valueType: string }[]
): string {
  return stats
    .map(({ stat, value, valueType }) => {
      const definition = STAT_DEFINITIONS[stat];
      const label = definition
        ? isKo
          ? definition.label.ko
          : definition.label.en
        : stat;
      const suffix = valueType === "percent" || definition?.isPercent ? "%" : "";
      return `+${value}${suffix} ${label}`;
    })
    .join(" / ");
}

export function toRuneStatShards(
  data: NormalizedRuneDataFile
): RuneStatShardStaticData {
  const isKo = data.locale === "ko_KR";
  const labels = isKo
    ? ["1열: 공격 능력치", "2열: 유연 능력치", "3열: 방어 능력치"]
    : ["Row 1 (Offense)", "Row 2 (Flex)", "Row 3 (Defense)"];
  const rows = new Map<number, RuneStatShardRow>();
  const sorted = [...data.statShards].sort(
    (a, b) => a.rowIndex - b.rowIndex || a.columnIndex - b.columnIndex
  );
  for (const shard of sorted) {
    const row = rows.get(shard.rowIndex) ?? {
      label: labels[shard.rowIndex] ?? "",
      perks: [],
    };
    const description = describeStats(isKo, shard.stats);
    const perk: RuneStatShard = {
      id: Number(shard.id),
      name: shard.name || shard.id,
      iconPath: shard.iconPath ?? "",
      shortDesc: description,
      longDesc: description,
    };
    row.perks.push(perk);
    rows.set(shard.rowIndex, row);
  }
  const groups: RuneStatShardGroup[] = [{
    styleId: 0,
    styleName: isKo ? "공통 능력치 조각" : "Common Stat Shards",
    rows: [...rows.entries()].sort(([a], [b]) => a - b).map(([, row]) => row),
  }];
  return {
    patchVersion: data.patchVersion,
    locale: data.locale,
    sources: data.sources,
    groups,
  };
}
