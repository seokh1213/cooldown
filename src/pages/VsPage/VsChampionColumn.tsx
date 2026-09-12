import { toChampionStats } from "@/data/mappers/championMapper";
import { getStatFields } from "@/components/features/ChampionComparison/constants";
import { ChampionStatValue } from "@/components/features/ChampionComparison/ChampionStatValue";
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

export function VsChampionHeader(props: ChampionHeaderProps) {
  const { t } = useTranslation();
  const { detail, error, retry } = props.result;
  return (
    <section className="min-w-0" aria-label={props.label}>
      <button
        type="button"
        onClick={props.onSelect}
        aria-label={props.label + " " + t.comparison.select}
        className="group flex min-h-14 w-full items-center gap-2 rounded-md px-1 text-left hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-primary sm:gap-3 sm:px-2"
      >
        {props.id ? (
          <img
            key={props.id}
            src={championIconUrl(props.version, props.id)}
            alt=""
            width={48}
            height={48}
            className="size-10 shrink-0 rounded-md sm:size-12"
          />
        ) : (
          <span className="flex size-10 shrink-0 items-center justify-center rounded border border-dashed border-border bg-muted/30">
            <Plus aria-hidden="true" className="size-5 text-muted-foreground" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className={"mb-0.5 block text-[11px] font-medium " + (props.side === "mine" ? "text-blue-700 dark:text-blue-300" : "text-rose-700 dark:text-rose-300")}>
            {props.label}
          </span>
          <span className="block break-words text-sm font-semibold group-hover:text-primary sm:text-lg">
            {detail?.champion.name ?? t.comparison.select}
          </span>
        </span>
        <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      </button>
      {!props.id && (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {t.comparison.empty}
        </p>
      )}
      {props.id && !detail && (
        <div role="status" className="mt-3 text-xs text-muted-foreground">
          {error ? (
            <>
              {t.app.loadError}
              <Button
                variant="outline"
                size="sm"
                onClick={retry}
                className="mt-3"
              >
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

export function VsBaseStats({ detail }: { detail: ChampionDetailV2 }) {
  const { lang } = useTranslation();
  const stats = toChampionStats(detail);
  return (
    <div className="py-3">
      <h3 className="mb-2 text-xs font-semibold">{detail.champion.name}</h3>
      <dl>
        {getStatFields(lang).map((field) => (
          <div key={field.key} className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 border-b border-border/40 py-2 text-xs sm:text-sm">
            <dt className="text-muted-foreground">{field.label}</dt>
            <dd><ChampionStatValue field={field} stats={stats} /></dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
