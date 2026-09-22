import { Fragment, useRef, useState } from "react";
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
    championId: detail?.champion.id ?? "",
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
  /*
   * 두 챔피언을 **빈 열**로 가른다.
   *
   * 여기까지 오는 데 세 번 헛짚었다. 처음에는 세로선을 지웠고, 다음에는 칸 안쪽
   * 여백을 넓혔고, 그다음에는 좌우 폭을 맞췄다. 좌표로는 다 맞는데 눈에는 계속
   * 어긋나 보였다. 정작 봐야 할 것은 **가로 구분선**이었다.
   *
   * 아래 두 구역은 블록이 둘이라 줄 밑줄이 772 에서 끊기고 804 에서 다시
   * 시작한다. 가운데에 빈 통로가 보인다. 이 표는 한 덩어리라 밑줄이 412 에서
   * 1164 까지 끊김 없이 지나간다. 그래서 두 챔피언이 갈려 보이지 않았다.
   *
   * 칸 안쪽 여백으로는 이 선을 끊을 수 없다. 테두리는 여백까지 포함해 그어진다.
   * 그러니 가운데에 밑줄을 긋지 않는 빈 열을 세운다. 아래 구역의 `gap-x-8` 과
   * 같은 32px 다.
   *
   *   순위 32 | 내 4열 | 빈 열 32 | 상대 4열 | 빈 열 32
   *
   * 양 끝 빈 열이 순위 열과 짝이 되어 가운데가 정중앙에 온다. 밑줄은 순위 열과
   * 오른쪽 빈 열까지 이어지므로 아래 블록과 좌우 끝이 같아진다.
   */
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
        <colgroup>
          <col className="w-8" />
          {columns.slice(0, ACTIVE_SLOTS.length).map((column) => <col key={column.side + column.slot} />)}
          <col className="w-2 sm:w-8" />
          {columns.slice(ACTIVE_SLOTS.length).map((column) => <col key={column.side + column.slot} />)}
          <col className="w-0 sm:w-8" />
        </colgroup>
        <thead>
          <tr>
            {sides.map(({ side, id, result }, index) => (
              <Fragment key={side}>
                {index === 1 && <th aria-hidden="true" />}
                <th scope="colgroup" colSpan={ACTIVE_SLOTS.length + 1} className="border-b border-border pb-2 pt-px align-top font-normal">
                  <div id={"vs-header-" + side}>
                    <VsChampionHeader id={id} side={side} label={t.comparison[side]} version={version} result={result} onSelect={() => onSelect(side)} />
                  </div>
                </th>
              </Fragment>
            ))}
          </tr>
          {hasDetails && <tr>
            <th scope="col" className="border-b border-border/60 px-1 text-left text-[11px] font-normal text-muted-foreground">{t.comparison.skill}</th>
            {columns.map(({ side, slot, name, championId, ability }, index) => (
              <Fragment key={side + slot}>
                {index === ACTIVE_SLOTS.length && <td aria-hidden="true" className="p-0" />}
                <VsMatrixSkill side={side} slot={slot} name={name} championId={championId} ability={ability} version={version} onSelect={(selectedAbility, trigger) => { returnFocus.current = trigger; setSelected({ ability: selectedAbility, name, slot }); }} />
              </Fragment>
            ))}
            <td className="border-b border-border/60 p-0" />
          </tr>}
        </thead>
        <tbody>
          {!hasDetails && (
            <tr><td colSpan={columns.length + 3} className="px-2 py-8 text-center text-xs text-muted-foreground">{t.comparison.empty}</td></tr>
          )}
          {hasDetails && Array.from({ length: rowCount }, (_, index) => (
            <tr key={index} data-rank-row={index + 1} className="hover:bg-muted/40">
              <th id={"vs-rank-" + (index + 1)} scope="row" className="border-b border-border/50 px-1 py-1 text-left text-xs font-normal tabular-nums text-muted-foreground">{index + 1}</th>
              {values.map(({ side, slot, ability, cooldowns, recharges }, columnIndex) => (
                <Fragment key={side + slot}>
                {columnIndex === ACTIVE_SLOTS.length && <td aria-hidden="true" className="p-0" />}
                <td headers={"vs-rank-" + (index + 1) + " vs-" + side + "-" + slot} className="border-b border-border/50 px-0.5 py-1 text-center align-middle">
                  {ability?.forms ? <VsFormCooldown ability={ability} peer={values[peerIndex(columnIndex)]?.ability} rank={index + 1} side={side} slot={slot} format={formatter.format} /> : <VsCooldownValue value={cooldowns[index]} peer={comparisonCooldownAtRank(values[peerIndex(columnIndex)]?.ability, index + 1)} kind="cooldown" side={side} slot={slot} rank={index + 1} format={formatter.format} />}
                  {recharges[index] !== null && <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">{t.common.rechargeTime} <VsCooldownValue value={recharges[index]} peer={values[peerIndex(columnIndex)]?.recharges[index] ?? null} kind="recharge" side={side} slot={slot} rank={index + 1} format={formatter.format} /></span>}
                </td>
                </Fragment>
              ))}
              <td className="border-b border-border/50 p-0" />
            </tr>
          ))}
        </tbody>
        {hasDetails && (
          <tfoot>
            <tr>
              {sides.map(({ side, detail }, index) => {
                const forms = formLegend(detail);
                return (
                  <Fragment key={side}>
                  {index === 1 && <td aria-hidden="true" />}
                  <td colSpan={ACTIVE_SLOTS.length + 1} className="pb-1 pt-2 pl-1 text-[11px] leading-4 text-muted-foreground sm:pl-2">
                    {forms.length > 0 && (
                      <p data-form-labels data-side={side}>
                        <span className="mr-1.5 text-foreground/80">{detail?.champion.name}</span>
                        {forms.map(([key, label], formIndex) => (
                          <span key={key}>{formIndex > 0 && <span aria-hidden="true" className="mx-1.5 text-border">|</span>}<span className="mr-1 font-medium text-foreground/80">{key}</span>{label}</span>
                        ))}
                      </p>
                    )}
                  </td>
                  </Fragment>
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
