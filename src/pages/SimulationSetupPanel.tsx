import { Plus } from "lucide-react";
import { Select } from "@/components/ui/select";
import { championIconUrl, itemIconUrl } from "@/data/assets/riotAssetUrls";
import { useTranslation } from "@/i18n";
import type { Champion } from "@/types";
import type { NormalizedItem } from "@/types/combatNormalized";
import type { SimpleStats } from "./SimulationPage.damageUtils";

function StatRow(props: { label: string; value: number; base: number; precision?: number }) {
  const display = (value: number) => props.precision
    ? value.toFixed(props.precision)
    : Math.round(value).toString();
  const delta = props.value - props.base;
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/35 py-1.5 last:border-0">
      <span className="text-[11px] text-muted-foreground">{props.label}</span>
      <span className="text-xs font-medium tabular-nums">
        {display(props.value)}
        {Math.abs(delta) > 0.01 && (
          <small className="ml-1 text-emerald-600 dark:text-emerald-400">+{display(delta)}</small>
        )}
      </span>
    </div>
  );
}

interface SimulationSetupPanelProps {
  champion: Champion | null;
  ddragonVersion: string;
  level: number;
  items: (NormalizedItem | null)[];
  selectedItemCount: number;
  baseStats: SimpleStats | null;
  finalStats: SimpleStats | null;
  onSelectChampion: () => void;
  onLevelChange: (level: number) => void;
  onSelectItem: (slot: number) => void;
}

export function SimulationSetupPanel(props: SimulationSetupPanelProps) {
  const { t } = useTranslation();
  const aaDps = props.finalStats
    ? props.finalStats.attackDamage * props.finalStats.attackSpeed
    : null;
  return (
    <section className="grid gap-8 py-2 md:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
      <div className="grid gap-5 sm:grid-cols-[7rem_minmax(0,1fr)]">
        <button
          type="button"
          onClick={props.onSelectChampion}
          aria-label={t.pages.simulation.selectChampionAria}
          className="group relative aspect-[4/5] w-28 overflow-hidden rounded-lg border border-border bg-muted text-left transition-[border-color,transform] hover:-translate-y-0.5 hover:border-primary"
        >
          {props.champion ? (
            <img src={championIconUrl(props.ddragonVersion, props.champion.id)} alt={props.champion.name} className="size-full object-cover" />
          ) : (
            <span className="flex size-full flex-col items-center justify-center gap-2 px-3 text-center text-[10px] font-medium text-muted-foreground">
              <Plus aria-hidden="true" className="size-5" />
              {t.pages.simulation.championPlaceholder}
            </span>
          )}
          {props.champion && <span className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/85 to-transparent px-2 pb-2 pt-8 text-xs font-semibold text-white">{props.champion.name}</span>}
        </button>

        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t.pages.simulation.statsTitle}</h2>
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
              {t.common.level}
              <Select aria-label={t.pages.simulation.attackerLevelLabel} value={String(props.level)} onChange={(event) => props.onLevelChange(Number(event.target.value))} className="h-9 w-20">
                {Array.from({ length: 18 }, (_, index) => index + 1).map((level) => <option key={level} value={level}>{level}</option>)}
              </Select>
            </label>
          </div>
          {!props.finalStats || !props.baseStats ? (
            <p className="border-t border-border/60 py-4 text-xs leading-relaxed text-muted-foreground">{t.pages.simulation.statsPlaceholderLine1}<br />{t.pages.simulation.statsPlaceholderLine2}</p>
          ) : (
            <div className="border-y border-border/60">
              <StatRow label={t.stats.health} value={props.finalStats.health} base={props.baseStats.health} />
              <StatRow label={t.stats.attackDamage} value={props.finalStats.attackDamage} base={props.baseStats.attackDamage} />
              <StatRow label={t.stats.abilityPower} value={props.finalStats.abilityPower} base={props.baseStats.abilityPower} />
              <StatRow label={t.stats.armor} value={props.finalStats.armor} base={props.baseStats.armor} />
              <StatRow label={t.stats.magicResist} value={props.finalStats.magicResist} base={props.baseStats.magicResist} />
              {aaDps !== null && <StatRow label={t.pages.simulation.aaDpsLabel} value={aaDps} base={aaDps} precision={1} />}
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t.pages.simulation.itemsTitle}</h2>
          <span className="text-[10px] text-muted-foreground">{props.selectedItemCount} / 6</span>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {props.items.map((item, index) => (
            <button
              key={index}
              type="button"
              onClick={() => props.onSelectItem(index)}
              aria-label={item?.name ?? `${t.pages.simulation.itemsTitle} ${index + 1}`}
              className="group aspect-square overflow-hidden rounded-md border border-border bg-muted/30 transition-[border-color,transform,background-color] hover:-translate-y-0.5 hover:border-primary hover:bg-primary/5"
            >
              {item ? (
                <img src={itemIconUrl(props.ddragonVersion, item.id)} alt={item.name} className="size-full object-cover" />
              ) : (
                <span className="flex size-full items-center justify-center text-muted-foreground group-hover:text-primary"><Plus aria-hidden="true" className="size-4" /></span>
              )}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
