import { useMemo } from "react";
import { useTranslation } from "@/i18n";
import type { DataLocale, StaticDataSources } from "@/data/contracts/staticData";
import { VsStatList } from "./VsChampionColumn";
import { VsSkillList } from "./VsAbilityRow";
import { VsCooldownMatrix } from "./VsCooldownMatrix";
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

/** Cooldowns first, then stats, then every ability spelled out: the order a laner asks the questions in. */
export function VsComparison(props: ComparisonProps) {
  const { t } = useTranslation();
  const identity = useMemo(
    () => ({ patchVersion: props.patchVersion, sources: props.sources }),
    [props.patchVersion, props.sources],
  );
  const mine = useVsChampion({ id: props.state.mine.id, identity, locale: props.locale });
  const opponent = useVsChampion({ id: props.state.opponent.id, identity, locale: props.locale });
  const results = { mine, opponent };
  const sides = SIDES.map((side) => ({ side, id: props.state[side].id, detail: results[side].detail, result: results[side] }));
  const hasDetails = Boolean(mine.detail || opponent.detail);
  const version = props.sources.ddragon;
  return (
    <div>
      <VsCooldownMatrix key={props.state.mine.id + ":" + props.state.opponent.id + ":" + props.locale} sides={sides} version={version} onSelect={props.onSelect} />
      {hasDetails && (
        <>
          <section className="mt-8" aria-label={t.comparison.baseStats}>
            <h2 className="mb-3 px-0.5 text-sm font-semibold tracking-tight">{t.comparison.baseStats}</h2>
            <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
              {sides.map(({ side, detail }, index) => detail
                ? <VsStatList key={side} side={side} detail={detail} peer={sides[1 - index].detail} version={version} />
                : <div key={side} className="hidden sm:block" />)}
            </div>
          </section>
          <section className="mt-8" aria-label={t.comparison.skillDetails}>
            <h2 className="mb-3 px-0.5 text-sm font-semibold tracking-tight">{t.comparison.skillDetails}</h2>
            <div className="grid gap-x-8 sm:grid-cols-2">
              {sides.map(({ side, detail }) => detail && <VsSkillList key={side + detail.champion.id} side={side} detail={detail} version={version} />)}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
