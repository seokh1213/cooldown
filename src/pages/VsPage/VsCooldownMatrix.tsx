import { useRef, useState } from "react";
import type { AbilityV2, ChampionDetailV2 } from "@/data/contracts/championData";
import { TooltipProvider } from "@/components/ui/tooltip";
import { VsMatrixSkill } from "./VsMatrixSkill";
import { VsCooldownValue } from "./VsCooldownValue";
import { VsFormCooldown } from "./VsFormCooldown";
import { VsChampionHeader } from "./VsChampionColumn";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useTranslation } from "@/i18n";
import { VsAbilityBody } from "./VsAbilityRow";
import { ACTIVE_SLOTS, comparisonCooldownAtRank, cooldownRankCount, rankCooldowns } from "./vsCooldownTable";
import type { useVsChampion } from "./useVsWorkspace";
import type { VsSideKey } from "./vsState";

export interface MatrixSide {
  side: VsSideKey;
  id: string;
  detail?: ChampionDetailV2;
  result: ReturnType<typeof useVsChampion>;
}

/**
 * Rows are ranks, columns are two champion blocks of Q·W·E·R, the same grammar as the cooldown page.
 * The champion header is the first table row, so each champion sits directly above their own skills.
 */
export function VsCooldownMatrix({ sides, version, onSelect }: { sides: MatrixSide[]; version: string; onSelect: (side: VsSideKey) => void }) {
  const { t, lang } = useTranslation();
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const [selected, setSelected] = useState<{ ability: AbilityV2; name: string; slot: string }>();
  const columns = sides.flatMap(({ side, detail }) => ACTIVE_SLOTS.map((slot) => ({
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
  const peerIndex = (index: number) => (index + ACTIVE_SLOTS.length) % columns.length;
  const groupStart = (side: VsSideKey, slot: string) => side === "opponent" && slot === ACTIVE_SLOTS[0];
  const groupClass = (side: VsSideKey, slot: string) => (groupStart(side, slot) ? " border-l border-l-border/60" : "");
  const hasDetails = sides.some(({ detail }) => detail);
  // A/B legend under the table: one line per champion that has forms, unique (key, label) pairs in A→B order.
  const formLegend = (detail?: ChampionDetailV2) => {
    const labels = new Map<string, string>();
    for (const slot of ACTIVE_SLOTS) for (const form of detail?.champion.abilities[slot]?.forms ?? []) labels.set(form.key, form.label);
    return [...labels].sort(([a], [b]) => a.localeCompare(b));
  };
  return (
    <TooltipProvider delayDuration={150} skipDelayDuration={100}>
    <section aria-label={t.comparison.baseCooldowns}>
      <h2 className="mb-2 px-0.5 text-sm font-semibold tracking-tight">{t.comparison.baseCooldowns}</h2>
      <table className="w-full table-fixed border-separate border-spacing-0" aria-label={t.comparison.baseCooldowns}>
        <caption className="sr-only">{t.comparison.tableNote}</caption>
        <colgroup><col className="w-8 sm:w-14" />{columns.map((column) => <col key={column.side + column.slot} />)}</colgroup>
        <thead>
          <tr>
            {sides.map(({ side, id, result }, index) => (
              <th key={side} scope="colgroup" colSpan={ACTIVE_SLOTS.length + (index === 0 ? 1 : 0)} className={"border-b border-border pb-2 pt-px align-top font-normal " + (side === "opponent" ? "border-l border-l-border/60 pl-1.5 sm:pl-2" : "pr-1.5 sm:pr-2")}>
                <div id={"vs-header-" + side}>
                  <VsChampionHeader id={id} side={side} label={t.comparison[side]} version={version} result={result} onSelect={() => onSelect(side)} />
                </div>
              </th>
            ))}
          </tr>
          {hasDetails && <tr>
            <th scope="col" className="border-b border-border/60 px-1 text-left text-[11px] font-normal text-muted-foreground sm:px-2">{t.comparison.skill}</th>
            {columns.map(({ side, slot, name, ability }) => (
              <VsMatrixSkill key={side + slot} side={side} slot={slot} name={name} ability={ability} version={version} groupStart={groupStart(side, slot)} onSelect={(selectedAbility, trigger) => { returnFocus.current = trigger; setSelected({ ability: selectedAbility, name, slot }); }} />
            ))}
          </tr>}
        </thead>
        <tbody>
          {!hasDetails && (
            <tr><td colSpan={columns.length + 1} className="px-2 py-8 text-center text-xs text-muted-foreground">{t.comparison.empty}</td></tr>
          )}
          {hasDetails && Array.from({ length: rowCount }, (_, index) => (
            <tr key={index} data-rank-row={index + 1} className="hover:bg-muted/40">
              <th id={"vs-rank-" + (index + 1)} scope="row" className="border-b border-border/50 px-1 py-1 text-left text-xs font-normal tabular-nums text-muted-foreground sm:px-2">{index + 1}</th>
              {values.map(({ side, slot, ability, cooldowns, recharges }, columnIndex) => (
                <td key={side + slot} headers={"vs-rank-" + (index + 1) + " vs-" + side + "-" + slot} className={"border-b border-border/50 px-0.5 py-1 text-center align-middle" + groupClass(side, slot)}>
                  {ability?.forms ? <VsFormCooldown ability={ability} peer={values[peerIndex(columnIndex)]?.ability} rank={index + 1} side={side} slot={slot} format={formatter.format} /> : <VsCooldownValue value={cooldowns[index]} peer={comparisonCooldownAtRank(values[peerIndex(columnIndex)]?.ability, index + 1)} kind="cooldown" side={side} slot={slot} rank={index + 1} format={formatter.format} />}
                  {recharges[index] !== null && <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">{t.common.rechargeTime} <VsCooldownValue value={recharges[index]} peer={values[peerIndex(columnIndex)]?.recharges[index] ?? null} kind="recharge" side={side} slot={slot} rank={index + 1} format={formatter.format} /></span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {hasDetails && (
          <tfoot>
            <tr>
              {sides.map(({ side, detail }, index) => {
                const forms = formLegend(detail);
                return (
                  <td key={side} colSpan={ACTIVE_SLOTS.length + (index === 0 ? 1 : 0)} className={"pb-1 pt-2 text-[11px] leading-4 text-muted-foreground " + (side === "opponent" ? "border-l border-l-border/60 pl-1.5 sm:pl-2" : "pl-1 sm:pl-2")}>
                    {forms.length > 0 && (
                      <p data-form-labels data-side={side}>
                        <span className="mr-1.5 text-foreground/80">{detail?.champion.name}</span>
                        {forms.map(([key, label], formIndex) => (
                          <span key={key}>{formIndex > 0 && <span aria-hidden="true" className="mx-1.5 text-border">|</span>}<span className="mr-1 font-medium text-foreground/80">{key}</span>{label}</span>
                        ))}
                      </p>
                    )}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        )}
      </table>
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
