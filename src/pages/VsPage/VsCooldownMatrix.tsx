import { useRef, useState } from "react";
import type { AbilityV2, ChampionDetailV2 } from "@/data/contracts/championData";
import { TooltipProvider } from "@/components/ui/tooltip";
import { VsMatrixSkill } from "./VsMatrixSkill";
import { VsCooldownValue } from "./VsCooldownValue";
import { VsFormCooldown } from "./VsFormCooldown";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useTranslation } from "@/i18n";
import { VsAbilityBody } from "./VsAbilityRow";
import { ACTIVE_SLOTS, comparisonCooldownAtRank, cooldownRankCount, rankCooldowns } from "./vsCooldownTable";
import type { VsSideKey } from "./vsState";

export interface MatrixSide {
  side: VsSideKey;
  detail?: ChampionDetailV2;
}

export function VsCooldownMatrix({ sides, version }: { sides: MatrixSide[]; version: string }) {
  const { t, lang } = useTranslation();
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const [selected, setSelected] = useState<{ ability: AbilityV2; name: string; slot: string }>();
  const columns = ACTIVE_SLOTS.flatMap((slot) => sides.map(({ side, detail }) => ({
    side, slot, name: detail?.champion.name ?? t.comparison[side],
    ability: detail?.champion.abilities[slot],
  })));
  const rowCount = cooldownRankCount(columns.map(({ ability }) => ability));
  const formatter = new Intl.NumberFormat(lang.replace("_", "-"), { maximumFractionDigits: 3 });
  const values = columns.map((column) => ({
    ...column,
    cooldowns: rankCooldowns({ ability: column.ability, columns: rowCount, values: column.ability?.cooldownSeconds ?? [] }),
    recharges: rankCooldowns({ ability: column.ability, columns: rowCount, values: column.ability?.rechargeSeconds ?? [] }),
  }));
  return (
    <TooltipProvider delayDuration={150} skipDelayDuration={100}>
    <section className="mt-5" aria-label={t.comparison.baseCooldowns}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <h2 className="text-base font-semibold tracking-tight">{t.comparison.baseCooldowns} <span className="ml-1 text-xs font-normal text-muted-foreground">{t.comparison.seconds}</span></h2>
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><span aria-hidden="true" className="size-2 rounded-sm bg-emerald-500/40" />{t.comparison.shorter}</p>
      </div>
      <div role="region" aria-label={t.comparison.baseCooldowns} tabIndex={0} className="overflow-x-auto rounded-lg border border-border bg-white focus-visible:outline-2 focus-visible:outline-primary dark:bg-card" data-cooldown-scroll>
        <table className="w-full min-w-[860px] table-fixed border-separate border-spacing-0" aria-label={t.comparison.baseCooldowns}>
          <caption className="sr-only">{t.comparison.tableNote}</caption>
          <colgroup><col className="w-14" />{columns.map((column) => <col key={column.slot + column.side} />)}</colgroup>
          <thead>
            <tr className="bg-muted/50">
              <th rowSpan={2} scope="col" className="sticky left-0 z-10 break-keep border-b border-r border-border bg-card px-2 text-[11px] font-medium text-muted-foreground">{t.comparison.rank}</th>
              {ACTIVE_SLOTS.map((slot) => <th key={slot} scope="colgroup" colSpan={2} className="border-b border-r border-border py-1.5 text-sm font-semibold last:border-r-0">{slot}</th>)}
            </tr>
            <tr>
              {columns.map(({ side, slot, name, ability }) => (
                <VsMatrixSkill key={slot + side} side={side} slot={slot} name={name} ability={ability} version={version} onSelect={(selectedAbility, trigger) => { returnFocus.current = trigger; setSelected({ ability: selectedAbility, name, slot }); }} />
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rowCount }, (_, index) => (
              <tr key={index} data-rank-row={index + 1} className="group hover:bg-muted/50 [&:last-child>td]:border-b-0 [&:last-child>th]:border-b-0">
                <th id={"vs-rank-" + (index + 1)} scope="row" className="sticky left-0 z-10 border-b border-r border-border/50 bg-card px-2 py-2 text-xs font-medium text-muted-foreground">{index + 1}</th>
                {values.map(({ side, slot, ability, cooldowns, recharges }, columnIndex) => (
                  <td key={slot + side} headers={"vs-rank-" + (index + 1) + " vs-" + side + "-" + slot} className={"border-b border-border/50 px-1 py-2 text-center tabular-nums " + (side === "opponent" ? "border-r border-r-border last:border-r-0" : "")}>
                    {ability?.forms ? <VsFormCooldown ability={ability} peer={values[columnIndex ^ 1]?.ability} rank={index + 1} side={side} slot={slot} format={formatter.format} /> : <VsCooldownValue value={cooldowns[index]} peer={comparisonCooldownAtRank(values[columnIndex ^ 1]?.ability, index + 1)} kind="cooldown" side={side} slot={slot} rank={index + 1} format={formatter.format} />}
                    {recharges[index] !== null && <span className="mt-0.5 block text-[11px] text-muted-foreground">{t.common.rechargeTime} <VsCooldownValue value={recharges[index]} peer={values[columnIndex % 2 === 0 ? columnIndex + 1 : columnIndex - 1]?.recharges[index] ?? null} kind="recharge" side={side} slot={slot} rank={index + 1} format={formatter.format} /></span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-1 text-[11px] text-muted-foreground">
        <p>{t.comparison.cooldownNote} · {t.comparison.detailsHint}</p>
        <p className="lg:hidden">{t.comparison.scrollHint}</p>
      </div>
      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(undefined); }}>
        <DialogContent onCloseAutoFocus={(event) => { event.preventDefault(); returnFocus.current?.focus(); }} className="max-h-[85dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto">
          <DialogTitle className="pr-6 leading-normal">{selected?.name} · {selected?.slot} {selected?.ability.name}</DialogTitle>
          <DialogDescription>{t.comparison.details}</DialogDescription>
          {selected && <VsAbilityBody ability={selected.ability} />}
        </DialogContent>
      </Dialog>
    </section>
    </TooltipProvider>
  );
}
