import type { StatField } from "./constants";

export function ChampionStatValue({ field, stats }: { field: StatField; stats?: Record<string, number> }) {
  const base = stats?.[field.key];
  const growth = field.growthKey ? stats?.[field.growthKey] : undefined;
  return (
    <span className="inline-flex flex-wrap items-baseline justify-end gap-x-1 tabular-nums" data-stat={field.key}>
      <span className="font-medium">{base === undefined ? "—" : field.format(base)}</span>
      {growth !== undefined && (
        <span className="whitespace-nowrap font-normal text-muted-foreground" data-stat-growth>
          + {(field.growthFormat ?? field.format)(growth)}
        </span>
      )}
    </span>
  );
}
