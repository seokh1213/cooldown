import { Fragment, useRef, useState, type ReactNode } from "react";
import type { AbilityV2, ChampionDetailV2 } from "@/data/contracts/championData";
import { TooltipProvider } from "@/components/ui/tooltip";
import { VsMatrixSkill, VsSkillContent } from "./VsMatrixSkill";
import { VsCooldownValue } from "./VsCooldownValue";
import { VsFormCooldown } from "./VsFormCooldown";
import { VsChampionHeader } from "./VsChampionColumn";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useTranslation } from "@/i18n";
import { ScrollArea } from "@/components/ui/scroll-area";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { useDeviceType } from "@/hooks/useDeviceType";
import { ACTIVE_SLOTS, comparisonCooldownAtRank, cooldownRankCount, rankCooldowns, slotOffsetClass } from "./vsCooldownTable";
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
export function VsCooldownMatrix({ sides, version, onSelect, actions }: { sides: MatrixSide[]; version: string; onSelect: (side: VsSideKey) => void; actions?: ReactNode }) {
  const isMobile = useDeviceType() === "mobile";
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
   *   내 4열 | 레벨 열 32 | 상대 4열
   *
   * 레벨 숫자는 그 빈 열 안에 둔다. 예전에는 왼쪽 끝에 순위 열을 두고 오른쪽 끝에
   * 빈 열을 세워 폭만 맞췄는데, 왼쪽 카드 안에는 숫자가 들어가고 오른쪽 카드 안에는
   * 빈 칸이 들어가 아이콘 정렬이 어긋나 보였다. 숫자 하나가 양쪽을 다 가리키니
   * 가운데가 제자리다. 두 카드는 정확히 스킬 4열씩만 덮는다.
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
      <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
        <h2 className="text-sm font-semibold tracking-tight">{t.comparison.baseCooldowns}</h2>
        {actions}
      </div>
      <table className="w-full table-fixed border-separate border-spacing-0 [--vs-icon:1.75rem] sm:[--vs-icon:2rem]" aria-label={t.comparison.baseCooldowns}>
        <caption className="sr-only">{t.comparison.tableNote}</caption>
        <colgroup>
          {columns.slice(0, ACTIVE_SLOTS.length).map((column) => <col key={column.side + column.slot} />)}
          <col className="w-7 sm:w-8" />
          {columns.slice(ACTIVE_SLOTS.length).map((column) => <col key={column.side + column.slot} />)}
        </colgroup>
        <thead>
          <tr>
            {sides.map(({ side, id, result }, index) => (
              <Fragment key={side}>
                {index === 1 && <th aria-hidden="true" />}
                <th scope="colgroup" colSpan={ACTIVE_SLOTS.length} className="border-b border-border pb-2 pt-px align-top font-normal">
                  <div id={"vs-header-" + side}>
                    <VsChampionHeader id={id} side={side} label={t.comparison[side]} version={version} result={result} onSelect={() => onSelect(side)} />
                  </div>
                </th>
              </Fragment>
            ))}
          </tr>
          {hasDetails && <tr>
            {columns.map(({ side, slot, name, championId, ability }, index) => (
              <Fragment key={side + slot}>
                {index === ACTIVE_SLOTS.length && <th scope="col" className="border-b border-border/60 px-0 text-center align-bottom text-[11px] font-normal text-muted-foreground">{t.comparison.levelColumn}</th>}
                <VsMatrixSkill side={side} slot={slot} name={name} championId={championId} ability={ability} version={version} boxClass={slotOffsetClass(index)} mobile={isMobile} onSelect={(selectedAbility, trigger) => { returnFocus.current = trigger; setSelected({ ability: selectedAbility, name, slot }); }} />
              </Fragment>
            ))}
          </tr>}
        </thead>
        <tbody>
          {!hasDetails && (
            <tr><td colSpan={columns.length + 1} className="px-2 py-8 text-center text-xs text-muted-foreground">{t.comparison.empty}</td></tr>
          )}
          {hasDetails && Array.from({ length: rowCount }, (_, index) => (
            <tr key={index} data-rank-row={index + 1} className="hover:bg-muted/40">
              {values.map(({ side, slot, ability, cooldowns, recharges }, columnIndex) => (
                <Fragment key={side + slot}>
                {columnIndex === ACTIVE_SLOTS.length && <th id={"vs-rank-" + (index + 1)} scope="row" className="border-b border-border/50 px-0 py-1 text-center align-middle text-xs font-normal tabular-nums text-muted-foreground">{index + 1}</th>}
                <td headers={"vs-rank-" + (index + 1) + " vs-" + side + "-" + slot} className="border-b border-border/50 px-0.5 py-1 text-center align-middle">
                  <div className={slotOffsetClass(columnIndex)}>
                  {ability?.forms ? <VsFormCooldown ability={ability} peer={values[peerIndex(columnIndex)]?.ability} rank={index + 1} side={side} slot={slot} format={formatter.format} /> : <VsCooldownValue value={cooldowns[index]} peer={comparisonCooldownAtRank(values[peerIndex(columnIndex)]?.ability, index + 1)} kind="cooldown" side={side} slot={slot} rank={index + 1} format={formatter.format} />}
                  {recharges[index] !== null && <span className="mt-0.5 block whitespace-nowrap text-[11px] leading-4 text-muted-foreground"><span className="sm:hidden">{t.common.rechargeShort}</span><span className="hidden sm:inline">{t.common.rechargeTime}</span> <VsCooldownValue value={recharges[index]} peer={values[peerIndex(columnIndex)]?.recharges[index] ?? null} kind="recharge" side={side} slot={slot} rank={index + 1} format={formatter.format} /></span>}
                  </div>
                </td>
                </Fragment>
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
                  <Fragment key={side}>
                  {index === 1 && <td aria-hidden="true" />}
                  <td colSpan={ACTIVE_SLOTS.length} className="pb-1 pt-2 pl-1 text-[11px] leading-4 text-muted-foreground sm:pl-2">
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
        {/* 쿨타임 화면의 스킬 대화창(`SkillTooltip`)과 같은 크기·속. 제목은 속의 머리에 있으니 읽어 주기만 한다. */}
        <DialogContent onCloseAutoFocus={(event) => { event.preventDefault(); returnFocus.current?.focus(); }} className={(isMobile ? "h-[70vh] max-h-[70vh] w-[calc(100vw-32px)] max-w-lg" : "h-[80vh] max-h-[80vh] w-full max-w-3xl") + " flex flex-col overflow-hidden rounded-xl p-0"}>
          <VisuallyHidden>
            <DialogTitle>{selected?.name} · {selected?.slot} {selected?.ability.name}</DialogTitle>
            <DialogDescription>{t.comparison.details}</DialogDescription>
          </VisuallyHidden>
          <ScrollArea className="min-h-0 flex-1">
            <div data-ability-body className="flex flex-col gap-3 p-4">
              {selected && <VsSkillContent ability={selected.ability} slot={selected.slot} version={version} mobile={isMobile} />}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </section>
    </TooltipProvider>
  );
}
