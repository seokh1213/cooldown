import type { AbilityV2 } from "@/data/contracts/championData";
import type { VsSideKey } from "./vsState";
import { VsCooldownValue } from "./VsCooldownValue";
import { formCooldownAtRank, comparisonCooldownAtRank } from "./vsCooldownTable";

/** Two forms stack in one cell, A above B, the same order as the split icon. */
export function VsFormCooldown(props: {
  ability: AbilityV2; peer?: AbilityV2; rank: number;
  side: VsSideKey; slot: string; format: (value: number) => string;
}) {
  const forms = props.ability.forms?.map((form) => ({ form, value: formCooldownAtRank(props.ability, form, props.rank) })) ?? [];
  if (forms.every(({ value }) => value === null)) {
    return <VsCooldownValue value={null} peer={null} kind="cooldown" side={props.side} slot={props.slot} rank={props.rank} format={props.format} />;
  }
  // Both lines share the parent grid columns (subgrid), so keys align in one column and digits in another.
  return <div className="mx-auto grid w-fit grid-cols-[auto_auto] gap-x-1">
    {forms.map(({ form, value }) => <span key={form.key} data-form-cooldown={form.key} title={form.label} className="col-span-2 grid h-[17px] grid-cols-subgrid items-center whitespace-nowrap leading-[17px] [&>[data-cooldown]]:min-w-[2ch] [&>[data-cooldown]]:text-right [&>[data-cooldown]]:text-[12px] [&>[data-cooldown]]:leading-[17px] sm:[&>[data-cooldown]]:text-[13px]">
      <span className="text-left text-[9px] leading-none text-muted-foreground sm:text-[10px]">{form.key}</span>
      <VsCooldownValue value={value} peer={comparisonCooldownAtRank(props.peer, props.rank, form.key)} kind="cooldown" side={props.side} slot={props.slot} rank={props.rank} format={props.format} />
    </span>)}
  </div>;
}
