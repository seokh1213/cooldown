import { useMemo } from "react";
import { useTranslation } from "@/i18n";
import type { DataLocale, StaticDataSources } from "@/data/contracts/staticData";
import { VsBaseStats, VsChampionHeader } from "./VsChampionColumn";
import { VsAbilityCell } from "./VsAbilityRow";
import { VsCooldownMatrix } from "./VsCooldownMatrix";
import { VsCooldownNotes } from "./VsCooldownNotes";
import { useVsChampion } from "./useVsWorkspace";
import type { VsSideKey, VsState } from "./vsState";

interface ComparisonProps {
  state: VsState;
  patchVersion: string;
  sources: StaticDataSources;
  locale: DataLocale;
  onSelect: (side: VsSideKey) => void;
}

const SIDES = ["mine", "opponent"] as const;

export function VsComparison(props: ComparisonProps) {
  const { t } = useTranslation();
  const identity = useMemo(
    () => ({ patchVersion: props.patchVersion, sources: props.sources }),
    [props.patchVersion, props.sources],
  );
  const mine = useVsChampion({ id: props.state.mine.id, identity, locale: props.locale });
  const opponent = useVsChampion({ id: props.state.opponent.id, identity, locale: props.locale });
  const results = { mine, opponent };
  const sides = SIDES.map((side) => ({ side, detail: results[side].detail }));
  const hasDetails = Boolean(mine.detail || opponent.detail);
  return (
    <div>
      <div className="sticky top-[60px] z-20 grid grid-cols-2 rounded-lg border border-border bg-white dark:bg-card">
        {SIDES.map((side) => (
          <div key={side} id={"vs-header-" + side} className="min-w-0 p-2 first:border-r first:border-border sm:px-3">
            <VsChampionHeader
              id={props.state[side].id} side={side} label={t.comparison[side]}
              version={props.sources.ddragon} result={results[side]}
              onSelect={() => props.onSelect(side)}
            />
          </div>
        ))}
      </div>
      {hasDetails && (
        <>
          <section className="mt-4" aria-label={t.comparison.passive}>
            <h2 className="mb-2 text-xs font-semibold text-muted-foreground">{t.comparison.passive}</h2>
            <div className="grid gap-4 sm:grid-cols-2 sm:gap-8">
              {sides.map(({ side, detail }) => (
                <div key={side + props.state[side].id} className="min-w-0">
                  <VsAbilityCell side={side} slot="P" championName={detail?.champion.name ?? t.comparison[side]} ability={detail?.champion.abilities.P} version={props.sources.ddragon} />
                </div>
              ))}
            </div>
          </section>
          <VsCooldownMatrix key={props.state.mine.id + ":" + props.state.opponent.id + ":" + props.locale} sides={sides} version={props.sources.ddragon} />
          <VsCooldownNotes sides={sides} />
          <section className="mt-6" aria-label={t.comparison.baseStats}>
            <h2 className="text-sm font-semibold">{t.comparison.baseStats} <span className="ml-1 text-xs font-normal text-muted-foreground">{t.comparison.baseGrowth}</span></h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t.comparison.growthNote}</p>
            <div className="mt-2 grid grid-cols-2 gap-4 sm:gap-8">
              {sides.map(({ side, detail }) => <div key={side} className="min-w-0">{detail && <VsBaseStats detail={detail} />}</div>)}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
