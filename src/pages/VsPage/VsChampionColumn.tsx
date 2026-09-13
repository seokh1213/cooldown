import { toChampionStats } from "@/data/mappers/championMapper";
import { getStatFields } from "@/components/features/ChampionComparison/constants";
import { ChevronDown, Plus } from "lucide-react";
import { championIconUrl } from "@/data/assets/riotAssetUrls";
import type { ChampionDetailV2 } from "@/data/contracts/championData";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n";
import type { useVsChampion } from "./useVsWorkspace";
import type { VsSideKey } from "./vsState";

interface ChampionHeaderProps {
  id: string;
  side: VsSideKey;
  label: string;
  version: string;
  result: ReturnType<typeof useVsChampion>;
  onSelect: () => void;
}

/** Lives in the table head so the champion sits directly above their own skill columns. */
export function VsChampionHeader(props: ChampionHeaderProps) {
  const { t } = useTranslation();
  const { detail, error, retry } = props.result;
  return (
    <section className="min-w-0" aria-label={props.label}>
      <button
        type="button"
        onClick={props.onSelect}
        aria-label={props.label + " " + t.comparison.select}
        className="group flex w-full min-w-0 items-center gap-2.5 rounded-md border border-border bg-card px-2 py-1.5 text-left shadow-xs hover:border-primary/60 hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-primary"
      >
        {props.id ? (
          <img key={props.id} src={championIconUrl(props.version, props.id)} alt="" width={36} height={36} className="size-7 shrink-0 rounded-md shadow-none sm:size-9" />
        ) : (
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-muted/30 sm:size-9">
            <Plus aria-hidden="true" className="size-4 text-muted-foreground" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold leading-5 group-hover:text-primary sm:text-[15px]">
            {detail?.champion.name ?? t.comparison.select}
          </span>
          <span className="hidden truncate text-[11px] leading-4 text-muted-foreground sm:block">{detail?.champion.title ?? t.comparison.empty}</span>
        </span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
      </button>
      {props.id && !detail && (
        <div role="status" className="mt-1 px-1 text-[11px] text-muted-foreground">
          {error ? (
            <>
              {t.app.loadError}
              <Button variant="outline" size="sm" onClick={retry} className="mt-2">
                {t.app.retry}
              </Button>
            </>
          ) : (
            t.championSelector.loading
          )}
        </div>
      )}
    </section>
  );
}

interface StatListProps {
  side: VsSideKey;
  detail: ChampionDetailV2;
  peer?: ChampionDetailV2;
  version: string;
}

/** One list per champion: label, level-1 value, per-level growth in its own column behind a hairline. */
export function VsStatList(props: StatListProps) {
  const { lang, t } = useTranslation();
  const stats = toChampionStats(props.detail);
  const peer = props.peer ? toChampionStats(props.peer) : undefined;
  const tone = (key: string) => {
    const own = stats[key];
    const other = peer?.[key];
    if (own === undefined || other === undefined || own === other) return "text-foreground";
    return own > other ? "font-semibold text-foreground" : "text-muted-foreground";
  };
  return (
    <div data-testid={"vs-" + props.side + "-stats"} className="min-w-0">
      <div className="grid grid-cols-[1fr_auto_5.5rem] items-center gap-x-3 border-b border-border pb-2 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-2">
          <img src={championIconUrl(props.version, props.detail.champion.id)} alt="" width={24} height={24} className="size-6 rounded shadow-none" />
          <span className="text-[13px] font-semibold text-foreground">{props.detail.champion.name}</span>
        </div>
        <span className="text-right">{t.comparison.statBase}</span>
        <span className="border-l border-border/60 pl-3 text-right">{t.comparison.statGrowth}</span>
      </div>
      <dl>
        {getStatFields(lang).map((field) => {
          const base = stats[field.key];
          const growth = field.growthKey ? stats[field.growthKey] : undefined;
          return (
            <div key={field.key} className="grid grid-cols-[1fr_auto_5.5rem] items-center gap-x-3 border-b border-border/50 py-2 last:border-b-0">
              <dt className="text-xs text-foreground/80">{field.label}</dt>
              <dd className={"text-right text-sm tabular-nums " + tone(field.key)} data-stat={field.key}>{base === undefined ? "—" : field.format(base)}</dd>
              <dd className="border-l border-border/60 pl-3 text-right text-xs tabular-nums text-muted-foreground" data-stat-growth={field.key}>{growth === undefined ? "—" : (field.growthFormat ?? field.format)(growth)}</dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
